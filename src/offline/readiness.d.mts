export function verifyOfflinePage(options: { controller: ServiceWorker | null; complete: boolean; version: string; url: string }): Promise<'ready' | 'reload' | 'incomplete' | 'unverified'>;
