export interface MobileWorkspaceRuntimeOptions {
  appSelector: string
  workspaceSelector: string
  switcherClassName?: string
  ariaLabel: string
  firstPage: { id: string; label: string; className: string }
  secondPage: { id: string; label: string; className: string }
  mobileQuery?: string
  tabletBodyClass?: string
  swipeThreshold?: number
}

export function installMobileWorkspaceRuntime({
  appSelector,
  workspaceSelector,
  switcherClassName = '',
  ariaLabel,
  firstPage,
  secondPage,
  mobileQuery = '(max-width: 1180px)',
  tabletBodyClass = 'eduvent-tablet-landscape',
  swipeThreshold = 48,
}: MobileWorkspaceRuntimeOptions) {
  let workspace: HTMLElement | null = null
  let switcher: HTMLElement | null = null
  let activePage = firstPage.id
  let touchStartX = 0
  let touchStartY = 0
  let swipeSuppressed = false

  const shouldUseMobileWorkspace = () => window.matchMedia(mobileQuery).matches || document.body.classList.contains(tabletBodyClass)

  const isWorkspaceLaserActive = () => activePage === firstPage.id && Boolean(workspace?.querySelector('.teaching-laser-layer-active'))

  const isSwipeBlockedElement = (element: Element | null) => Boolean(element?.closest(
    '.teaching-laser-layer-active, .teaching-media-laser-stage, [data-edusim-block-workspace-swipe="true"]',
  ))

  const isSwipeBlockedTouch = (target: EventTarget | null, clientX: number, clientY: number) => {
    if (isWorkspaceLaserActive()) return true
    const targetElement = target instanceof Element ? target : null
    if (isSwipeBlockedElement(targetElement)) return true
    return isSwipeBlockedElement(document.elementFromPoint(clientX, clientY))
  }

  const applyPage = (page: string) => {
    activePage = page
    if (!workspace) return
    workspace.classList.toggle(firstPage.className, page === firstPage.id)
    workspace.classList.toggle(secondPage.className, page === secondPage.id)
    switcher?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      const selected = button.dataset.page === page
      button.classList.toggle('active', selected)
      if (selected) button.setAttribute('aria-current', 'page')
      else button.removeAttribute('aria-current')
    })
  }

  const buildSwitcher = (host: HTMLElement) => {
    const selector = switcherClassName ? `.${switcherClassName.split(/\s+/).filter(Boolean)[0]}` : '.edusim-mobile-workspace-switcher'
    const existing = document.querySelector<HTMLElement>(selector)
    if (existing) return existing

    const nav = document.createElement('nav')
    nav.className = `mobile-workspace-switcher edusim-mobile-workspace-switcher ${switcherClassName}`.trim()
    nav.setAttribute('aria-label', ariaLabel)

    for (const page of [firstPage, secondPage]) {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.page = page.id
      button.textContent = page.label
      button.addEventListener('click', () => applyPage(page.id))
      nav.append(button)
    }

    host.insertBefore(nav, workspace)
    return nav
  }

  const attach = () => {
    const nextWorkspace = document.querySelector<HTMLElement>(workspaceSelector)
    const app = document.querySelector<HTMLElement>(appSelector)
    if (!nextWorkspace || !app) return false

    if (workspace !== nextWorkspace) {
      workspace = nextWorkspace
      workspace.addEventListener('touchstart', (event) => {
        swipeSuppressed = false
        if (!shouldUseMobileWorkspace() || event.touches.length !== 1) return
        if (isWorkspaceLaserActive()) {
          swipeSuppressed = true
          return
        }
        const touch = event.touches[0]
        if (isSwipeBlockedTouch(event.target, touch.clientX, touch.clientY)) {
          swipeSuppressed = true
          return
        }
        touchStartX = touch.clientX
        touchStartY = touch.clientY
      }, { passive: true })

      workspace.addEventListener('touchmove', (event) => {
        if (swipeSuppressed) return
        if (!shouldUseMobileWorkspace() || event.touches.length !== 1) return
        if (isWorkspaceLaserActive()) {
          swipeSuppressed = true
          return
        }
        const touch = event.touches[0]
        if (isSwipeBlockedTouch(event.target, touch.clientX, touch.clientY)) swipeSuppressed = true
      }, { passive: true })

      workspace.addEventListener('touchend', (event) => {
        if (swipeSuppressed || isWorkspaceLaserActive()) {
          swipeSuppressed = false
          return
        }
        if (!shouldUseMobileWorkspace() || event.changedTouches.length !== 1) return
        const dx = event.changedTouches[0].clientX - touchStartX
        const dy = event.changedTouches[0].clientY - touchStartY
        if (Math.abs(dx) < swipeThreshold || Math.abs(dx) <= Math.abs(dy) * 1.2) return
        if (dx < 0 && activePage === firstPage.id) applyPage(secondPage.id)
        else if (dx > 0 && activePage === secondPage.id) applyPage(firstPage.id)
      }, { passive: true })

      workspace.addEventListener('touchcancel', () => {
        swipeSuppressed = false
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

  const media = window.matchMedia(mobileQuery)
  const refresh = () => applyPage(activePage)
  media.addEventListener?.('change', refresh)
  window.addEventListener('resize', refresh)
}
