const PANEL_COLLAPSE_PREFIX = 'eduvent.panel-collapsed.'

export function loadPanelCollapsed(id: string, fallback = false): boolean {
  if (typeof window === 'undefined') return fallback
  try {
    const stored = window.localStorage.getItem(`${PANEL_COLLAPSE_PREFIX}${id}`)
    return stored == null ? fallback : stored === 'true'
  } catch {
    return fallback
  }
}

export function savePanelCollapsed(id: string, collapsed: boolean) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${PANEL_COLLAPSE_PREFIX}${id}`, String(collapsed))
  } catch {
    // Local persistence is optional; collapsing still works for this session.
  }
}
