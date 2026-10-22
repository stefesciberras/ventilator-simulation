import { useEffect, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  createInstructorAccount,
  getInstructorAccount,
  signInInstructor,
  signOutInstructor,
  subscribeToInstructorAccount,
} from '../teaching/account/InstructorAccountService'
import '../account.css'

export interface InstructorAccountAuthState {
  account: User | null
  open: boolean
  authMode: 'signin' | 'signup'
  email: string
  password: string
  busy: boolean
  message: string | null
  error: string | null
  setOpen: (open: boolean) => void
  setAuthMode: (mode: 'signin' | 'signup') => void
  setEmail: (email: string) => void
  setPassword: (password: string) => void
  setMessage: (message: string | null) => void
  setError: (error: string | null) => void
  submitAuth: (event: FormEvent) => Promise<void>
  logout: () => Promise<void>
}

export function useInstructorAccountAuth({
  locked = false,
  onAccountChange,
}: {
  locked?: boolean
  onAccountChange?: (account: User | null) => void
} = {}): InstructorAccountAuthState {
  const [account, setAccount] = useState<User | null>(null)
  const [open, setOpen] = useState(false)
  const [authMode, setAuthModeState] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void getInstructorAccount().then((user) => {
      if (!active) return
      setAccount(user)
    }).catch(() => undefined)
    const unsubscribe = subscribeToInstructorAccount((user) => {
      if (!active) return
      setAccount(user)
      setMessage(null)
      setError(null)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    onAccountChange?.(account)
  }, [account, onAccountChange])

  const setAuthMode = (mode: 'signin' | 'signup') => {
    setAuthModeState(mode)
    setMessage(null)
    setError(null)
  }

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault()
    if (locked) {
      setError('End or leave the teaching session before changing instructor account.')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      if (authMode === 'signin') {
        const user = await signInInstructor(email, password)
        setAccount(user)
        setMessage('Instructor account connected.')
        setPassword('')
      } else {
        const created = await createInstructorAccount(email, password)
        setPassword('')
        if (created.confirmationRequired) {
          setMessage('Account created. Check your email to confirm the address, then return to EDUSIM and sign in.')
        } else if (created.user) {
          setAccount(created.user)
          setMessage('Instructor account created and connected.')
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to complete account request.')
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    if (locked) {
      setError('End or leave the teaching session before signing out.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await signOutInstructor()
      setAccount(null)
      setMessage('Instructor cloud account disconnected.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign out.')
    } finally {
      setBusy(false)
    }
  }

  return {
    account,
    open,
    authMode,
    email,
    password,
    busy,
    message,
    error,
    setOpen,
    setAuthMode,
    setEmail,
    setPassword,
    setMessage,
    setError,
    submitAuth,
    logout,
  }
}

export function InstructorCloudIcon({ connected }: { connected: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.2 18.2h10.1a4 4 0 0 0 .7-7.9A6.2 6.2 0 0 0 6.2 8.6a4.9 4.9 0 0 0 1 9.6Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      {connected && <path d="m9.2 13.2 1.8 1.8 3.9-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}

export function InstructorAccountButton({ auth }: { auth: InstructorAccountAuthState }) {
  const label = auth.account?.email ?? 'Instructor cloud account'
  return (
    <button
      type="button"
      className={`top-account-button ${auth.account ? 'connected' : ''}`}
      title={label}
      aria-label={auth.account ? `Instructor cloud account connected as ${auth.account.email}` : 'Instructor cloud account sign in'}
      onClick={() => { auth.setOpen(true); auth.setMessage(null); auth.setError(null) }}
    >
      <InstructorCloudIcon connected={Boolean(auth.account)} />
    </button>
  )
}

export function InstructorAccountDialog({
  auth,
  locked = false,
}: {
  auth: InstructorAccountAuthState
  locked?: boolean
}) {
  if (!auth.open) return null
  return (
    <div className="account-dialog-backdrop" onMouseDown={() => auth.setOpen(false)}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-label="Instructor cloud account" onMouseDown={(event) => event.stopPropagation()}>
        <div className="account-dialog-heading">
          <div><span>Cloud</span><h2>Instructor account</h2></div>
          <button type="button" className="account-close-button" onClick={() => auth.setOpen(false)} aria-label="Close account dialog"><span aria-hidden="true">×</span></button>
        </div>

        {auth.account ? (
          <div className="account-connected-card">
            <span>Connected instructor</span>
            <strong>{auth.account.email}</strong>
            <small>Cloud scenarios and teaching resources are private to this account.</small>
            <button type="button" className="account-secondary-button" disabled={auth.busy || locked} onClick={() => void auth.logout()}>Sign out</button>
            {locked && <p>Finish the current teaching session before changing accounts.</p>}
          </div>
        ) : (
          <>
            <div className="account-auth-tabs" role="tablist" aria-label="Instructor account action">
              <button type="button" className={auth.authMode === 'signin' ? 'selected' : ''} onClick={() => auth.setAuthMode('signin')}>Sign in</button>
              <button type="button" className={auth.authMode === 'signup' ? 'selected' : ''} onClick={() => auth.setAuthMode('signup')}>Create account</button>
            </div>
            <form className="account-auth-form" onSubmit={(event) => void auth.submitAuth(event)}>
              <label><span>Email</span><input type="email" value={auth.email} onChange={(event) => auth.setEmail(event.target.value)} autoComplete="email" required /></label>
              <label><span>Password</span><input type="password" value={auth.password} onChange={(event) => auth.setPassword(event.target.value)} autoComplete={auth.authMode === 'signin' ? 'current-password' : 'new-password'} minLength={8} required /></label>
              <button type="submit" className="account-primary-button" disabled={auth.busy || locked}>{auth.busy ? 'Please wait…' : auth.authMode === 'signin' ? 'Sign in' : 'Create instructor account'}</button>
            </form>
            {locked && <p className="account-hint">Finish the current teaching session before changing accounts.</p>}
          </>
        )}
        {auth.message && <div className="account-message">{auth.message}</div>}
        {auth.error && <div className="account-error" role="alert">{auth.error}</div>}
      </section>
    </div>
  )
}
