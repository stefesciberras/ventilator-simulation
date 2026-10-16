export type TeachingRole = 'standalone' | 'instructor' | 'candidate'
export type TeachingPromptKind = 'message' | 'mcq' | 'poll'

export interface TeachingPromptOption {
  id: string
  text: string
}

export interface TeachingPromptRow {
  id: string
  session_id: string
  instructor_id: string
  kind: TeachingPromptKind
  title: string | null
  body: string
  options: TeachingPromptOption[]
  status: 'active' | 'closed'
  created_at: string
  closed_at: string | null
}

export interface TeachingPromptResponseRow {
  id: string
  prompt_id: string
  session_id: string
  user_id: string
  option_id: string
  created_at: string
}

export interface TeachingPromptDraft {
  kind: TeachingPromptKind
  title?: string
  body: string
  options?: TeachingPromptOption[]
}

export interface TeachingLibraryItem {
  id: string
  owner_id: string
  source_app: string
  module: string
  kind: TeachingPromptKind
  title: string | null
  body: string
  options: TeachingPromptOption[]
  correct_option_id: string | null
  explanation: string | null
  tags: string[]
  created_at: string
  updated_at: string
}

export interface TeachingLibraryDraft extends TeachingPromptDraft {
  module: string
  tags?: string[]
  correctOptionId?: string | null
  explanation?: string | null
}

export interface TeachingHostAdapter<TContext = Record<string, unknown>> {
  appId: string
  appName: string
  defaultModule: string
  getContext?: () => TContext
  onPromptPresented?: (prompt: TeachingPromptDraft) => void
  onPromptClosed?: () => void
}
