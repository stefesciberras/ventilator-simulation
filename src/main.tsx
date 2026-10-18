import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ScenarioBuilderApp } from './scenario-builder/ScenarioBuilderApp'
import { installTabletResponsiveMode } from './tabletResponsiveRuntime'
import './styles.css'
import './alarm.css'
import './mobile-metrics.css'
import './teaching/TeachingMediaPresentation.css'
import './tablet-responsive.css'
import './tablet-runtime.css'

const isScenarioBuilderRoute = window.location.pathname === '/scenarios' || window.location.pathname.startsWith('/scenarios/')

if (!isScenarioBuilderRoute) installTabletResponsiveMode()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isScenarioBuilderRoute ? <ScenarioBuilderApp /> : <App />}
  </StrictMode>,
)
