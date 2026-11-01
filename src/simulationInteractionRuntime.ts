import { supersedeActionTarget } from './edusim/actions/ActionRuntime'

const HISTORY_GUARD_KEY = '__loppjusimHistoryGuard'
const DOA_SLIDER_CLASS = 'loppjusim-doa-slider'

let historyGuardInstalled = false
let doaRuntimeInstalled = false

function isDepthOfAnaesthesiaSlider(target: EventTarget | null): target is HTMLInputElement {
  if (!(target instanceof HTMLInputElement) || target.type !== 'range') return false
  if (target.classList.contains(DOA_SLIDER_CLASS)) return true
  const label = target.closest('label')
  const title = label?.querySelector('span')?.textContent?.trim().toLowerCase() ?? ''
  return title.startsWith('depth of anaesthesia')
}

function markDepthOfAnaesthesiaSliders(root: ParentNode = document): void {
  root.querySelectorAll('label').forEach((label) => {
    const title = label.querySelector('span')?.textContent?.trim().toLowerCase() ?? ''
    if (!title.startsWith('depth of anaesthesia')) return
    const slider = label.querySelector<HTMLInputElement>('input[type="range"]')
    slider?.classList.add(DOA_SLIDER_CLASS)
  })
}

export function installSimulatorBackNavigationGuard(): void {
  if (historyGuardInstalled) return
  historyGuardInstalled = true

  const currentState = typeof window.history.state === 'object' && window.history.state !== null
    ? window.history.state
    : {}

  window.history.replaceState({ ...currentState, [HISTORY_GUARD_KEY]: 'base' }, '', window.location.href)
  window.history.pushState({ ...currentState, [HISTORY_GUARD_KEY]: 'guard' }, '', window.location.href)

  window.addEventListener('popstate', () => {
    const state = typeof window.history.state === 'object' && window.history.state !== null
      ? window.history.state
      : {}
    window.history.pushState({ ...state, [HISTORY_GUARD_KEY]: 'guard' }, '', window.location.href)
  })
}

export function installEdumonDoaInteractionRuntime(): void {
  if (doaRuntimeInstalled) return
  doaRuntimeInstalled = true

  const syncSliders = () => markDepthOfAnaesthesiaSliders(document)
  syncSliders()

  const observer = new MutationObserver(syncSliders)
  observer.observe(document.documentElement, { childList: true, subtree: true })

  document.addEventListener('input', (event) => {
    if (!isDepthOfAnaesthesiaSlider(event.target)) return
    const slider = event.target
    slider.classList.add(DOA_SLIDER_CLASS)
    supersedeActionTarget('anaesthesia.hypnoticEffect')
  }, true)
}
