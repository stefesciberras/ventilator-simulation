from pathlib import Path

path = Path('src/components/SessionPanel.tsx')
text = path.read_text()

import_anchor = "import { QRCodeSVG } from 'qrcode.react'\n"
invite_import = "import { CandidateInvitation } from './CandidateInvitation'\n"
if invite_import not in text:
    if import_anchor not in text:
        raise SystemExit('Could not find QRCode import anchor')
    text = text.replace(import_anchor, import_anchor + invite_import, 1)

text = text.replace("version.textContent = 'v0.72'", "version.textContent = 'v0.73'", 1)

share_anchor = "              <small>Scan the QR code or enter this key manually.</small>\n"
share_insert = (
    share_anchor
    + "              {candidateJoinUrl && session?.session_key && (\n"
    + "                <CandidateInvitation sessionKey={session.session_key} joinUrl={candidateJoinUrl} />\n"
    + "              )}\n"
)
if '<CandidateInvitation sessionKey={session.session_key}' not in text:
    if share_anchor not in text:
        raise SystemExit('Could not find candidate share card anchor')
    text = text.replace(share_anchor, share_insert, 1)

path.write_text(text)
