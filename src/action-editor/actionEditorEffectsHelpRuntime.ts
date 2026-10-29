const HELP_BUTTON_CLASS = 'action-editor-effects-help'
const HELP_DIALOG_ID = 'action-editor-effects-help-dialog'

function createHelpDialog(): HTMLDialogElement {
  const existing = document.getElementById(HELP_DIALOG_ID)
  if (existing instanceof HTMLDialogElement) return existing

  const dialog = document.createElement('dialog')
  dialog.id = HELP_DIALOG_ID
  dialog.className = 'action-editor-help-dialog'
  dialog.setAttribute('aria-labelledby', `${HELP_DIALOG_ID}-title`)
  dialog.innerHTML = `
    <div class="action-editor-help-shell">
      <header class="action-editor-help-header">
        <div>
          <span>Physiological effects</span>
          <h2 id="${HELP_DIALOG_ID}-title">How effect settings work</h2>
        </div>
        <button type="button" class="action-editor-help-close" aria-label="Close help">×</button>
      </header>
      <div class="action-editor-help-body">
        <p class="action-editor-help-intro">Each action can contain one or more declarative effects. The action describes what should happen; the simulator physiology engine decides how that effect changes the patient state.</p>

        <section>
          <h3>Core fields</h3>
          <dl>
            <dt>Target</dt><dd>The physiological state affected, for example heart rate, mean arterial pressure, respiratory drive, airway obstruction, neuromuscular block, hypnotic effect or sympathetic stimulus.</dd>
            <dt>Operation</dt><dd>Defines how the value is applied to the selected target. Only operations supported by that target are offered.</dd>
            <dt>Value</dt><dd>The magnitude used by the selected operation. Use the unit shown beside the field. Targets shown as 0–1 are fractional states: 0 means none and 1 means maximal/full.</dd>
            <dt>Priority override</dt><dd>Normally the effect inherits the action priority. Entering a number here changes priority for this effect only. Higher-priority effects are resolved after lower-priority effects.</dd>
            <dt>Onset</dt><dd>Time in seconds for the effect to develop after the action starts.</dd>
            <dt>Duration</dt><dd>Time in seconds the developed effect is maintained before recovery. For toggle actions, a zero-duration effect may remain active until the toggle is stopped.</dd>
            <dt>Recovery</dt><dd>Time in seconds for the effect to return toward baseline after its active phase ends.</dd>
          </dl>
        </section>

        <section>
          <h3>Operations</h3>
          <div class="action-editor-help-operation-grid">
            <article><strong>offset</strong><p>Adds or subtracts a value from the target. Example: heart-rate offset −10 bpm.</p></article>
            <article><strong>set</strong><p>Sets the target to the specified value while the effect is active.</p></article>
            <article><strong>multiplier</strong><p>Scales the target. 1 = unchanged, 0.5 = half, 1.5 = 50% greater.</p></article>
            <article><strong>target</strong><p>Drives the physiological state toward the specified value using the effect timing rather than treating the value as a simple additive change.</p></article>
            <article><strong>increment</strong><p>Adds the specified amount as an incremental contribution to the target.</p></article>
            <article><strong>constraint</strong><p>Restricts the result produced by other effects or physiology. Choose the specific constraint type shown below.</p></article>
            <article><strong>trigger</strong><p>Applies a transient stimulus/event value to a trigger-style target, such as sympathetic stimulation.</p></article>
          </div>
        </section>

        <section>
          <h3>Constraint types</h3>
          <dl>
            <dt>Block increase above reference</dt><dd>Prevents lower-priority influences from increasing the target above its reference value.</dd>
            <dt>Block decrease below reference</dt><dd>Prevents lower-priority influences from decreasing the target below its reference value.</dd>
            <dt>Minimum value</dt><dd>Sets a floor: the resolved target cannot fall below the entered value.</dd>
            <dt>Maximum value</dt><dd>Sets a ceiling: the resolved target cannot rise above the entered value.</dd>
          </dl>
        </section>

        <section class="action-editor-help-example">
          <h3>Example</h3>
          <p>A vasopressor effect might use <strong>Mean arterial pressure → offset → +15 mmHg</strong>, with an onset of 15 s, duration of 240 s and recovery of 240 s. A separate heart-rate effect can be added to the same action.</p>
        </section>
      </div>
      <footer class="action-editor-help-footer"><button type="button" class="primary action-editor-help-done">Close</button></footer>
    </div>
  `

  const close = () => dialog.close()
  dialog.querySelector<HTMLButtonElement>('.action-editor-help-close')?.addEventListener('click', close)
  dialog.querySelector<HTMLButtonElement>('.action-editor-help-done')?.addEventListener('click', close)
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close()
  })
  document.body.appendChild(dialog)
  return dialog
}

function installHelpButton(): boolean {
  const heading = document.querySelector<HTMLElement>('.action-editor-effects-heading')
  if (!heading) return false
  if (heading.querySelector(`.${HELP_BUTTON_CLASS}`)) return true

  const addButton = Array.from(heading.querySelectorAll<HTMLButtonElement>('button'))
    .find((button) => button.textContent?.includes('Add effect'))
  if (!addButton) return false

  let actions = heading.querySelector<HTMLElement>('.action-editor-effects-actions')
  if (!actions) {
    actions = document.createElement('div')
    actions.className = 'action-editor-effects-actions'
    addButton.before(actions)
    actions.appendChild(addButton)
  }

  const help = document.createElement('button')
  help.type = 'button'
  help.className = HELP_BUTTON_CLASS
  help.textContent = '?'
  help.setAttribute('aria-label', 'Help with physiological effect settings')
  help.title = 'Explain physiological effect settings'
  help.addEventListener('click', () => createHelpDialog().showModal())
  actions.appendChild(help)
  return true
}

export function installActionEditorEffectsHelpRuntime(): void {
  if (!window.location.pathname.startsWith('/actions')) return
  if (installHelpButton()) return

  const observer = new MutationObserver(() => {
    if (!installHelpButton()) return
    observer.disconnect()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}
