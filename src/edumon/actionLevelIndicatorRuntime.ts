const BADGE_SELECTOR = '.edumon-action-dose-badge'

function syncActionLevelIndicators(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>(BADGE_SELECTOR).forEach((badge) => {
    const raw = (badge.textContent ?? '').trim().toUpperCase()
    const level = raw === 'L' ? 'low' : raw === 'H' ? 'high' : raw === 'M' ? 'medium' : null
    if (!level) return
    badge.dataset.level = level
    badge.setAttribute('aria-label', `${level} level`)
  })
}

export function installActionLevelIndicatorRuntime(): void {
  syncActionLevelIndicators()

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        const parent = mutation.target.parentElement
        if (parent?.matches(BADGE_SELECTOR)) syncActionLevelIndicators(parent.parentElement ?? document)
        continue
      }

      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return
        if (node.matches(BADGE_SELECTOR)) syncActionLevelIndicators(node.parentElement ?? document)
        else if (node.querySelector(BADGE_SELECTOR)) syncActionLevelIndicators(node)
      })
    }
  })

  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
}
