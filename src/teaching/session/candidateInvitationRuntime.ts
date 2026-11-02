import { supabase } from '../../session/supabase'
import { LOPPJUSIM_OPEN_SESSIONS_EVENT } from '../../core/platformEvents'

let installed = false

function normaliseSessionKey(value: string | null) {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

function invitationSessionKey() {
  if (typeof window === 'undefined') return ''
  return normaliseSessionKey(new URLSearchParams(window.location.search).get('session'))
}

function requestSessionJoinUi() {
  window.dispatchEvent(new Event(LOPPJUSIM_OPEN_SESSIONS_EVENT))
}

function showCandidateNamePrompt(sessionKey: string) {
  if (document.querySelector('[data-candidate-name-prompt="true"]')) return

  const backdrop = document.createElement('div')
  backdrop.className = 'session-invite-modal-backdrop'
  backdrop.dataset.candidateNamePrompt = 'true'
  backdrop.setAttribute('role', 'presentation')

  const dialog = document.createElement('div')
  dialog.className = 'session-invite-modal'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', 'Candidate name')

  const heading = document.createElement('div')
  heading.className = 'session-invite-modal-heading'
  heading.innerHTML = '<div><span>Candidate session</span><strong>Enter your name</strong></div>'

  const form = document.createElement('form')
  form.className = 'candidate-join-form'

  const label = document.createElement('label')
  const labelText = document.createElement('span')
  labelText.textContent = 'Name'
  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = 'Candidate'
  input.maxLength = 60
  input.autocomplete = 'name'
  label.append(labelText, input)

  const actions = document.createElement('div')
  actions.className = 'session-launch-actions'
  const save = document.createElement('button')
  save.type = 'submit'
  save.className = 'session-primary-button'
  save.textContent = 'Continue'
  const skip = document.createElement('button')
  skip.type = 'button'
  skip.className = 'session-secondary-button'
  skip.textContent = 'Continue without name'
  actions.append(save, skip)

  const status = document.createElement('div')
  status.className = 'session-error'
  status.hidden = true

  const close = () => backdrop.remove()
  skip.addEventListener('click', close)
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const displayName = input.value.trim()
    if (!displayName) {
      input.focus()
      return
    }
    save.disabled = true
    save.textContent = 'Saving…'
    status.hidden = true
    void supabase.rpc('join_edusim_session', {
      p_session_key: sessionKey,
      p_display_name: displayName,
      p_product_id: null,
    }).then(({ error }) => {
      if (error) {
        save.disabled = false
        save.textContent = 'Continue'
        status.textContent = error.message || 'Unable to save candidate name.'
        status.hidden = false
        return
      }
      close()
    })
  })

  form.append(label, actions, status)
  dialog.append(heading, form)
  backdrop.append(dialog)
  document.body.append(backdrop)
  window.setTimeout(() => input.focus(), 0)
}

export function installCandidateInvitationRuntime() {
  if (installed || typeof window === 'undefined') return
  const sessionKey = invitationSessionKey()
  if (sessionKey.length !== 6) return
  installed = true

  let joinSubmitted = false
  let namePromptShown = false

  // Installation happens before React mounts. Ask the product shell to open its
  // Sessions surface after mount; repeat once because route hydration can delay
  // the event listener on slower devices. The candidate should never need to
  // navigate Menu > Sessions > Join when an invitation link already contains a key.
  window.setTimeout(requestSessionJoinUi, 0)
  window.setTimeout(requestSessionJoinUi, 180)

  const maybeAutoJoin = () => {
    if (joinSubmitted) return
    const role = document.documentElement.dataset.loppjusimSessionRole
    if (role === 'candidate') {
      joinSubmitted = true
      return
    }

    const form = document.querySelector<HTMLFormElement>('.candidate-join-form')
    if (!form || !form.isConnected) return
    const sessionInput = form.querySelector<HTMLInputElement>('input[placeholder="ABC123"]')
    if (!sessionInput || normaliseSessionKey(sessionInput.value) !== sessionKey) return

    const nameInput = form.querySelector<HTMLInputElement>('input[placeholder="Candidate"]')
    if (nameInput) nameInput.value = ''
    joinSubmitted = true
    form.requestSubmit()
  }

  const maybePromptForName = () => {
    if (namePromptShown || document.documentElement.dataset.loppjusimSessionRole !== 'candidate') return
    namePromptShown = true
    window.setTimeout(() => showCandidateNamePrompt(sessionKey), 0)
  }

  const observer = new MutationObserver(() => {
    maybeAutoJoin()
    maybePromptForName()
    if (!joinSubmitted && !document.querySelector('.candidate-join-form')) requestSessionJoinUi()
    if (namePromptShown) observer.disconnect()
  })

  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-loppjusim-session-role'] })
  observer.observe(document.body, { childList: true, subtree: true })
  maybeAutoJoin()
  maybePromptForName()
}
