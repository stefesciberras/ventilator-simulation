from pathlib import Path


def replace(path: str, old: str, new: str, expected: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    if actual != expected:
        raise SystemExit(f"{path}: expected {expected} occurrence(s), found {actual}: {old[:180]!r}")
    p.write_text(text.replace(old, new))

css = 'src/account.css'
replace(css,
    ".scenario-card-actions { display: flex; flex-wrap: wrap; gap: 6px; }\n.scenario-card-actions button { padding: 6px 9px; font-size: 9px; }\n",
    ".scenario-card-view { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 16px; align-items: start; }\n.scenario-card-main { min-width: 0; }\n.scenario-card-actions { display: grid; grid-template-columns: 1fr; gap: 6px; min-width: 138px; justify-self: end; align-self: start; }\n.scenario-card-actions button { width: 100%; padding: 6px 9px; font-size: 9px; text-align: center; }\n")
replace(css,
    "  .scenario-card-actions { display: grid; grid-template-columns: 1fr 1fr; }\n  .scenario-card-actions button { width: 100%; }\n",
    "  .scenario-card-view { grid-template-columns: minmax(0,1fr) 122px; gap: 10px; }\n  .scenario-card-actions { min-width: 122px; width: 122px; }\n")
replace(css,
    "@media (max-width: 460px) {\n  .scenario-card-actions { grid-template-columns: 1fr; }\n}\n",
    "@media (max-width: 460px) {\n  .scenario-card-view { grid-template-columns: minmax(0,1fr) 108px; gap: 8px; }\n  .scenario-card-actions { min-width: 108px; width: 108px; }\n  .scenario-card-actions button { padding-left: 5px; padding-right: 5px; font-size: 8px; }\n}\n")
account_css = Path(css)
text = account_css.read_text()
text += '''\n\n/* v0.81.3 instructor details */\n.instructor-details-section { border-top: 1px solid #293941; padding: 17px 0; }\n.instructor-details-fields { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; margin-top: 12px; }\n.instructor-details-fields label { display: grid; gap: 6px; min-width: 0; }\n.instructor-details-fields label > span { color: #98aab2; font-size: 11px; }\n.instructor-details-fields input { width: 100%; min-height: 42px; border: 1px solid #3a4d58; border-radius: 8px; background: #091116; color: #edf5f7; padding: 9px 11px; outline: none; font: inherit; }\n.instructor-details-fields input:focus { border-color: #69c5e4; box-shadow: 0 0 0 2px rgba(105,197,228,.12); }\n.instructor-details-save { margin-top: 12px; }\n.instructor-details-section .account-message { margin-top: 10px; }\n@media (max-width: 760px) { .instructor-details-fields { grid-template-columns: 1fr; } }\n'''
account_css.write_text(text)

styles = Path('src/styles.css')
text = styles.read_text()
needle = ".top-diagnostic-button.copied { color: #8ee6ff; border-color: #53c8ed; background: #173542; }\n"
if text.count(needle) != 1:
    raise SystemExit('src/styles.css diagnostic style anchor mismatch')
text = text.replace(needle, needle + '''.top-diagnostic-menu { position: relative; display: flex; align-items: center; }\n.top-diagnostic-dropdown { position: absolute; z-index: 120; top: calc(100% + 8px); right: 0; width: 230px; display: grid; gap: 5px; padding: 7px; border: 1px solid #41545f; border-radius: 10px; background: #0e171c; box-shadow: 0 16px 42px rgba(0,0,0,.58); }\n.top-diagnostic-dropdown button { display: grid; gap: 3px; width: 100%; padding: 9px 10px; text-align: left; background: #111b20; }\n.top-diagnostic-dropdown strong { color: #dcebf0; font-size: 11px; }\n.top-diagnostic-dropdown small { color: #7f949e; font-size: 9px; line-height: 1.35; }\n''')
styles.write_text(text)
