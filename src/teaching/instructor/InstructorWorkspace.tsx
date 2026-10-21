import type { ReactNode } from 'react'

export interface InstructorWorkspaceProps {
  accountAction: ReactNode
  scenarioAction?: ReactNode
  settingsAction?: ReactNode
  runtime?: ReactNode
  dialogs?: ReactNode
}

/** Product-neutral instructor chrome shared by EDUSIM simulators. */
export function InstructorWorkspace({ accountAction, scenarioAction, settingsAction, runtime, dialogs }: InstructorWorkspaceProps) {
  return <>
    {accountAction}
    {scenarioAction}
    {settingsAction}
    {runtime}
    {dialogs}
  </>
}
