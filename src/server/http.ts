import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { api } from './api';
import { AppError } from './store';
import { ZodError } from 'zod';
import { database } from './db';
import { isLoopback } from './security';
const publicDir = 'dist/public';
const assets = new Map<string, {
    data: Buffer;
    type: string;
    zip: Buffer;
}>();
for (const [name, type] of [['app.js', 'text/javascript; charset=utf-8'], ['app.css', 'text/css; charset=utf-8'], ['index.html', 'text/html; charset=utf-8']]) {
    if (existsSync(`${publicDir}/${name}`)) {
        const data = readFileSync(`${publicDir}/${name}`);
        assets.set(name, { data, type, zip: gzipSync(data) });
    }
}
database();
const port = Number(process.env.PORT) || 3000;
const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    try {
        const host = req.headers.host || '';
        let hostname = '';
        try {
            hostname = new URL(`http://${host}`).hostname;
        }
        catch {
            throw new AppError(403, 'Local access only.');
        }
        if (!isLoopback(hostname))
            throw new AppError(403, 'Memnivo is a local-only application.');
        const url = new URL(req.url || '/', `http://${host}`);
        if (url.pathname.startsWith('/api/')) {
            let body: unknown;
            let bytes = 0;
            const chunks: Buffer[] = [];
            for await (const part of req) {
                bytes += part.length;
                if (bytes > 1100000)
                    throw new AppError(413, 'Request too large. Text imports are limited to 1 MB.');
                chunks.push(part);
            }
            if (chunks.length) {
                try {
                    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                }
                catch {
                    throw new AppError(400, 'Invalid JSON request.');
                }
            }
            const headers = new Headers();
            for (const [key, value] of Object.entries(req.headers))
                if (value)
                    headers.set(key, Array.isArray(value) ? value.join(',') : value);
            const request = new Request(url, { method: req.method, headers });
            const result = await api(request, body);
            res.writeHead(result.status || 200, { 'content-type': 'application/json; charset=utf-8', ...result.headers });
            res.end(JSON.stringify(result.body ?? {}));
            return;
        }
        if (!['GET', 'HEAD'].includes(req.method || ''))
            throw new AppError(405, 'Method not allowed.');
        const file = url.pathname === '/app.js' ? 'app.js' : url.pathname === '/app.css' ? 'app.css' : 'index.html';
        const asset = assets.get(file);
        if (!asset)
            throw new AppError(503, 'Build the app with npm run build first.');
        const zipped = (req.headers['accept-encoding'] || '').includes('gzip');
        res.writeHead(200, { 'content-type': asset.type, ...(zipped ? { 'content-encoding': 'gzip', 'vary': 'Accept-Encoding' } : {}) });
        res.end(req.method === 'HEAD' ? undefined : zipped ? asset.zip : asset.data);
    }
    catch (error) {
        const validation = error instanceof ZodError;
        const status = validation ? 400 : error instanceof AppError ? error.status : 500;
        const message = validation ? error.issues.map(i => `${i.path.join('.') || 'Input'}: ${i.message}`).join('; ') : error instanceof AppError ? error.message : 'Something went wrong. Retry, or check the local service terminal.';
        if (status === 500)
            console.error('Request failed:', error instanceof Error ? error.message : 'Internal error');
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { code: error instanceof AppError ? error.code : validation ? 'VALIDATION' : 'INTERNAL', message, ...(error instanceof AppError && error.detail ? { detail: error.detail } : {}) } }));
    }
});
server.requestTimeout = 75000;
server.headersTimeout = 15000;
server.listen(port, '127.0.0.1', () => console.log(`Memnivo is ready at http://127.0.0.1:${port}`));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
