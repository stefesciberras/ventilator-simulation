const COLLAPSIBLE_HEADERS = [
  {
    headingSelector: '.teaching-prompt-section-heading',
    buttonSelector: '.teaching-workspace-collapse',
  },
  {
    headingSelector: '.edumon-action-section-heading',
    buttonSelector: '.edumon-action-collapse',
  },
] as const

const INTERACTIVE_DESCENDANT_SELECTOR = 'button, a, input, select, textarea, [role="button"]'

let installed = false

function collapsibleHeaderFor(target: Element): { heading: HTMLElement; button: HTMLButtonElement } | null {
  for (const config of COLLAPSIBLE_HEADERS) {
    const heading = target.closest<HTMLElement>(config.headingSelector)
    if (!heading) continue
    const button = heading.querySelector<HTMLButtonElement>(config.buttonSelector)
    if (button) return { heading, button }
  }
  return null
}

export function installCollapsibleHeaderRuntime(): void {
  if (installed) return
  installed = true

  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest(INTERACTIVE_DESCENDANT_SELECTOR)) return

    const collapsible = collapsibleHeaderFor(target)
    if (!collapsible) return

    collapsible.button.click()
  })
}
