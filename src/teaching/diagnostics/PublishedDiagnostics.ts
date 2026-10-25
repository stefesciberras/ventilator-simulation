import { supabase } from '../../session/supabase'
import { requireInstructorAccount } from '../account/InstructorAccountService'

export interface PublishedDiagnosticReference {
  id: string
  createdAt: string
}

type DiagnosticProduct = {
  id?: unknown
  label?: unknown
  appVersion?: unknown
}

function diagnosticProduct(diagnostic: Record<string, unknown>): DiagnosticProduct {
  const product = diagnostic.product
  return product && typeof product === 'object' ? product as DiagnosticProduct : {}
}

export async function publishSimulationDiagnostics(
  diagnostics: Array<Record<string, unknown>>,
): Promise<PublishedDiagnosticReference> {
  if (diagnostics.length === 0) throw new Error('No diagnostics were captured to publish.')

  const user = await requireInstructorAccount()
  const first = diagnostics[0]
  const product = diagnosticProduct(first)
  const publishedAt = new Date().toISOString()
  const bundle = {
    schema: 'edusim-published-diagnostic-bundle-v1',
    publishedAt,
    snapshotCount: diagnostics.length,
    snapshots: diagnostics,
  }

  const { data, error } = await supabase
    .from('edusim_published_diagnostics')
    .insert({
      created_by: user.id,
      product_id: String(product.id ?? 'unknown'),
      product_label: String(product.label ?? 'EDUSIM'),
      app_version: String(product.appVersion ?? ''),
      kind: 'diagnostic-bundle',
      diagnostic: bundle,
    })
    .select('id,created_at')
    .single()

  if (error) throw error

  return {
    id: String(data.id),
    createdAt: String(data.created_at),
  }
}
