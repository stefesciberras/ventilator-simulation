from pathlib import Path
p=Path('src/account.css')
s=p.read_text()
marker='\\n\\n/* v0.82 dynamic scenario file-manager builder */'
i=s.find(marker)
if i < 0:
    raise SystemExit('builder css marker not found')
s=s[:i] + s[i:].replace('\\n','\n')
p.write_text(s)
