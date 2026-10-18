const TABLET_CLASS = 'eduvent-tablet-landscape'

function isTabletLandscape(): boolean {
  const touchCapable = navigator.maxTouchPoints >= 2 || window.matchMedia('(any-pointer: coarse)').matches
  const landscape = window.matchMedia('(orientation: landscape)').matches || window.innerWidth > window.innerHeight
  const shortestScreenSide = Math.min(window.screen.width, window.screen.height)
  const tabletSized = shortestScreenSide >= 600
  const notDesktopScale = window.innerWidth <= 1600
  return touchCapable && landscape && tabletSized && notDesktopScale
}

export function installTabletResponsiveMode(): () => void {
  const apply = () => document.body.classList.toggle(TABLET_CLASS, isTabletLandscape())
  apply()

  window.addEventListener('resize', apply)
  window.addEventListener('orientationchange', apply)

  let swipeStart: { x: number; y: number } | null = null

  const onTouchStart = (event: TouchEvent) => {
    if (!document.body.classList.contains(TABLET_CLASS) || event.touches.length !== 1) {
      swipeStart = null
      return
    }
    const target = event.target as Element | null
    if (!target?.closest('.workspace') || target.closest('button, input, select, textarea, [role="slider"], .interactive-vent-slider')) {
      swipeStart = null
      return
    }
    const touch = event.touches[0]
    swipeStart = { x: touch.clientX, y: touch.clientY }
  }

  const onTouchEnd = (event: TouchEvent) => {
    if (!swipeStart || !document.body.classList.contains(TABLET_CLASS)) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - swipeStart.x
    const dy = touch.clientY - swipeStart.y
    swipeStart = null
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.2) return

    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.mobile-workspace-switcher button'))
    if (dx < 0) buttons.find((button) => button.textContent?.trim() === 'Controls')?.click()
    else buttons.find((button) => button.textContent?.trim() === 'Ventilator')?.click()
  }

  document.addEventListener('touchstart', onTouchStart, { passive: true })
  document.addEventListener('touchend', onTouchEnd, { passive: true })

  return () => {
    window.removeEventListener('resize', apply)
    window.removeEventListener('orientationchange', apply)
    document.removeEventListener('touchstart', onTouchStart)
    document.removeEventListener('touchend', onTouchEnd)
    document.body.classList.remove(TABLET_CLASS)
  }
}
