import { useEffect, useRef, useState } from 'react'
import { InstructorAccountDialog, InstructorCloudIcon, useInstructorAccountAuth } from './InstructorAccountAuth'
import { getSessionLogRuntimeContext } from '../teaching/session/sessionLog'
import { LOPPJUSIM_OPEN_SCENARIOS_EVENT, LOPPJUSIM_SESSION_ENDED_EVENT } from '../core/platformEvents'
import './LoppjuSimPlatformMenu.css'

export type LoppjuSimRunMode = 'standalone' | 'instructor' | 'candidate'

interface LoppjuSimPlatformMenuProps {
  role?: LoppjuSimRunMode
  productLabel: string
}

function MenuIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
}

function ScenarioIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v13H5z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M8 9h8M8 12h5M8 15h7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M8 3.5h8v4H8z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
}

function StudioIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5zM8 9h8M8 12h8M8 15h5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function LibraryIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h12v15H6zM9 4.5v15M12 8h3M12 12h3M12 16h3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function SettingsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm7.3 3.8-.1-1.1 2-1.6-2-3.4-2.4 1a8.2 8.2 0 0 0-1.9-1.1L14.6 3h-4l-.4 2.8a8.2 8.2 0 0 0-1.9 1.1l-2.4-1-2 3.4 2 1.6-.1 1.1.1 1.1-2 1.6 2 3.4 2.4-1a8.2 8.2 0 0 0 1.9 1.1l.4 2.8h4l.4-2.8a8.2 8.2 0 0 0 1.9-1.1l2.4 1 2-3.4-2-1.6.1-1.1Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
}

const modeLabel = (role: LoppjuSimRunMode) => role === 'standalone' ? 'Standalone' : role === 'instructor' ? 'Instructor session' : 'Candidate session'

function scenarioProductForLabel(productLabel: string) {
  if (productLabel === 'LoppjuSIM-Anaesth') return 'anaesth'
  if (productLabel === 'LoppjuSIM-ICU') return 'icu'
  return 'mv'
}

export function LoppjuSimPlatformMenu({ role, productLabel }: LoppjuSimPlatformMenuProps) {
  const [open, setOpen] = useState(false)
  const [runtimeRole, setRuntimeRole] = useState<LoppjuSimRunMode>(() => getSessionLogRuntimeContext().role)
  const menuRef = useRef<HTMLDivElement>(null)
  const effectiveRole = role ?? runtimeRole
  const previousEffectiveRoleRef = useRef<LoppjuSimRunMode>(effectiveRole)
  const auth = useInstructorAccountAuth({ locked: effectiveRole !== 'standalone' })
  const authenticated = Boolean(auth.account)
  const platformUnlocked = authenticated && effectiveRole === 'standalone'
  const scenarioLibraryAvailable = authenticated && effectiveRole !== 'candidate'
  const scenarioProduct = scenarioProductForLabel(productLabel)
  const drugEventLibraryAvailable = productLabel !== 'LoppjuSIM-MV'

  useEffect(() => {
    if (role) return
    const update = () => setRuntimeRole(getSessionLogRuntimeContext().role)
    update()
    const timer = window.setInterval(update, 150)
    return () => window.clearInterval(timer)
  }, [role])

  useEffect(() => {
    const previous = previousEffectiveRoleRef.current
    previousEffectiveRoleRef.current = effectiveRole
    if (previous !== 'standalone' && effectiveRole === 'standalone') {
      window.dispatchEvent(new Event(LOPPJUSIM_SESSION_ENDED_EVENT))
    }
  }, [effectiveRole])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const openAccount = () => {
    setOpen(false)
    auth.setAuthMode('signin')
    auth.setMessage(null)
    auth.setError(null)
    auth.setOpen(true)
  }

  const openScenarios = () => {
    if (!scenarioLibraryAvailable) return
    setOpen(false)
    window.dispatchEvent(new Event(LOPPJUSIM_OPEN_SCENARIOS_EVENT))
  }

  const openSettings = () => {
    if (!platformUnlocked) return
    setOpen(false)
    window.dispatchEvent(new CustomEvent('loppjusim:open-settings'))
  }

  const navigate = (href: string) => {
    if (!platformUnlocked) return
    window.location.assign(href)
  }

  return <>
    <div className="loppjusim-platform-menu" ref={menuRef}>
      <button
        type="button"
        className={`top-account-button loppjusim-menu-button ${authenticated ? 'connected' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open LoppjuSIM menu"
        title="LoppjuSIM menu"
        onClick={() => setOpen((current) => !current)}
      >
        <MenuIcon />
      </button>
      {open && <section className="loppjusim-menu-popover" role="menu" aria-label="LoppjuSIM menu">
        <div className="loppjusim-menu-heading">
          <div>
            <span>{productLabel}</span>
            <strong>LoppjuSIM</strong>
          </div>
          <span className={`loppjusim-mode-badge ${effectiveRole}`}>{modeLabel(effectiveRole)}</span>
        </div>
        <div className="loppjusim-menu-account">
          <InstructorCloudIcon connected={authenticated} />
          <div><span>{authenticated ? 'Signed in' : 'Standalone access'}</span><strong>{auth.account?.email ?? 'No account connected'}</strong></div>
        </div>
        <div className="loppjusim-menu-items">
          <button type="button" role="menuitem" onClick={openAccount} disabled={effectiveRole !== 'standalone'}>
            <InstructorCloudIcon connected={authenticated} /><span>{authenticated ? 'Account' : 'Sign in'}</span>
          </button>
          <button type="button" role="menuitem" disabled title="Registration will be enabled later">
            <span className="loppjusim-menu-icon-text">+</span><span>Register</span><small>Coming soon</small>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!scenarioLibraryAvailable}
            title={!authenticated ? 'Sign in as an instructor to access the scenario library' : effectiveRole === 'candidate' ? 'Candidates receive scenarios through their active session' : undefined}
            onClick={openScenarios}
          >
            <ScenarioIcon /><span>Scenarios</span><small>{effectiveRole === 'instructor' ? 'Switch scenario' : authenticated ? 'Open library' : 'Instructor sign-in required'}</small>
          </button>
          <button type="button" role="menuitem" disabled={!platformUnlocked} onClick={() => navigate(`/scenarios?product=${scenarioProduct}`)}>
            <StudioIcon /><span>Scenario Studio</span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!platformUnlocked || !drugEventLibraryAvailable}
            title={drugEventLibraryAvailable ? undefined : 'Drug & Event Library is not yet available for LoppjuSIM-MV'}
            onClick={() => drugEventLibraryAvailable && navigate('/actions')}
          >
            <LibraryIcon /><span>Drug &amp; Event Library</span>{!drugEventLibraryAvailable && <small>Coming later</small>}
          </button>
          <button type="button" role="menuitem" disabled={!platformUnlocked} onClick={openSettings}>
            <SettingsIcon /><span>Settings</span>
          </button>
        </div>
        {!authenticated && <p className="loppjusim-menu-hint">Sign in to enable instructor scenario libraries, authoring tools and settings. Unauthenticated users can still run Standalone simulation or join scenarios through a session invitation/key.</p>}
        {effectiveRole !== 'standalone' && <p className="loppjusim-menu-hint">Session mode is active. Account changes and standalone authoring tools are locked until the session ends.</p>}
      </section>}
    </div>
    <InstructorAccountDialog auth={auth} locked={effectiveRole !== 'standalone'} />
  </>
}
