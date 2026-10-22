import { APP_VERSION } from './appVersion'
import { EDUMON_APP_VERSION } from './edumon/appVersion'
import { SCENARIO_BUILDER_VERSION } from './scenario-builder/version'
import './edusim-landing.css'

interface SimulatorCardProps {
  href: string
  kicker: string
  title: string
  description: string
  detail: string
  status?: string
}

function SimulatorCard({ href, kicker, title, description, detail, status }: SimulatorCardProps) {
  return (
    <a className="edusim-simulator-card" href={href}>
      <div className="edusim-simulator-card-heading">
        <span>{kicker}</span>
        {status && <em>{status}</em>}
      </div>
      <strong>{title}</strong>
      <p>{description}</p>
      <small>{detail}</small>
      <div className="edusim-card-action">Open simulator <span aria-hidden="true">→</span></div>
    </a>
  )
}

export function EdusimLanding() {
  return (
    <main className="edusim-landing-page">
      <section className="edusim-landing-shell">
        <header className="edusim-landing-heading">
          <span>Clinical simulation platform</span>
          <h1>EDUSIM</h1>
          <p>Choose a simulator or open the shared scenario authoring workspace. EDUSIM products share teaching, session and responsive-interface foundations while keeping their clinical simulation engines independent.</p>
        </header>

        <div className="edusim-simulator-grid">
          <SimulatorCard
            href="/eduvent"
            kicker="EDUVENT"
            title="Mechanical Ventilation Simulator"
            description="Interactive ventilation, respiratory physiology and scenario-based teaching."
            detail="Ventilator engine · waveforms · patient physiology · instructor sessions"
            status={`v${APP_VERSION}`}
          />
          <SimulatorCard
            href="/edumon/ana"
            kicker="EDUMON-Ana"
            title="Anaesthesia Patient Monitor"
            description="Multiparameter monitoring for anaesthesia simulation and teaching."
            detail="ECG · arterial pressure · SpO₂ · anaesthesia-oriented auxiliary monitors"
            status={`v${EDUMON_APP_VERSION}`}
          />
          <SimulatorCard
            href="/edumon/icu"
            kicker="EDUMON-ICU"
            title="Intensive Care Patient Monitor"
            description="Multiparameter monitoring for intensive-care simulation and teaching."
            detail="ECG · arterial pressure · SpO₂ · ICU-oriented auxiliary monitors"
            status={`v${EDUMON_APP_VERSION}`}
          />
          <SimulatorCard
            href="/scenarios"
            kicker="SCENARIO BUILDER"
            title="Scenario Authoring"
            description="Build and maintain reusable static and dynamic simulation scenarios."
            detail="Shared scenario workflow for EDUVENT, EDUMON-Ana and EDUMON-ICU"
            status={`v${SCENARIO_BUILDER_VERSION}`}
          />
        </div>

        <footer className="edusim-landing-footer">
          <span>Educational simulation only</span>
          <small>Not a medical device and not for clinical decision-making.</small>
        </footer>
      </section>
    </main>
  )
}
