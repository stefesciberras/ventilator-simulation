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
  disabled?: boolean
}

function SimulatorCard({ href, kicker, title, description, detail, status, disabled = false }: SimulatorCardProps) {
  const content = (
    <>
      <div className="edusim-simulator-card-heading">
        <span>{kicker}</span>
        {status && <em>{status}</em>}
      </div>
      <strong>{title}</strong>
      <p>{description}</p>
      <small>{detail}</small>
      <div className="edusim-card-action">{disabled ? 'Coming soon' : 'Open simulator'} {!disabled && <span aria-hidden="true">→</span>}</div>
    </>
  )

  if (disabled) {
    return <div className="edusim-simulator-card" aria-disabled="true">{content}</div>
  }

  return <a className="edusim-simulator-card" href={href}>{content}</a>
}

export function EdusimLanding() {
  return (
    <main className="edusim-landing-page">
      <section className="edusim-landing-shell">
        <header className="edusim-landing-heading">
          <span>Clinical simulation platform</span>
          <h1>LoppjuSIM</h1>
          <p>Choose a simulator or open LoppjuSIM-Studio, the shared authoring workspace. LoppjuSIM products share teaching, session and responsive-interface foundations while keeping their clinical simulation engines independent.</p>
        </header>

        <div className="edusim-simulator-grid">
          <SimulatorCard
            href="/eduvent"
            kicker="LoppjuSIM-MV"
            title="Mechanical Ventilation Simulator"
            description="Interactive ventilation, respiratory physiology and scenario-based teaching."
            detail="Ventilator engine · waveforms · patient physiology · instructor sessions"
            status={`v${APP_VERSION}`}
          />
          <SimulatorCard
            href="/edumon/ana"
            kicker="LoppjuSIM-Anaesth"
            title="Anaesthesia Patient Monitor"
            description="Multiparameter monitoring for anaesthesia simulation and teaching."
            detail="ECG · arterial pressure · SpO₂ · anaesthesia-oriented auxiliary monitors"
            status={`v${EDUMON_APP_VERSION}`}
          />
          <SimulatorCard
            href="/edumon/icu"
            kicker="LoppjuSIM-ICU"
            title="Intensive Care Patient Monitor"
            description="Multiparameter monitoring for intensive-care simulation and teaching."
            detail="ECG · arterial pressure · SpO₂ · ICU-oriented auxiliary monitors"
            status="Coming soon"
            disabled
          />
          <SimulatorCard
            href="/scenarios"
            kicker="LoppjuSIM-Studio"
            title="Simulation Authoring"
            description="Build and maintain reusable static and dynamic simulation scenarios and shared teaching content."
            detail="Shared authoring workflow for LoppjuSIM-MV, LoppjuSIM-Anaesth and LoppjuSIM-ICU"
            status={`v${SCENARIO_BUILDER_VERSION}`}
          />
        </div>

        <footer className="edusim-landing-footer">
          <span>For education and simulation training only</span>
          <small>Not intended for use as a medical device or for clinical decision-making. © 2026 Stephen Sciberras. LoppjuSIM. All rights reserved.</small>
        </footer>
      </section>
    </main>
  )
}
