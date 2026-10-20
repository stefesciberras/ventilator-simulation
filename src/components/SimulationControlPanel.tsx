import type { ReactNode } from 'react'

export interface SimulationControlTab<T extends string> {
  id: T
  label: string
}

interface SimulationControlPanelProps<T extends string> {
  activeTab: T
  tabs: Array<SimulationControlTab<T>>
  onTabChange: (tab: T) => void
  profileStrip?: ReactNode
  children: ReactNode
  ariaLabel?: string
  className?: string
  tabsClassName?: string
  bodyClassName?: string
}

export function SimulationControlPanel<T extends string>({
  activeTab,
  tabs,
  onTabChange,
  profileStrip,
  children,
  ariaLabel = 'Simulation controls',
  className = '',
  tabsClassName = '',
  bodyClassName = '',
}: SimulationControlPanelProps<T>) {
  return (
    <aside className={`control-panel ${className}`.trim()} aria-label={ariaLabel}>
      {profileStrip}
      <div className={`control-tabs edusim-control-tabs ${tabsClassName}`.trim()} role="tablist" aria-label="Control sections">
        {tabs.map(({ id, label }) => (
          <button key={id} type="button" role="tab" aria-selected={activeTab === id} className={activeTab === id ? 'active' : ''} onClick={() => onTabChange(id)}>{label}</button>
        ))}
      </div>
      <div className={`edusim-control-panel-body ${bodyClassName}`.trim()}>{children}</div>
    </aside>
  )
}

interface SimulationProfileStripProps<T extends string> {
  profiles: readonly T[]
  activeProfile: T
  onProfileChange: (profile: T) => void
  className?: string
}

export function SimulationProfileStrip<T extends string>({ profiles, activeProfile, onProfileChange, className = '' }: SimulationProfileStripProps<T>) {
  return (
    <div className={`patient-profile-strip edusim-profile-strip ${className}`.trim()} aria-label="Patient profiles">
      {profiles.map((profile) => (
        <button key={profile} type="button" className={activeProfile === profile ? 'active' : ''} onClick={() => onProfileChange(profile)}>{profile}</button>
      ))}
    </div>
  )
}
