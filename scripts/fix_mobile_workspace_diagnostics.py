from pathlib import Path

# 1) Shared diagnostics menu: close on outside interaction / Escape.
p = Path('src/components/SimulationDiagnosticsMenu.tsx')
s = p.read_text()
s = s.replace("import { useState } from 'react'", "import { useEffect, useRef, useState } from 'react'")
s = s.replace("  const [copied, setCopied] = useState<string | null>(null)\n", "  const [copied, setCopied] = useState<string | null>(null)\n  const menuRef = useRef<HTMLDivElement | null>(null)\n\n  useEffect(() => {\n    if (!open) return\n    const closeOutside = (event: PointerEvent) => {\n      const target = event.target as Node | null\n      if (target && menuRef.current?.contains(target)) return\n      setOpen(false)\n    }\n    const closeOnEscape = (event: KeyboardEvent) => {\n      if (event.key === 'Escape') setOpen(false)\n    }\n    document.addEventListener('pointerdown', closeOutside, true)\n    document.addEventListener('keydown', closeOnEscape)\n    return () => {\n      document.removeEventListener('pointerdown', closeOutside, true)\n      document.removeEventListener('keydown', closeOnEscape)\n    }\n  }, [open])\n")
s = s.replace('<div className="top-diagnostic-menu">', '<div ref={menuRef} className="top-diagnostic-menu">')
p.write_text(s)

# 2) Shared workspace: optionally permit swipe gestures that start on canvas.
p = Path('src/components/SimulationWorkspaceShell.tsx')
s = p.read_text()
s = s.replace("  controlsVisible?: boolean\n}", "  controlsVisible?: boolean\n  allowSwipeFromCanvas?: boolean\n}")
s = s.replace("  controlsVisible = true,\n}: SimulationWorkspaceShellProps)", "  controlsVisible = true,\n  allowSwipeFromCanvas = false,\n}: SimulationWorkspaceShellProps)")
s = s.replace("      blocked: Boolean(target.closest('button, input, select, textarea, a, [role=\"slider\"], canvas')),", "      blocked: Boolean(target.closest(allowSwipeFromCanvas\n        ? 'button, input, select, textarea, a, [role=\"slider\"]'\n        : 'button, input, select, textarea, a, [role=\"slider\"], canvas')),")
p.write_text(s)

# 3) EDUMON opts into canvas swiping.
p = Path('src/edumon/EdumonApp.tsx')
s = p.read_text()
s = s.replace('        ariaLabel="EDUMON workspace pages"\n', '        ariaLabel="EDUMON workspace pages"\n        allowSwipeFromCanvas\n')
p.write_text(s)

# 4) Replace obsolete horizontal scroll-snap paging with state-class paging controlled by SimulationWorkspaceShell.
p = Path('src/edumon/edumon-console-parity.css')
s = p.read_text()
old = """  .edumon-workspace {\n    display: flex;\n    width: 100vw;\n    height: calc(100dvh - 104px);\n    min-height: 0;\n    overflow-x: auto;\n    overflow-y: hidden;\n    overscroll-behavior-x: contain;\n    scroll-snap-type: x mandatory;\n    scroll-behavior: smooth;\n    -webkit-overflow-scrolling: touch;\n    scrollbar-width: none;\n    touch-action: pan-x;\n  }\n\n  .edumon-workspace::-webkit-scrollbar { display: none; }\n\n  .edumon-console,\n  .edumon-side-panel {\n    flex: 0 0 100vw;\n    width: 100vw;\n    height: 100%;\n    min-width: 0;\n    min-height: 0;\n    max-height: none;\n    scroll-snap-align: start;\n    scroll-snap-stop: always;\n  }\n\n  .edumon-console { overflow: hidden; }\n  .edumon-side-panel { overflow: hidden; box-sizing: border-box; }\n"""
new = """  .edumon-workspace {\n    display: block;\n    width: 100vw;\n    height: calc(100dvh - 104px);\n    min-height: 0;\n    overflow: hidden;\n    touch-action: pan-y;\n  }\n\n  .edumon-console,\n  .edumon-side-panel {\n    width: 100vw;\n    height: 100%;\n    min-width: 0;\n    min-height: 0;\n    max-height: none;\n  }\n\n  .edumon-workspace.mobile-page-monitor > .edumon-console { display: flex; }\n  .edumon-workspace.mobile-page-monitor > .edumon-side-panel { display: none; }\n  .edumon-workspace.mobile-page-controls > .edumon-console { display: none; }\n  .edumon-workspace.mobile-page-controls > .edumon-side-panel { display: flex; }\n\n  .edumon-console { overflow: hidden; }\n  .edumon-side-panel { overflow: hidden; box-sizing: border-box; }\n  .edumon-waveform-area { touch-action: pan-x; }\n"""
if old not in s:
    raise SystemExit('mobile EDUMON paging block not found')
