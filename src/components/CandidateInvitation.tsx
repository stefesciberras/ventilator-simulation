import { SharedCandidateInvitation } from '../teaching/session/SharedCandidateInvitation'

interface CandidateInvitationProps {
  sessionId: string
  sessionKey: string
  joinUrl: string
}

/** EDUVENT compatibility wrapper around the shared EDUSIM invitation surface. */
export function CandidateInvitation(props: CandidateInvitationProps) {
  return <SharedCandidateInvitation
    {...props}
    productId="eduvent"
    productLabel="EDUVENT"
    productDescription="Interactive mechanical ventilation simulation"
  />
}
