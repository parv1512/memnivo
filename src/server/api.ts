import { z } from 'zod';
import { authorize, assertOrigin, rateLimit, issueSession, COOKIE } from './security';
import { all, one, run, OWNER, now, uuid, preferences, setPreferences, database } from './db';
import * as store from './store';
import { preferencesInput, chatInput, relationInput } from '../lib/validation';
import { providerStatus, aiProvider } from './ai';
import { search, ask } from './retrieval';
import { vaultStatus, vaultLogs, syncVault, resolveVaultConflict, disconnectVault, normalizeRule } from './vault';
import type { Snapshot } from '../lib/types';
export interface ApiResult {
    status?: number;
    body?: unknown;
    headers?: Record<string, string>;
}
export function snapshot(): Snapshot {
    const seen = one<{
        value: string;
    }>('SELECT value FROM runtime_state WHERE key=\'worker_heartbeat\'')?.value || null;
    return { items: store.listItems(), projects: store.projects(), tasks: store.tasks(), reminders: store.reminders(), notifications: store.notifications(), preferences: preferences(), vault: vaultStatus(), vaultLogs: vaultLogs(), relationships: store.relations(), provider: providerStatus(), conversations: store.conversations(), savedSearches: all('SELECT id,name,query FROM saved_searches WHERE user_id=?', OWNER), worker: { lastSeen: seen, running: !!seen && Date.now() - Date.parse(seen) < 90000 } };
}
export async function api(request: Request, body: unknown): Promise<ApiResult> {
    const url = new URL(request.url), parts = url.pathname.split('/').filter(Boolean).slice(1), method = request.method;
    if (parts[0] === 'health' && method === 'GET')
        return { body: { ok: true, version: '0.1.0' } };
    if (parts[0] === 'session' && method === 'POST') {
        assertOrigin(request);
        rateLimit('session', 60);
        return { body: { connected: true }, headers: { 'Set-Cookie': `${COOKIE}=${issueSession()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800` } };
    }
    authorize(request);
    if (method !== 'GET')
        rateLimit('mutation', 180);
    if (parts[0] === 'snapshot' && method === 'GET')
        return { body: snapshot() };
    const id = parts[1];
    if (id && parts[0] !== 'chat')
        z.string().uuid().parse(id);
    if (parts[0] === 'items') {
        if (method === 'GET' && !id) {
            const query = url.searchParams.get('q') || '';
            const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 30));
            const offset = Math.min(1000, Math.max(0, Number(url.searchParams.get('offset')) || 0));
            const matches = await search(query, { type: url.searchParams.get('type') || undefined, status: url.searchParams.get('status') || undefined, tag: url.searchParams.get('tag') || undefined, projectId: url.searchParams.get('project') || undefined, from: url.searchParams.get('from') || undefined, to: url.searchParams.get('to') || undefined, includeArchived: url.searchParams.get('archived') === 'true', limit: 1000 });
            return { body: { results: matches.slice(offset, offset + limit), total: matches.length, limit, offset } };
        }
        if (method === 'POST' && !id)
            return { status: 201, body: store.createItem(body) };
        if (method === 'GET' && id)
            return { body: { item: store.getItem(id), activity: all('SELECT id,item_id itemId,action,created_at createdAt FROM activities WHERE item_id=? AND user_id=? ORDER BY created_at DESC LIMIT 50', id, OWNER), vaultReference: one('SELECT relative_path path,obsidian_uri uri,status FROM vault_notes WHERE item_id=?', id) || null, jobs: all('SELECT id,kind,status,error FROM jobs WHERE item_id=? ORDER BY created_at DESC LIMIT 5', id) } };
        if (method === 'PATCH' && id)
            return { body: store.updateItem(id, body) };
        if (method === 'DELETE' && id) {
            store.deleteItem(id);
            return { body: { deleted: true } };
        }
    }
    if (parts[0] === 'projects') {
        if (method === 'POST')
            return { status: 201, body: store.saveProject(body) };
        if (method === 'PATCH' && id)
            return { body: store.saveProject(body, id) };
        if (method === 'DELETE' && id) {
            store.deleteProject(id);
            return { body: { deleted: true } };
        }
    }
    if (parts[0] === 'tasks') {
        if (method === 'POST')
            return { status: 201, body: store.saveTask(body) };
        if (method === 'PATCH' && id)
            return { body: store.saveTask(body, id) };
        if (method === 'DELETE' && id) {
            store.deleteTask(id);
            return { body: { deleted: true } };
        }
    }
    if (parts[0] === 'reminders') {
        if (method === 'POST')
            return { status: 201, body: store.createReminder(body) };
        if (method === 'PATCH' && id) {
            const v = z.object({ action: z.enum(['snooze', 'complete', 'dismiss', 'reschedule']), until: z.string().datetime({ offset: true }).optional() }).parse(body);
            return { body: store.transitionReminder(id, v.action, v.until) };
        }
        if (method === 'DELETE' && id) {
            run('DELETE FROM reminders WHERE id=? AND user_id=?', id, OWNER);
            return { body: { deleted: true } };
        }
    }
    if (parts[0] === 'notifications' && method === 'PATCH') {
        run('UPDATE notifications SET read_at=? WHERE user_id=?' + (id ? ' AND id=?' : ''), now(), OWNER, ...(id ? [id] : []));
        return { body: { read: true } };
    }
    if (parts[0] === 'chat' && method === 'POST') {
        rateLimit('chat', 12);
        const v = chatInput.parse(body);
        return { body: await ask(v.question, v.conversationId || null, v.scope, v.scopeId || null) };
    }
    if (parts[0] === 'conversations' && id) {
        if (method === 'GET')
            return { body: store.conversationMessages(id) };
        if (method === 'DELETE') {
            run('DELETE FROM conversations WHERE id=? AND user_id=?', id, OWNER);
            return { body: { deleted: true } };
        }
    }
    if (parts[0] === 'feedback' && id && method === 'PATCH') {
        const v = z.object({ value: z.number().int().min(-1).max(1) }).parse(body);
        run('UPDATE messages SET feedback=? WHERE id=? AND conversation_id IN (SELECT id FROM conversations WHERE user_id=?)', v.value, id, OWNER);
        return { body: { saved: true } };
    }
    if (parts[0] === 'relationships') {
        if (method === 'POST') {
            const v = relationInput.parse(body);
            return { status: 201, body: store.addRelation(v.sourceId, v.targetId, v.type) };
        }
        if (method === 'DELETE' && id) {
            run('DELETE FROM relationships WHERE id=? AND user_id=?', id, OWNER);
            return { body: { deleted: true } };
        }
    }
    if (parts[0] === 'preferences' && method === 'PUT')
        return { body: setPreferences(preferencesInput.parse(body)) };
    if (parts[0] === 'provider-test' && method === 'POST') {
        rateLimit('provider', 5);
        const provider = aiProvider();
        if (!provider)
            throw new store.AppError(400, 'Configure the server environment and enable AI consent first.');
        const response = await provider.complete([{ role: 'user', content: 'Reply with only: Connection successful. No personal data is included in this test.' }]);
        return { body: { message: response.slice(0, 200) } };
    }
    if (parts[0] === 'enrich' && id && method === 'POST') {
        store.getItem(id);
        store.queueJob(id);
        return { body: { queued: true } };
    }
    if (parts[0] === 'suggestions' && id && method === 'POST') {
        const v = z.object({ action: z.enum(['apply', 'dismiss']) }).parse(body);
        const item = store.getItem(id);
        const suggestions = item.metadata.aiSuggestions;
        if (!suggestions)
            throw new store.AppError(404, 'There are no suggestions to review.');
        if (v.action === 'apply') {
            const parsed = z.object({ title: z.string().min(1).max(240), summary: z.string().max(10000), tags: z.array(z.string().max(60)).max(20) }).parse(suggestions);
            store.updateItem(id, { title: parsed.title, summary: parsed.summary, tags: [...new Set([...item.tags, ...parsed.tags])].slice(0, 20) });
        }
        const meta = { ...store.getItem(id).metadata };
        delete meta.aiSuggestions;
        store.metadata(id, { ...meta, aiSuggestionDecision: v.action, aiSuggestionReviewedAt: now() });
        return { body: store.getItem(id) };
    }
    if (parts[0] === 'reindex' && method === 'POST') {
        for (const item of store.listItems()) {
            store.indexChunks(item.id, `${item.title}\n${item.content}\n${item.summary}\n${item.reason}\n${item.note}\n${item.tags.join(' ')}`);
            if (item.sensitivity !== 'private')
                store.queueJob(item.id, 'embed');
        }
        return { body: { queued: true } };
    }
    if (parts[0] === 'vault') {
        if (method === 'POST' && !id)
            return { body: await syncVault() };
        if (method === 'DELETE') {
            disconnectVault();
            return { body: { disconnected: true } };
        }
        if (method === 'PATCH' && !id) {
            const v = z.object({ includes: z.array(z.string()).max(50), excludes: z.array(z.string()).max(50) }).parse(body);
            run('UPDATE vault_connections SET includes=?,excludes=? WHERE user_id=?', JSON.stringify(v.includes.map(normalizeRule).filter(Boolean)), JSON.stringify(v.excludes.map(normalizeRule).filter(Boolean)), OWNER);
            return { body: { saved: true } };
        }
        if (method === 'PATCH' && id) {
            const v = z.object({ choice: z.enum(['source', 'local']) }).parse(body);
            await resolveVaultConflict(id, v.choice);
            return { body: { resolved: true } };
        }
    }
    if (parts[0] === 'saved-searches') {
        if (method === 'POST') {
            const v = z.object({ name: z.string().trim().min(1).max(80), query: z.string().max(1000) }).parse(body);
            const key = uuid();
            run('INSERT INTO saved_searches VALUES(?,?,?,?)', key, OWNER, v.name, v.query);
            return { body: { id: key, ...v } };
        }
        if (method === 'DELETE' && id) {
            run('DELETE FROM saved_searches WHERE id=? AND user_id=?', id, OWNER);
            return { body: { deleted: true } };
        }
    }
    if (parts[0] === 'import' && method === 'POST') {
        const v = z.object({ filename: z.string().max(200).regex(/\.(md|txt|json)$/i), content: z.string().max(1000000) }).parse(body);
        if (v.content.includes('\0'))
            throw new store.AppError(400, 'Binary documents are not supported. Import UTF-8 Markdown or text.');
        if (v.filename.toLowerCase().endsWith('.json')) {
            const data = z.object({ format: z.literal('memnivo-export'), items: z.array(z.unknown()).max(1000) }).parse(JSON.parse(v.content));
            let imported = 0, skipped = 0;
            for (const entry of data.items) {
                try {
                    store.createItem({ ...entry as object, projectId: null }, { enrich: false });
                    imported++;
                }
                catch (error) {
                    if (error instanceof store.AppError && error.code === 'DUPLICATE')
                        skipped++;
                    else
                        throw error;
                }
            }
            return { body: { imported, skipped } };
        }
        return { status: 201, body: store.createItem({ title: v.filename.replace(/\.(md|txt)$/i, ''), type: 'document', content: v.content, source: 'Text import' }, { enrich: false }) };
    }
    if (parts[0] === 'export' && method === 'GET')
        return { body: store.exportData(), headers: { 'content-disposition': `attachment; filename="memnivo-export-${new Date().toISOString().slice(0, 10)}.json"` } };
    if (parts[0] === 'data' && method === 'DELETE') {
        z.object({ confirmation: z.literal('DELETE ALL MY DATA') }).parse(body);
        store.eraseData();
        database().exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
        return { body: { deleted: true } };
    }
    throw new store.AppError(404, 'This endpoint does not exist.', 'NOT_FOUND');
}
