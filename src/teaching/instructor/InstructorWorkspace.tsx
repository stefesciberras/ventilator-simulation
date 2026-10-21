import type { ReactNode } from 'react'

export interface InstructorWorkspaceProps {
  accountAction: ReactNode
  scenarioAction?: ReactNode
  settingsAction?: ReactNode
  runtime?: ReactNode
  dialogs?: ReactNode
}

/**
 * Product-neutral instructor chrome. Products provide their scenario/runtime
 * adapter, while the account/settings/scenario actions share one predictable
 * top-bar composition.
 */
export function InstructorWorkspace({ accountAction, scenarioAction, settingsAction, runtime, dialogs }: InstructorWorkspaceProps) {
  return <>
    {accountAction}
    {scenarioAction}
    {settingsAction}
    {runtime}
    {dialogs}
  </>
}
