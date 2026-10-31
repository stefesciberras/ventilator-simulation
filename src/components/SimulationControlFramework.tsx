import type { CSSProperties, ReactNode } from 'react'

export interface SimulationControlTabDefinition<TTab extends string> {
  id: TTab
  label: string
  content: ReactNode
  locked?: boolean
  lockLabel?: string
  lockClassName?: string
  panelClassName?: string
  disabled?: boolean
}

export interface SimulationControlProfileDefinition<TProfile extends string> {
  id: TProfile
  label: ReactNode
  active?: boolean
  disabled?: boolean
  className?: string
  title?: string
  onSelect: (profile: TProfile) => void
}

interface SimulationControlFrameworkProps<TTab extends string, TProfile extends string> {
  activeTab: TTab
  tabs: Array<SimulationControlTabDefinition<TTab>>
  onTabChange: (tab: TTab) => void
  profiles?: Array<SimulationControlProfileDefinition<TProfile>>
  footer?: ReactNode
  ariaLabel?: string
  className?: string
  tabsClassName?: string
  bodyClassName?: string
  profileClassName?: string
}

export function SimulationControlFramework<TTab extends string, TProfile extends string>({
  activeTab,
  tabs,
  onTabChange,
  profiles = [],
  footer,
  ariaLabel = 'Simulation controls',
  className = '',
  tabsClassName = '',
  bodyClassName = '',
  profileClassName = '',
}: SimulationControlFrameworkProps<TTab, TProfile>) {
  const selected = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]
  const isEdumonControlRow = tabsClassName.split(/\s+/).includes('edumon-control-tabs')
  const edumonTabRowStyle: CSSProperties | undefined = isEdumonControlRow
    ? {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gridAutoFlow: 'column',
        alignItems: 'stretch',
      }
    : undefined

  return (
    <aside className={`control-panel edusim-control-framework ${className}`.trim()} aria-label={ariaLabel}>
      <div className="edusim-control-navigation-stack control-navigation-stack">
        {profiles.length > 0 && (
          <div className={`patient-profile-strip edusim-profile-strip ${profileClassName}`.trim()} role="group" aria-label="Patient profiles">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                className={`${profile.active ? 'active' : ''} ${profile.className ?? ''}`.trim()}
                disabled={profile.disabled}
                aria-pressed={Boolean(profile.active)}
                title={profile.title}
                onClick={() => profile.onSelect(profile.id)}
              >{profile.label}</button>
            ))}
          </div>
        )}
        <nav className={`control-tabs edusim-control-tabs ${tabsClassName}`.trim()} role="tablist" aria-label="Simulator controls" style={edumonTabRowStyle}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected?.id === tab.id}
              className={selected?.id === tab.id ? 'active' : ''}
              disabled={tab.disabled}
              onClick={() => onTabChange(tab.id)}
            >{tab.label}</button>
          ))}
        </nav>
      </div>

      <div className={`edusim-control-panel-body control-tab-content ${bodyClassName}`.trim()}>
        {tabs.map((tab) => {
          const active = selected?.id === tab.id
          const wrapInLockFieldset = Boolean(tab.locked || tab.lockClassName)
          return (
            <div
              key={tab.id}
              className={`control-tab-pane edusim-control-tab-pane ${tab.panelClassName ?? ''}`.trim()}
              role="tabpanel"
              hidden={!active}
              aria-hidden={!active}
            >
              {wrapInLockFieldset ? (
                <fieldset className={`session-lock-fieldset ${tab.locked ? 'locked' : ''} edusim-control-lock ${tab.lockClassName ?? ''}`.trim()} disabled={tab.locked}>
                  {tab.locked && <div className="session-control-lock-label">{tab.lockLabel ?? 'Instructor controlled'}</div>}
                  {tab.content}
                </fieldset>
              ) : tab.content}
            </div>
          )
        })}
      </div>

      {footer && <div className="edusim-control-framework-footer">{footer}</div>}
    </aside>
  )
}
