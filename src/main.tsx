import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EdusimLanding } from './EdusimLanding'
import { EduventApp } from './eduvent/EduventApp'
import { ScenarioBuilderApp } from './scenario-builder/ScenarioBuilderApp'
import { ActionEditorApp } from './action-editor/ActionEditorApp'
import { installActionEditorEffectsHelpRuntime } from './action-editor/actionEditorEffectsHelpRuntime'
import { EdumonApp } from './edumon/EdumonApp'
import { installTabletResponsiveMode } from './tabletResponsiveRuntime'
import { installSelfDirectedScenarioPanelDrag } from './selfDirectedScenarioPanel'
import { installCollapsibleHeaderRuntime } from './components/collapsibleHeaderRuntime'
import { installActionLevelIndicatorRuntime } from './edumon/actionLevelIndicatorRuntime'
import { installEdumonDoaInteractionRuntime, installSimulatorBackNavigationGuard } from './simulationInteractionRuntime'
import { SharedAlarmMetricHighlight } from './components/SharedAlarmMetricHighlight'
import { EDUMON_ALARM_METRIC_HIGHLIGHTS } from './edumon/alarmMetricHighlights'
import './styles.css'
import './alarm.css'
import './mobile-metrics.css'
import './teaching/TeachingMediaPresentation.css'
import './teaching/TeachingSharedWaveform.css'
import './tablet-responsive.css'
import './tablet-runtime.css'
import './selfDirectedScenarioPanel.css'
import './edumon/mobile-display-fixes.css'
import './edumon/action-level-indicator.css'
import './edumon/footer-alignment.css'
import './edumon/patient-control-cleanup.css'
import './action-editor/actionEditorEnhancements.css'
import './components/SharedAlarmMetricHighlight.css'
import './components/collapsibleHeaderRuntime.css'
import './scenario-builder/scenarioNavigation.css'
import './simulationInteractionRuntime.css'

const pathname = window.location.pathname
const isLandingRoute = pathname === '/'
const isEduventRoute = pathname === '/eduvent' || pathname.startsWith('/eduvent/')
const isEdumonRoute = pathname === '/edumon' || pathname.startsWith('/edumon/')
const isScenarioBuilderRoute = pathname === '/scenarios' || pathname.startsWith('/scenarios/')
const isActionEditorRoute = pathname === '/actions' || pathname.startsWith('/actions/')

if (isEduventRoute || isEdumonRoute) {
  installSimulatorBackNavigationGuard()
  installTabletResponsiveMode()
  installCollapsibleHeaderRuntime()
  if (isEdumonRoute) {
    installActionLevelIndicatorRuntime()
    installEdumonDoaInteractionRuntime()
  }
  if (isEduventRoute) installSelfDirectedScenarioPanelDrag()
}

if (isActionEditorRoute) installActionEditorEffectsHelpRuntime()

function RoutedApp() {
  if (isActionEditorRoute) return <ActionEditorApp />
  if (isScenarioBuilderRoute) return <ScenarioBuilderApp />
  if (isEdumonRoute) return <EdumonApp />
  if (isEduventRoute) return <EduventApp />
  if (isLandingRoute) return <EdusimLanding />
  return <EdusimLanding />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SharedAlarmMetricHighlight rules={isEdumonRoute ? EDUMON_ALARM_METRIC_HIGHLIGHTS : []} />
    <RoutedApp />
  </StrictMode>,
)
