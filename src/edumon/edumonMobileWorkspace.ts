import './edumon-mobile-workspace.css'

type EdumonMobilePage = 'monitor' | 'controls'

const MOBILE_QUERY = '(max-width: 1180px)'
const SWIPE_THRESHOLD = 48

function shouldUseMobileWorkspace() {
  return window.matchMedia(MOBILE_QUERY).matches || document.body.classList.contains('eduvent-tablet-landscape')
}

export function installEdumonMobileWorkspace() {
  let workspace: HTMLElement | null = null
  let switcher: HTMLElement | null = null
  let activePage: EdumonMobilePage = 'monitor'
  let touchStartX = 0
  let touchStartY = 0

  const applyPage = (page: EdumonMobilePage) => {
    activePage = page
    if (!workspace) return
    workspace.classList.toggle('mobile-page-monitor', page === 'monitor')
    workspace.classList.toggle('mobile-page-controls', page === 'controls')
    switcher?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      const selected = button.dataset.page === page
      button.classList.toggle('active', selected)
      if (selected) button.setAttribute('aria-current', 'page')
      else button.removeAttribute('aria-current')
    })
  }

  const buildSwitcher = (host: HTMLElement) => {
    const existing = document.querySelector<HTMLElement>('.edumon-mobile-workspace-switcher')
    if (existing) return existing

    const nav = document.createElement('nav')
    nav.className = 'mobile-workspace-switcher edumon-mobile-workspace-switcher'
    nav.setAttribute('aria-label', 'EDUMON workspace pages')

    const monitorButton = document.createElement('button')
    monitorButton.type = 'button'
    monitorButton.dataset.page = 'monitor'
    monitorButton.textContent = 'Display'
    monitorButton.addEventListener('click', () => applyPage('monitor'))

    const controlsButton = document.createElement('button')
    controlsButton.type = 'button'
    controlsButton.dataset.page = 'controls'
    controlsButton.textContent = 'Controls'
    controlsButton.addEventListener('click', () => applyPage('controls'))

    nav.append(monitorButton, controlsButton)
    host.insertBefore(nav, workspace)
    return nav
  }

  const attach = () => {
    const nextWorkspace = document.querySelector<HTMLElement>('.edumon-workspace')
    const app = document.querySelector<HTMLElement>('.edumon-app-shell')
    if (!nextWorkspace || !app) return false

    if (workspace !== nextWorkspace) {
      workspace = nextWorkspace
      workspace.addEventListener('touchstart', (event) => {
        if (!shouldUseMobileWorkspace() || event.touches.length !== 1) return
        touchStartX = event.touches[0].clientX
        touchStartY = event.touches[0].clientY
      }, { passive: true })

      workspace.addEventListener('touchend', (event) => {
        if (!shouldUseMobileWorkspace() || event.changedTouches.length !== 1) return
        const dx = event.changedTouches[0].clientX - touchStartX
        const dy = event.changedTouches[0].clientY - touchStartY
        if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy) * 1.2) return
        if (dx < 0 && activePage === 'monitor') applyPage('controls')
        else if (dx > 0 && activePage === 'controls') applyPage('monitor')
      }, { passive: true })
    }

    switcher = buildSwitcher(app)
    applyPage(activePage)
    return true
  }

  if (!attach()) {
    const observer = new MutationObserver(() => {
      if (attach()) observer.disconnect()
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
  }

  const media = window.matchMedia(MOBILE_QUERY)
  const refresh = () => applyPage(activePage)
  media.addEventListener?.('change', refresh)
  window.addEventListener('resize', refresh)
}
