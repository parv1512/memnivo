import { randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { database, dataDirectory } from './db';
import { AppError } from './store';
export const COOKIE = 'memnivo_session';
export function isLoopback(host: string): boolean { return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host.toLowerCase()); }
export function assertOrigin(request: Request, mutation = true) {
    const url = new URL(request.url);
    const host = request.headers.get('host') || url.host;
    let parsed: URL;
    try {
        parsed = new URL(`http://${host}`);
    }
    catch {
        throw new AppError(403, 'Local access only.', 'FORBIDDEN');
    }
    if (!isLoopback(parsed.hostname))
        throw new AppError(403, 'Memnivo is a local-only service.', 'FORBIDDEN');
    const origin = request.headers.get('origin');
    if (mutation && origin !== url.origin)
        throw new AppError(403, 'Open Memnivo directly to make changes.', 'FORBIDDEN');
    const site = request.headers.get('sec-fetch-site');
    if (site === 'cross-site')
        throw new AppError(403, 'Cross-site requests are blocked.', 'FORBIDDEN');
}
function secret(): Buffer {
    database();
    const target = path.join(dataDirectory(), 'session.key');
    if (!existsSync(target))
        try {
            writeFileSync(target, randomBytes(48), { mode: 0o600, flag: 'wx' });
        }
        catch (error) {
            if (!existsSync(target))
                throw error;
        }
    return readFileSync(target);
}
export function issueSession(): string { const payload = `${Date.now()}.${randomBytes(18).toString('hex')}`; return `${payload}.${createHmac('sha256', secret()).update(payload).digest('hex')}`; }
export function validSession(token: string | undefined): boolean {
    if (!token)
        return false;
    const parts = token.split('.');
    if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || Date.now() - Number(parts[0]) > 7 * 86400000 || Number(parts[0]) > Date.now() + 60000)
        return false;
    const expected = createHmac('sha256', secret()).update(`${parts[0]}.${parts[1]}`).digest('hex');
    const a = Buffer.from(parts[2]), b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}
export function authorize(request: Request) {
    assertOrigin(request, !['GET', 'HEAD'].includes(request.method));
    const cookie = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    if (!validSession(cookie))
        throw new AppError(401, 'Your local session expired. Refresh to reconnect.', 'SESSION_EXPIRED');
}
const buckets = new Map<string, {
    count: number;
    expires: number;
}>();
export function rateLimit(key: string, limit = 30, windowMs = 60000) {
    const time = Date.now();
    for (const [k, b] of buckets)
        if (b.expires < time)
            buckets.delete(k);
    const b = buckets.get(key) || { count: 0, expires: time + windowMs };
    if (b.count >= limit)
        throw new AppError(429, 'Too many requests. Please wait a moment.', 'RATE_LIMIT');
    b.count++;
    buckets.set(key, b);
}
export function publicAddress(address: string): boolean {
    const ip = address.toLowerCase();
    if (ip.includes(':')) {
        if (ip.startsWith('::ffff:'))
            return publicAddress(ip.slice(7));
        return isIP(ip) === 6 && !(/^(::|fc|fd|fe[89ab]|ff|2001:db8|2001:0:|2002:|64:ff9b:)/i.test(ip));
    }
    if (isIP(ip) !== 4)
        return false;
    const [a, b] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 2) || (a === 198 && b === 51) || (a === 203 && b === 0));
}
export async function safeFetch(input: string, { maxBytes = 1000000, accept = 'text/html,application/json,text/plain' }: {
    maxBytes?: number;
    accept?: string;
} = {}): Promise<{
    text: string;
    type: string;
    url: string;
}> {
    let target = new URL(input);
    for (let redirects = 0; redirects < 4; redirects++) {
        if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || (target.port && !['80', '443'].includes(target.port)))
            throw new AppError(400, 'This URL cannot be fetched safely.');
        const host = target.hostname.replace(/^\[|\]$/g, '');
        const addresses = await lookup(host, { all: true });
        if (!addresses.length || addresses.some(a => !publicAddress(a.address)))
            throw new AppError(400, 'Private and internal network URLs cannot be fetched.');
        const selected = addresses[0];
        const result = await new Promise<{
            text: string;
            type: string;
            location?: string;
        }>((resolve, reject) => {
            const request = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, { headers: { accept, 'user-agent': 'Memnivo/0.1 (personal knowledge metadata)' }, lookup: (_host, options, callback) => {
                    if (options.all)
                        callback(null, [selected]);
                    else
                        callback(null, selected.address, selected.family);
                }, signal: AbortSignal.timeout(12000) }, response => {
                if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
                    const location = response.headers.location;
                    response.resume();
                    if (!location) {
                        reject(new AppError(400, 'The source redirected without a destination.'));
                        return;
                    }
                    resolve({ text: '', type: '', location });
                    return;
                }
                if (!response.statusCode || response.statusCode >= 400) {
                    response.resume();
                    reject(new AppError(422, `The source returned HTTP ${response.statusCode}. Save it manually.`));
                    return;
                }
                const type = response.headers['content-type'] || '';
                if (!/text\/|json|xml/i.test(type)) {
                    response.destroy();
                    reject(new AppError(400, 'This source is not supported for text extraction.'));
                    return;
                }
                let size = 0;
                const parts: Buffer[] = [];
                response.on('data', (part: Buffer) => {
                    size += part.length;
                    if (size > maxBytes) {
                        response.destroy();
                        reject(new AppError(413, 'Source content is too large.'));
                    }
                    else
                        parts.push(part);
                });
                response.on('error', reject);
                response.on('end', () => resolve({ text: Buffer.concat(parts).toString('utf8'), type }));
            });
            request.on('error', reject);
            request.end();
        });
        if (result.location) {
            target = new URL(result.location, target);
            continue;
        }
        return { text: result.text, type: result.type, url: target.toString() };
    }
    throw new AppError(400, 'Too many redirects. Save this link manually.');
}
