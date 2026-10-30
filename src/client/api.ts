import type { Snapshot } from '../lib/types';
export class ClientError extends Error {
    constructor(message: string, public status: number, public detail?: {
        itemId?: string;
    }) { super(message); }
}
let sessionPromise: Promise<void> | null = null;
export async function connect() {
    if (!sessionPromise)
        sessionPromise = fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' } }).then(async (r) => {
            if (!r.ok)
                throw new Error('The local service could not establish a session.');
        }).catch(e => { sessionPromise = null; throw e; });
    await sessionPromise;
}
export async function api<T = unknown>(path: string, method = 'GET', body?: unknown, retry = true): Promise<T> {
    await connect();
    const response = await fetch(`/api/${path}`, { method, headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    let value;
    try {
        value = await response.json();
    }
    catch {
        throw new Error('The local service returned an invalid response.');
    }
    if (response.status === 401 && retry) {
        sessionPromise = null;
        return api(path, method, body, false);
    }
    if (!response.ok)
        throw new ClientError(value.error?.message || 'The request could not be completed.', response.status, value.error?.detail);
    return value;
}
export const getSnapshot = () => api<Snapshot>('snapshot');
export function humanDate(iso: string | Date | null, options?: Intl.DateTimeFormatOptions) {
    if (!iso)
        return 'No date';
    return new Intl.DateTimeFormat(undefined, options || { month: 'short', day: 'numeric' }).format(new Date(iso));
}
export function localInput(iso?: string | null) { const d = iso ? new Date(iso) : new Date(Date.now() + 86400000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
export function isoInput(value: string) { return new Date(value).toISOString(); }
export function errorMessage(e: unknown) { return e instanceof Error ? e.message : 'Something went wrong. Please retry.'; }
