import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ScenarioBuilderApp } from './scenario-builder/ScenarioBuilderApp'
import { EdumonApp } from './edumon/EdumonApp'
import { installEdumonMobileWorkspace } from './edumon/edumonMobileWorkspace'
import { installTabletResponsiveMode } from './tabletResponsiveRuntime'
import { installSelfDirectedScenarioPanelDrag } from './selfDirectedScenarioPanel'
import './styles.css'
import './alarm.css'
import './mobile-metrics.css'
import './teaching/TeachingMediaPresentation.css'
import './teaching/TeachingSharedWaveform.css'
import './tablet-responsive.css'
import './tablet-runtime.css'
import './selfDirectedScenarioPanel.css'

const isScenarioBuilderRoute = window.location.pathname === '/scenarios' || window.location.pathname.startsWith('/scenarios/')
const isEdumonRoute = window.location.pathname === '/edumon' || window.location.pathname.startsWith('/edumon/')

if (!isScenarioBuilderRoute) {
  installTabletResponsiveMode()
  if (isEdumonRoute) installEdumonMobileWorkspace()
  else installSelfDirectedScenarioPanelDrag()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isScenarioBuilderRoute ? <ScenarioBuilderApp /> : isEdumonRoute ? <EdumonApp /> : <App />}
  </StrictMode>,
)
