from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'pattern missing in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

replace_once(
    'src/App.tsx',
    "  const customPatientProfiles = useMemo(() => new Map(savedPatientProfiles.filter((row) => !row.base_key).map((row) => [row.name, row.values])), [savedPatientProfiles])",
    """  const customPatientProfiles = useMemo(() => {\n    const profiles = new Map<string, PatientSettings>()\n    for (const row of savedPatientProfiles.filter((candidate) => !candidate.base_key)) {\n      if (!profiles.has(row.name)) profiles.set(row.name, row.values)\n    }\n    return profiles\n  }, [savedPatientProfiles])""",
)

replace_once(
    'src/edumon/EdumonWorkspacePanel.tsx',
    "    for (const row of savedProfiles.filter((candidate) => !candidate.base_key)) result[row.name] = row.values",
    """    const customProfileNames = new Set<string>()\n    for (const row of savedProfiles.filter((candidate) => !candidate.base_key)) {\n      if (customProfileNames.has(row.name)) continue\n      result[row.name] = row.values\n      customProfileNames.add(row.name)\n    }""",
)

replace_once(
    'src/scenario-builder/version.ts',
    "export const SCENARIO_BUILDER_VERSION = '0.10.0'",
    "export const SCENARIO_BUILDER_VERSION = '0.11.0'",
)

p = Path('src/scenario-builder/scenarioBuilder.css')
s = p.read_text()
if '/* Studio v0.11.0: organisation workspaces */' not in s:
    s += r'''

/* Studio v0.11.0: organisation workspaces */
.studio-profile-workspace{display:grid;gap:12px}.studio-profile-scopebar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 12px;border:1px solid #2c4049;background:#091319}.studio-profile-scopebar p{margin:0;color:#9aabb2;font-size:11px;flex:1;min-width:260px}.studio-profile-scope-tabs{display:flex;gap:5px}.studio-profile-scope-tabs button,.studio-profile-scopebar select{min-height:34px;border:1px solid #3b5059;background:#101d24;color:#dce8ec;padding:6px 9px}.studio-profile-scope-tabs button.selected{border-color:#61bedc;background:#14303a}.studio-profile-scopebar label{display:flex;align-items:center;gap:7px}.studio-profile-scopebar label span{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#8498a1}.studio-profile-readonly{margin-bottom:12px;padding:9px 11px;border:1px solid #665a3d;background:#211d12;color:#d9c98f;font-size:11px}
.studio-organisation-manager{display:grid;grid-template-columns:minmax(220px,280px) minmax(0,1fr);gap:14px}.studio-organisation-sidebar,.studio-organisation-detail{border:1px solid #2d414b;background:#091319;min-width:0}.studio-organisation-sidebar{align-self:start}.studio-organisation-sidebar>button{display:flex;width:100%;justify-content:space-between;gap:8px;padding:10px 12px;border:0;border-bottom:1px solid rgba(255,255,255,.06);background:transparent;color:#dce5eb;text-align:left}.studio-organisation-sidebar>button.selected{background:#18303a}.studio-organisation-sidebar small{color:#8ca0ad}.studio-organisation-create{display:grid;gap:7px;padding:12px}.studio-organisation-create input,.studio-organisation-inline-form input,.studio-organisation-inline-form select,.studio-organisation-row select{min-height:35px;border:1px solid #3b5059;background:#071015;color:#e5eef1;padding:6px 8px}.studio-organisation-create button,.studio-organisation-card button{min-height:34px;border:1px solid #3c535d;background:#102029;color:#dce8ec;padding:6px 10px}.studio-organisation-detail{display:grid;gap:12px;padding:14px}.studio-organisation-card{padding:14px;border:1px solid #2c414a;background:#0b161c}.studio-organisation-card header,.studio-organisation-section-heading{display:flex;justify-content:space-between;gap:10px}.studio-organisation-card h2,.studio-organisation-card h3{margin:3px 0}.studio-organisation-card p{margin:4px 0;color:#9aabb2}.studio-organisation-card span{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#8398a1}.studio-organisation-inline-form{display:flex;gap:8px;margin-top:10px}.studio-organisation-inline-form input{flex:1}.studio-organisation-inline-form.invite input{min-width:240px}.studio-organisation-table,.studio-organisation-invitations{display:grid;margin-top:9px}.studio-organisation-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-top:1px solid rgba(255,255,255,.07)}.studio-organisation-row>div:first-child{display:grid;gap:2px}.studio-organisation-row small{color:#8ca0ad}.studio-organisation-row-actions{display:flex;gap:7px;align-items:center}@media(max-width:900px){.studio-organisation-manager{grid-template-columns:1fr}.studio-organisation-inline-form{flex-direction:column}}
'''
    p.write_text(s)
