import type { ReactNode } from 'react'
import type { SimulationProductAdapter } from '../../core/SimulationProductAdapter'
import type { SharedInstructorDashboardConfig, SharedSessionDomain } from './SharedSessionModePanel'

export function buildProductSessionDomains(
  product: SimulationProductAdapter,
  session: unknown,
  onUpdatePolicy?: (patch: unknown) => void | Promise<unknown>,
): SharedSessionDomain[] {
  if (!session || !product.session?.domains.length) return []
  return product.session.domains.map((domain) => ({
    id: domain.id,
    title: domain.title,
    status: domain.status(session),
    active: domain.active?.(session) ?? false,
    rows: domain.rows.map((row) => ({
      id: row.id,
      label: row.label,
      checked: row.checked(session),
      disabled: row.disabled?.(session) ?? (!row.patch || !onUpdatePolicy),
      emphasis: row.emphasis,
      readOnly: !row.patch || !onUpdatePolicy,
      onChange: row.patch && onUpdatePolicy ? (checked: boolean) => onUpdatePolicy(row.patch!(checked)) : undefined,
    })),
  }))
}

export function ProductCandidateStatus({ product, session }: { product: SimulationProductAdapter; session: unknown }) {
  const definitions = product.session?.candidateStatus ?? []
  if (!session || !definitions.length) return null
  return <div className="candidate-control-status">{definitions.map((definition) => (
    <span key={definition.id} className={definition.state?.(session) ?? 'available'}>{definition.text(session)}</span>
  ))}</div>
}

export function ProductCandidateTelemetry({ product, member }: { product: SimulationProductAdapter; member: unknown }) {
  const definitions = product.session?.telemetry ?? []
  if (!definitions.length) return null
  return <div className="candidate-state-grid">{definitions.map((definition) => (
    <div key={definition.id}><span>{definition.label}</span><strong>{definition.value(member)}</strong></div>
  ))}</div>
}

export function buildProductInstructorDashboard(
  product: SimulationProductAdapter,
  session: unknown,
  options: {
    onUpdatePolicy?: (patch: unknown) => void | Promise<unknown>
    runtimeBadge?: ReactNode
    simulationPaused?: boolean
    onSimulationPausedChange?: (paused: boolean) => void
    pausedMessage?: string
    onBroadcastNow?: () => void | Promise<unknown>
    broadcastLabel?: string
    instructorNotice?: ReactNode
    collapseStorageKey?: string
  } = {},
): SharedInstructorDashboardConfig {
  return {
    ...options,
    domains: buildProductSessionDomains(product, session, options.onUpdatePolicy),
    candidateStatus: session ? <ProductCandidateStatus product={product} session={session} /> : null,
  }
}
