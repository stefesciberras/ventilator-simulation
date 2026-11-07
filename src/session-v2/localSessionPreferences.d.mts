export function readLocalSelection(): { mode: 'local' | 'peer'; sessionId: string } | null;
export function saveLocalSelection(mode: string, sessionId: string): void;
