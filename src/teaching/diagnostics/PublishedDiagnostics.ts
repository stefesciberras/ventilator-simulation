import type { SimulationDiagnosticOptions } from '../../core/SimulationDiagnostics'
import { createSimulationDiagnostic } from '../../core/SimulationDiagnostics'
import { supabase } from '../../session/supabase'
import { requireInstructorAccount } from '../account/InstructorAccountService'

export interface PublishedDiagnosticReference {
  id: string
  createdAt: string
}

export async function publishSimulationDiagnostic<TSample = never>(
  options: SimulationDiagnosticOptions<TSample>,
): Promise<PublishedDiagnosticReference> {
  const user = await requireInstructorAccount()
  const diagnostic = createSimulationDiagnostic(options)
  const { data, error } = await supabase
    .from('edusim_published_diagnostics')
    .insert({
      created_by: user.id,
      product_id: options.productId,
      product_label: options.productLabel,
      app_version: options.appVersion,
      kind: options.kind,
      diagnostic,
    })
    .select('id,created_at')
    .single()

  if (error) throw error

  return {
    id: String(data.id),
    createdAt: String(data.created_at),
  }
}
