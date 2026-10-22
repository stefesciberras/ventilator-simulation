from pathlib import Path

# Shared session rows can now be editable switches or read-only product policy indicators.
p = Path('src/teaching/session/SharedSessionModePanel.tsx')
s = p.read_text()
s = s.replace(
"export interface SharedSessionSwitchRow { id: string; label: string; checked: boolean; disabled?: boolean; emphasis?: boolean; onChange: (checked: boolean) => void | Promise<unknown> }",
"export interface SharedSessionSwitchRow { id: string; label: string; checked: boolean; disabled?: boolean; emphasis?: boolean; readOnly?: boolean; onChange?: (checked: boolean) => void | Promise<unknown> }",
)
old = "{d.rows.map((r) => <label key={r.id} className={`session-switch-row ${r.emphasis ? 'session-switch-row-emphasis' : ''}`}><span>{r.label}</span><input type=\"checkbox\" checked={r.checked} disabled={r.disabled} onChange={(e) => void r.onChange(e.target.checked)} /></label>)}"
new = "{d.rows.map((r) => <label key={r.id} className={`session-switch-row ${r.emphasis ? 'session-switch-row-emphasis' : ''} ${r.readOnly ? 'session-switch-row-readonly' : ''}`}><span>{r.label}</span>{r.readOnly ? <strong className=\"session-policy-value\">{r.checked ? 'Shared' : 'Local'}</strong> : <input type=\"checkbox\" checked={r.checked} disabled={r.disabled} onChange={(e) => void r.onChange?.(e.target.checked)} />}</label>)}"
if old not in s:
    raise RuntimeError('SharedSessionModePanel row rendering marker not found')
s = s.replace(old, new)
p.write_text(s)

# Export the product-dashboard resolver through the shared session barrel.
p = Path('src/teaching/session/index.ts')
s = p.read_text()
if "./productDashboard" not in s:
    s += "export * from './productDashboard'\n"
p.write_text(s)

# EDUVENT: replace hand-built session domain/telemetry wiring with the product contract.
p = Path('src/eduvent/EduventSessionPanel.tsx')
s = p.read_text()
s = s.replace("import { SharedBasicSessionPanel, type SharedInstructorDashboardConfig } from '../teaching/session'", "import { SharedBasicSessionPanel, buildProductInstructorDashboard, ProductCandidateTelemetry } from '../teaching/session'")
s = s.replace("import type { PatientSettings, VentilatorSettings } from '../simulation/types'\n", "")
if "getSimulationProduct" not in s:
    s = s.replace("import { useEduventScenarioLibrary } from '../teaching/scenario/useEduventScenarioLibrary'\n", "import { useEduventScenarioLibrary } from '../teaching/scenario/useEduventScenarioLibrary'\nimport { getSimulationProduct } from '../core/products'\n")
start = s.find("function hasVentilatorSettings")
end = s.find("function RuntimeTransportBadge", start)
if start >= 0 and end > start:
    s = s[:start] + s[end:]
start = s.find("  const dashboard: SharedInstructorDashboardConfig = {")
end = s.find("\n\n  return <SharedBasicSessionPanel", start)
if start < 0 or end < 0:
    raise RuntimeError('EDUVENT dashboard block not found')
replacement = '''  const product = getSimulationProduct('eduvent')\n  const dashboard = buildProductInstructorDashboard(product, session, {\n    onUpdatePolicy: (patch) => props.onUpdatePolicy(patch as Parameters<typeof props.onUpdatePolicy>[0]),\n    runtimeBadge: <RuntimeTransportBadge connection={props.localRuntimeConnection} url={props.localRuntimeUrl} kind={props.runtimeTransportKind} />,\n    simulationPaused: props.simulationPaused,\n    onSimulationPausedChange: props.onSimulationPausedChange,\n    pausedMessage: 'All candidate simulations are paused by the instructor.',\n    onBroadcastNow: props.onBroadcastNow,\n    collapseStorageKey: 'eduvent-instructor-dashboard',\n  })'''
s = s[:start] + replacement + s[end:]
marker_start = s.find("    renderCandidateTelemetry={(member) => {")
if marker_start < 0:
    raise RuntimeError('EDUVENT telemetry marker not found')
marker_end = s.find("\n    }}\n  />", marker_start)
if marker_end < 0:
    raise RuntimeError('EDUVENT telemetry end not found')
s = s[:marker_start] + "    renderCandidateTelemetry={(member) => <ProductCandidateTelemetry product={product} member={member} />}" + s[marker_end + len("\n    }}"):]
p.write_text(s)

# EDUMON: consume the same product contract for session domains/status/telemetry.
p = Path('src/edumon/EdumonApp.tsx')
s = p.read_text()
s = s.replace("import { SharedBasicSessionPanel, useProductTeachingSession } from '../teaching/session'", "import { SharedBasicSessionPanel, ProductCandidateTelemetry, buildProductInstructorDashboard, useProductTeachingSession } from '../teaching/session'")
if "getSimulationProduct" not in s:
    s = s.replace("import { createSimulationPersistence, type SimulationPersistence } from '../core/SimulationPersistence'\n", "import { createSimulationPersistence, type SimulationPersistence } from '../core/SimulationPersistence'\nimport { getSimulationProduct } from '../core/products'\nimport type { EdumonTeachingState } from './teachingState'\n")
start = s.find("interface EdumonTeachingState {")
end = s.find("\n\ntype TraceKey", start)
if start >= 0 and end > start:
    s = s[:start] + s[end+2:]
needle = "  const scenarioProduct = scenarioProductForEdumonModule(module.id)\n"
if needle not in s:
    raise RuntimeError('EDUMON scenario product marker not found')
s = s.replace(needle, needle + "  const product = getSimulationProduct(scenarioProduct)\n", 1)
start = s.find("      renderCandidateTelemetry={(member) => {")
end = s.find("\n      instructorStart={{", start)
if start < 0 or end < 0:
    raise RuntimeError('EDUMON telemetry block not found')
replacement = '''      instructorDashboard={buildProductInstructorDashboard(product, teachingSession.session, {\n        simulationPaused,\n        onSimulationPausedChange: setSimulationPaused,\n        collapseStorageKey: `${product.id}-instructor-dashboard`,\n      })}\n      renderCandidateTelemetry={(member) => <ProductCandidateTelemetry product={product} member={member} />}'''
s = s[:start] + replacement + s[end:]
p.write_text(s)

# Bump both simulator versions for the functional product/session contract change.
p = Path('src/appVersion.ts')
s = p.read_text().replace("0.83.0.18", "0.83.0.19")
p.write_text(s)
p = Path('src/edumon/appVersion.ts')
s = p.read_text().replace("0.1.0.20", "0.1.0.21")
p.write_text(s)

print('Applied functional product contracts and shared session domains')
