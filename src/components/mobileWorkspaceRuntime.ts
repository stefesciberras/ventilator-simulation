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

type TouchPoint = { clientX: number; clientY: number }

const centroidFromTouches = (touches: ArrayLike<TouchPoint>) => {
  if (touches.length < 1) return null
  let x = 0
  let y = 0
  for (let index = 0; index < touches.length; index += 1) {
    x += touches[index].clientX
    y += touches[index].clientY
  }
  return { x: x / touches.length, y: y / touches.length }
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
  let swipeStart: { x: number; y: number } | null = null

  const shouldUseMobileWorkspace = () => window.matchMedia(mobileQuery).matches || document.body.classList.contains(tabletBodyClass)

  const resetSwipe = () => {
    swipeStart = null
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
        resetSwipe()
        if (!shouldUseMobileWorkspace() || event.touches.length !== 2) return
        swipeStart = centroidFromTouches(event.touches)
      }, { passive: true })

      workspace.addEventListener('touchmove', (event) => {
        if (swipeStart && event.touches.length !== 2) resetSwipe()
      }, { passive: true })

      workspace.addEventListener('touchend', (event) => {
        const start = swipeStart
        if (!start || !shouldUseMobileWorkspace()) {
          if (event.touches.length < 2) resetSwipe()
          return
        }

        const contacts: TouchPoint[] = []
        for (let index = 0; index < event.touches.length; index += 1) contacts.push(event.touches[index])
        for (let index = 0; index < event.changedTouches.length; index += 1) contacts.push(event.changedTouches[index])
        const end = contacts.length >= 2 ? centroidFromTouches(contacts.slice(0, 2)) : null
        resetSwipe()
        if (!end) return

        const dx = end.x - start.x
        const dy = end.y - start.y
        if (Math.abs(dx) < swipeThreshold || Math.abs(dx) <= Math.abs(dy) * 1.2) return
        if (dx < 0 && activePage === firstPage.id) applyPage(secondPage.id)
        else if (dx > 0 && activePage === secondPage.id) applyPage(firstPage.id)
      }, { passive: true })

      workspace.addEventListener('touchcancel', resetSwipe, { passive: true })
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
