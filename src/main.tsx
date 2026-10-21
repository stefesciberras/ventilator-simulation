import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { EdusimLanding } from './EdusimLanding'
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

const pathname = window.location.pathname
const isLandingRoute = pathname === '/'
const isEduventRoute = pathname === '/eduvent' || pathname.startsWith('/eduvent/')
const isEdumonRoute = pathname === '/edumon' || pathname.startsWith('/edumon/')
const isScenarioBuilderRoute = pathname === '/scenarios' || pathname.startsWith('/scenarios/')

if (isEduventRoute || isEdumonRoute) {
  installTabletResponsiveMode()
  if (isEdumonRoute) installEdumonMobileWorkspace()
  else installSelfDirectedScenarioPanelDrag()
}

function RoutedApp() {
  if (isScenarioBuilderRoute) return <ScenarioBuilderApp />
  if (isEdumonRoute) return <EdumonApp />
  if (isEduventRoute) return <App />
  if (isLandingRoute) return <EdusimLanding />
  return <EdusimLanding />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RoutedApp />
  </StrictMode>,
)
