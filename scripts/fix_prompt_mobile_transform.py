from pathlib import Path
p = Path('src/teaching/teaching.css')
s = p.read_text()
s += '''\n@media (max-width: 899px) {
  .teaching-prompt-modal { transform: none !important; }
}
'''
p.write_text(s)
