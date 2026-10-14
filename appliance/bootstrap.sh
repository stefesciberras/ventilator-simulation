#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_ROOT="${EDUVENT_INSTALL_ROOT:-/opt/eduvent}"
SUPABASE_ROOT="$INSTALL_ROOT/supabase"
SUPABASE_DOCKER="$SUPABASE_ROOT/docker"
APP_ENV="$REPO_DIR/appliance/.env"

for command in docker git python3 openssl; do
  command -v "$command" >/dev/null 2>&1 || { echo "Missing required command: $command" >&2; exit 1; }
done

docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required." >&2; exit 1; }

mkdir -p "$INSTALL_ROOT"
if [[ ! -d "$SUPABASE_ROOT/.git" ]]; then
  echo "Fetching the official Supabase self-hosted Docker stack..."
  git clone --depth 1 --filter=blob:none --sparse https://github.com/supabase/supabase.git "$SUPABASE_ROOT"
  git -C "$SUPABASE_ROOT" sparse-checkout set docker
else
  echo "Updating existing Supabase checkout..."
  git -C "$SUPABASE_ROOT" pull --ff-only
fi

if [[ ! -f "$SUPABASE_DOCKER/.env" ]]; then
  cp "$SUPABASE_DOCKER/.env.example" "$SUPABASE_DOCKER/.env"
fi

python3 - "$SUPABASE_DOCKER/.env" "$APP_ENV" <<'PY'
import base64, hashlib, hmac, json, os, secrets, sys, time
from pathlib import Path

supabase_env = Path(sys.argv[1])
app_env = Path(sys.argv[2])
text = supabase_env.read_text()


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip('=')


def jwt(secret: str, role: str) -> str:
    now = int(time.time())
    header = b64url(json.dumps({'alg': 'HS256', 'typ': 'JWT'}, separators=(',', ':')).encode())
    payload = b64url(json.dumps({'role': role, 'iss': 'supabase', 'iat': now, 'exp': now + 315360000}, separators=(',', ':')).encode())
    body = f'{header}.{payload}'
    signature = b64url(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())
    return f'{body}.{signature}'


def read_value(name: str):
    prefix = name + '='
    for line in text.splitlines():
        if line.startswith(prefix):
            return line[len(prefix):]
    return None


def replace(name: str, value: str):
    global text
    lines = text.splitlines()
    prefix = name + '='
    replaced = False
    out = []
    for line in lines:
        if line.startswith(prefix):
            out.append(prefix + value)
            replaced = True
        else:
            out.append(line)
    if not replaced:
        out.append(prefix + value)
    text = '\n'.join(out) + '\n'

jwt_secret = read_value('JWT_SECRET')
if not jwt_secret or jwt_secret.startswith('your-') or len(jwt_secret) < 32:
    jwt_secret = secrets.token_urlsafe(48)
replace('JWT_SECRET', jwt_secret)

postgres_password = read_value('POSTGRES_PASSWORD')
if not postgres_password or postgres_password.startswith('your-'):
    postgres_password = secrets.token_urlsafe(32)
replace('POSTGRES_PASSWORD', postgres_password)

anon = jwt(jwt_secret, 'anon')
service = jwt(jwt_secret, 'service_role')
replace('ANON_KEY', anon)
replace('SERVICE_ROLE_KEY', service)
replace('SITE_URL', 'http://eduvent.local:4173')
replace('API_EXTERNAL_URL', 'http://eduvent.local:8000')
replace('SUPABASE_PUBLIC_URL', 'http://eduvent.local:8000')
replace('ENABLE_ANONYMOUS_USERS', 'true')
replace('DASHBOARD_USERNAME', 'eduvent')
if not read_value('DASHBOARD_PASSWORD') or read_value('DASHBOARD_PASSWORD').startswith('your-'):
    replace('DASHBOARD_PASSWORD', secrets.token_urlsafe(24))

supabase_env.write_text(text)
app_env.write_text(
    'EDUVENT_SUPABASE_URL=http://eduvent.local:8000\n'
    f'EDUVENT_SUPABASE_ANON_KEY={anon}\n'
)
print('Configured local Supabase keys and EDUVENT build environment.')
PY

echo "Starting local Supabase..."
docker compose --env-file "$SUPABASE_DOCKER/.env" -f "$SUPABASE_DOCKER/docker-compose.yml" up -d

echo "Waiting for local Postgres..."
for attempt in $(seq 1 90); do
  if docker exec supabase-db pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == "90" ]]; then
    echo "Supabase Postgres did not become ready." >&2
    exit 1
  fi
  sleep 2
done

echo "Applying EDUVENT database migrations..."
for migration in "$REPO_DIR"/supabase/migrations/*.sql; do
  echo "  $(basename "$migration")"
  docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$migration"
done

echo "Building and starting EDUVENT web + WebSocket relay..."
docker compose --env-file "$APP_ENV" -f "$REPO_DIR/appliance/docker-compose.yml" up -d --build

cat <<EOF

EDUVENT appliance services are starting.

App:      http://eduvent.local:4173/?runtimeProfile=appliance
Supabase: http://eduvent.local:8000
Studio:   http://eduvent.local:8000 (through the self-hosted gateway configuration)

If your network does not resolve eduvent.local, use the Raspberry Pi's LAN IP instead and append:
  ?runtimeProfile=appliance

The generated local credentials are stored on the appliance in:
  $SUPABASE_DOCKER/.env
Do not publish or commit that file.
EOF
