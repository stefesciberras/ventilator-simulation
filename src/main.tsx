import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ScenarioBuilderApp } from './scenario-builder/ScenarioBuilderApp'
import './styles.css'
import './alarm.css'
import './mobile-metrics.css'

const isScenarioBuilderRoute = window.location.pathname === '/scenarios' || window.location.pathname.startsWith('/scenarios/')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isScenarioBuilderRoute ? <ScenarioBuilderApp /> : <App />}
  </StrictMode>,
)
