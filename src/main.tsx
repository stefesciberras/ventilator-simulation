import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EdusimLanding } from './EdusimLanding'
import { EduventApp } from './eduvent/EduventApp'
import { ScenarioBuilderApp } from './scenario-builder/ScenarioBuilderApp'
import { ActionEditorApp } from './action-editor/ActionEditorApp'
import { EdumonApp } from './edumon/EdumonApp'
import { installTabletResponsiveMode } from './tabletResponsiveRuntime'
import { installSelfDirectedScenarioPanelDrag } from './selfDirectedScenarioPanel'
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
import './components/SharedAlarmMetricHighlight.css'
import './scenario-builder/scenarioNavigation.css'

const pathname = window.location.pathname
const isLandingRoute = pathname === '/'
const isEduventRoute = pathname === '/eduvent' || pathname.startsWith('/eduvent/')
const isEdumonRoute = pathname === '/edumon' || pathname.startsWith('/edumon/')
const isScenarioBuilderRoute = pathname === '/scenarios' || pathname.startsWith('/scenarios/')
const isActionEditorRoute = pathname === '/actions' || pathname.startsWith('/actions/')

if (isEduventRoute || isEdumonRoute) {
  installTabletResponsiveMode()
  if (isEduventRoute) installSelfDirectedScenarioPanelDrag()
}

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