s = s.replace(old, new)

old2 = """body.eduvent-tablet-landscape .edumon-workspace {\n  display: flex;\n  width: 100vw;\n  height: calc(100dvh - 104px);\n  min-height: 0;\n  overflow-x: auto;\n  overflow-y: hidden;\n  overscroll-behavior-x: contain;\n  scroll-snap-type: x mandatory;\n  scroll-behavior: smooth;\n  -webkit-overflow-scrolling: touch;\n  scrollbar-width: none;\n  touch-action: pan-x;\n}\n\nbody.eduvent-tablet-landscape .edumon-workspace::-webkit-scrollbar { display: none; }\n\nbody.eduvent-tablet-landscape .edumon-console,\nbody.eduvent-tablet-landscape .edumon-side-panel {\n  flex: 0 0 100vw;\n  width: 100vw;\n  height: 100%;\n  min-width: 0;\n  min-height: 0;\n  scroll-snap-align: start;\n  scroll-snap-stop: always;\n}\n\nbody.eduvent-tablet-landscape .edumon-console { overflow: hidden; }\nbody.eduvent-tablet-landscape .edumon-side-panel { overflow: hidden; box-sizing: border-box; }\n"""
new2 = """body.eduvent-tablet-landscape .edumon-workspace {\n  display: block;\n  width: 100vw;\n  height: calc(100dvh - 104px);\n  min-height: 0;\n  overflow: hidden;\n  touch-action: pan-y;\n}\n\nbody.eduvent-tablet-landscape .edumon-console,\nbody.eduvent-tablet-landscape .edumon-side-panel {\n  width: 100vw;\n  height: 100%;\n  min-width: 0;\n  min-height: 0;\n}\n\nbody.eduvent-tablet-landscape .edumon-workspace.mobile-page-monitor > .edumon-console { display: flex; }\nbody.eduvent-tablet-landscape .edumon-workspace.mobile-page-monitor > .edumon-side-panel { display: none; }\nbody.eduvent-tablet-landscape .edumon-workspace.mobile-page-controls > .edumon-console { display: none; }\nbody.eduvent-tablet-landscape .edumon-workspace.mobile-page-controls > .edumon-side-panel { display: flex; }\nbody.eduvent-tablet-landscape .edumon-console { overflow: hidden; }\nbody.eduvent-tablet-landscape .edumon-side-panel { overflow: hidden; box-sizing: border-box; }\nbody.eduvent-tablet-landscape .edumon-waveform-area { touch-action: pan-x; }\n"""
if old2 not in s:
    raise SystemExit('tablet EDUMON paging block not found')
s = s.replace(old2, new2)
p.write_text(s)

# 5) Version bumps.
Path('src/appVersion.ts').write_text("export const APP_VERSION = '0.83.0.5'\n")
Path('src/edumon/appVersion.ts').write_text("export const EDUMON_APP_VERSION = '0.1.0.5'\n")
