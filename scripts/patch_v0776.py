from pathlib import Path


def replace_all_exact(path: str, old: str, new: str, expected: int) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"Expected {expected} matches in {path}, found {count}: {old!r}")
    p.write_text(text.replace(old, new))


def replace_once(path: str, old: str, new: str) -> None:
    replace_all_exact(path, old, new, 1)

replace_once(
    'src/appVersion.ts',
    "export const APP_VERSION = '0.77.5'\n",
    "export const APP_VERSION = '0.77.6'\n",
)

replace_once(
    'src/components/SessionPanel.tsx',
    '<CandidateInvitation sessionKey={session.session_key} joinUrl={candidateJoinUrl} />',
    '<CandidateInvitation sessionId={session.id} sessionKey={session.session_key} joinUrl={candidateJoinUrl} />',
)

print('v0.77.6 Brevo invitation wiring applied')
