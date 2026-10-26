import type { ReactNode } from 'react'

export interface InstructorWorkspaceProps {
  accountAction: ReactNode
  scenarioAction?: ReactNode
  settingsAction?: ReactNode
  runtime?: ReactNode
  dialogs?: ReactNode
}

/** Product-neutral instructor/session chrome. Platform account/settings actions live in the shared LoppjuSIM menu. */
export function InstructorWorkspace({ scenarioAction, settingsAction, runtime, dialogs }: InstructorWorkspaceProps) {
  return <>
    {scenarioAction}
    {settingsAction && <span className="loppjusim-hidden-settings-controller">{settingsAction}</span>}
    {runtime}
    {dialogs}
  </>
}
