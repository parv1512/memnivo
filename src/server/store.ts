import { all, one, run, transaction, OWNER, uuid, now, hash, activity, preferences } from './db';
import { normalizeTags, normalizeUrl } from '../lib/core';
import { itemInput, itemPatch, taskInput, projectInput, reminderInput } from '../lib/validation';
import type { Item, Task, Project, Reminder, Relationship, Notification, Conversation, Message, Citation } from '../lib/types';
import type { z } from 'zod';
export class AppError extends Error {
    constructor(public status: number, message: string, public code = 'INVALID_REQUEST', public detail?: unknown) { super(message); }
}
type ItemRow = {
    id: string;
    type: Item['type'];
    title: string;
    canonical_url: string | null;
    source: string;
    content: string;
    summary: string;
    personal_note: string;
    reason: string;
    status: Item['status'];
    sensitivity: Item['sensitivity'];
    favorite: number;
    project_id: string | null;
    metadata: string;
    created_at: string;
    updated_at: string;
    content_hash: string;
    archived_at: string | null;
    tags: string | null;
};
const itemSelect = `SELECT i.*, (SELECT json_group_array(t.name) FROM item_tags it JOIN tags t ON t.id=it.tag_id WHERE it.item_id=i.id) tags FROM items i`;
function mapItem(r: ItemRow): Item { return { id: r.id, type: r.type, title: r.title, url: r.canonical_url, source: r.source, content: r.content, summary: r.summary, note: r.personal_note, reason: r.reason, status: r.status, sensitivity: r.sensitivity, favorite: !!r.favorite, projectId: r.project_id, metadata: JSON.parse(r.metadata), createdAt: r.created_at, updatedAt: r.updated_at, contentHash: r.content_hash, archivedAt: r.archived_at, tags: JSON.parse(r.tags || '[]') }; }
export function listItems(limit = 1000): Item[] { return all<ItemRow>(`${itemSelect} WHERE i.user_id=? ORDER BY i.created_at DESC LIMIT ?`, OWNER, Math.min(limit, 1000)).map(mapItem); }
export function getItem(id: string): Item {
    const r = one<ItemRow>(`${itemSelect} WHERE i.user_id=? AND i.id=?`, OWNER, id);
    if (!r)
        throw new AppError(404, 'This item no longer exists.', 'NOT_FOUND');
    return mapItem(r);
}
function ensureRef(table: 'projects' | 'items' | 'tasks', id: string | null | undefined) {
    if (id && !one(`SELECT id FROM ${table} WHERE id=? AND user_id=?`, id, OWNER))
        throw new AppError(400, 'The linked record does not exist.');
}
function setTags(itemId: string, input: string[]) {
    run('DELETE FROM item_tags WHERE item_id=?', itemId);
    for (const name of normalizeTags(input)) {
        run('INSERT OR IGNORE INTO tags(id,user_id,name) VALUES(?,?,?)', uuid(), OWNER, name);
        const t = one<{
            id: string;
        }>('SELECT id FROM tags WHERE user_id=? AND name=?', OWNER, name)!;
        run('INSERT INTO item_tags VALUES(?,?)', itemId, t.id);
    }
}
export function indexChunks(id: string, content: string) {
    const chunks = content.match(/[\s\S]{1,1800}/g) || [''];
    const old = all<{
        chunk_index: number;
        content_hash: string;
    }>('SELECT chunk_index,content_hash FROM embedding_chunks WHERE item_id=?', id);
    for (let i = 0; i < chunks.length; i++) {
        const digest = hash(chunks[i]);
        if (old.find(c => c.chunk_index === i)?.content_hash === digest)
            continue;
        run('INSERT INTO embedding_chunks(id,item_id,chunk_index,text,embedding,model,content_hash) VALUES(?,?,?,?,NULL,NULL,?) ON CONFLICT(item_id,chunk_index) DO UPDATE SET text=excluded.text,embedding=NULL,model=NULL,content_hash=excluded.content_hash', uuid(), id, i, chunks[i], digest);
    }
    run('DELETE FROM embedding_chunks WHERE item_id=? AND chunk_index>=?', id, chunks.length);
}
export function queueJob(itemId: string, kind = 'enrich') {
    if (one('SELECT id FROM jobs WHERE item_id=? AND kind=? AND status IN (\'pending\',\'running\')', itemId, kind))
        return;
    run('INSERT INTO jobs(id,item_id,kind,status,run_at,created_at) VALUES(?,?,?,\'pending\',?,?)', uuid(), itemId, kind, now(), now());
}
export function createItem(input: unknown, { enrich = true }: {
    enrich?: boolean;
} = {}): Item {
    const v = itemInput.parse(input);
    ensureRef('projects', v.projectId);
    const url = v.url ? normalizeUrl(v.url) : null;
    if (v.url && !url)
        throw new AppError(400, 'Use a valid public HTTP or HTTPS URL.');
    const digest = hash(`${v.title}\n${v.content}`);
    const duplicate = url ? one<{
        id: string;
    }>('SELECT id FROM items WHERE user_id=? AND canonical_url=?', OWNER, url) : one<{
        id: string;
    }>('SELECT id FROM items WHERE user_id=? AND content_hash=?', OWNER, digest);
    if (duplicate)
        throw new AppError(409, 'This is already in your library. Open the existing item.', 'DUPLICATE', { itemId: duplicate.id });
    const id = uuid(), time = now();
    transaction(() => {
        run('INSERT INTO items(id,user_id,type,title,canonical_url,source,content,summary,personal_note,reason,status,sensitivity,favorite,project_id,content_hash,created_at,updated_at,archived_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, OWNER, v.type, v.title, url, v.source, v.content, v.summary, v.note, v.reason, v.status, v.sensitivity, Number(v.favorite), v.projectId ?? null, digest, time, time, v.status === 'archived' ? time : null);
        setTags(id, v.tags);
        indexChunks(id, `${v.title}\n${v.content}\n${v.summary}\n${v.reason}\n${v.note}\n${v.tags.join(' ')}`);
        activity(id, 'Captured item');
        if (enrich && v.sensitivity !== 'private' && (url || preferences().aiConsent))
            queueJob(id);
    });
    return getItem(id);
}
export function updateItem(id: string, input: unknown, { sync = false }: {
    sync?: boolean;
} = {}): Item {
    const prior = getItem(id);
    const patch = itemPatch.parse(input);
    const v = itemInput.parse({ ...prior, ...patch });
    ensureRef('projects', v.projectId);
    const url = v.url ? normalizeUrl(v.url) : null;
    if (v.url && !url)
        throw new AppError(400, 'Use a valid HTTP or HTTPS URL.');
    if (url && one('SELECT id FROM items WHERE canonical_url=? AND user_id=? AND id<>?', url, OWNER, id))
        throw new AppError(409, 'Another item already uses this link.', 'DUPLICATE');
    transaction(() => {
        run('UPDATE items SET type=?,title=?,canonical_url=?,source=?,content=?,summary=?,personal_note=?,reason=?,status=?,sensitivity=?,favorite=?,project_id=?,content_hash=?,updated_at=?,archived_at=? WHERE id=? AND user_id=?', v.type, v.title, url, v.source, v.content, v.summary, v.note, v.reason, v.status, v.sensitivity, Number(v.favorite), v.projectId ?? null, hash(`${v.title}\n${v.content}`), now(), v.status === 'archived' ? (prior.archivedAt || now()) : null, id, OWNER);
        setTags(id, v.tags);
        indexChunks(id, `${v.title}\n${v.content}\n${v.summary}\n${v.reason}\n${v.note}\n${v.tags.join(' ')}`);
        activity(id, sync ? 'Updated from vault' : 'Edited item');
        if (v.sensitivity === 'private') {
            run('UPDATE embedding_chunks SET embedding=NULL,model=NULL WHERE item_id=?', id);
            run('DELETE FROM jobs WHERE item_id=?', id);
        }
        else if (!sync && preferences().aiConsent && v.content !== prior.content)
            queueJob(id, 'embed');
        if (v.status === 'completed') {
            run('UPDATE reminders SET status=\'completed\',updated_at=? WHERE item_id=? AND status IN (\'upcoming\',\'snoozed\')', now(), id);
            run('UPDATE tasks SET status=\'completed\',completed_at=?,updated_at=? WHERE item_id=? AND status<>\'completed\'', now(), now(), id);
        }
    });
    return getItem(id);
}
export function deleteItem(id: string) { getItem(id); transaction(() => { run('DELETE FROM reminders WHERE item_id=?', id); run('DELETE FROM items WHERE id=? AND user_id=?', id, OWNER); run('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM item_tags)'); }); }
export function metadata(id: string, value: Record<string, unknown>) { getItem(id); run('UPDATE items SET metadata=? WHERE id=? AND user_id=?', JSON.stringify(value), id, OWNER); }
const projectSelect = `SELECT p.*, (SELECT count(*) FROM items i WHERE i.project_id=p.id) itemCount,(SELECT count(*) FROM tasks t WHERE t.project_id=p.id) taskCount,(SELECT count(*) FROM tasks t WHERE t.project_id=p.id AND t.status='completed') completedCount FROM projects p`;
export function projects(): Project[] {
    return all<Project & {
        created_at: string;
        updated_at: string;
    }>(`${projectSelect} WHERE p.user_id=? ORDER BY p.created_at DESC`, OWNER).map(r => ({ ...r, createdAt: r.created_at, updatedAt: r.updated_at }));
}
export function saveProject(input: unknown, id?: string) {
    const v = projectInput.parse(input);
    if (id)
        ensureRef('projects', id);
    const key = id || uuid();
    if (id)
        run('UPDATE projects SET name=?,description=?,goal=?,status=?,updated_at=? WHERE id=? AND user_id=?', v.name, v.description, v.goal, v.status, now(), key, OWNER);
    else
        run('INSERT INTO projects VALUES(?,?,?,?,?,?,?,?)', key, OWNER, v.name, v.description, v.goal, v.status, now(), now());
    return projects().find(p => p.id === key);
}
export function deleteProject(id: string) { ensureRef('projects', id); run('DELETE FROM projects WHERE id=? AND user_id=?', id, OWNER); }
export function tasks(): Task[] { return all<Task>('SELECT id,title,description,status,priority,due_at dueAt,project_id projectId,item_id itemId,completed_at completedAt,created_at createdAt,updated_at updatedAt FROM tasks WHERE user_id=? ORDER BY due_at IS NULL,due_at,created_at DESC', OWNER); }
export function saveTask(input: unknown, id?: string) {
    const prior = id ? tasks().find(t => t.id === id) : undefined;
    if (id && !prior)
        throw new AppError(404, 'Task not found.');
    const v = taskInput.parse({ ...prior, ...(input as object) });
    ensureRef('projects', v.projectId);
    ensureRef('items', v.itemId);
    const key = id || uuid(), time = now();
    transaction(() => {
        if (id)
            run('UPDATE tasks SET title=?,description=?,status=?,priority=?,due_at=?,project_id=?,item_id=?,completed_at=?,updated_at=? WHERE id=? AND user_id=?', v.title, v.description, v.status, v.priority, v.dueAt ?? null, v.projectId ?? null, v.itemId ?? null, v.status === 'completed' ? (prior?.completedAt || time) : null, time, key, OWNER);
        else
            run('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', key, OWNER, v.title, v.description, v.status, v.priority, v.dueAt ?? null, v.projectId ?? null, v.itemId ?? null, v.status === 'completed' ? time : null, time, time);
        if (v.status === 'completed')
            run('UPDATE reminders SET status=\'completed\',updated_at=? WHERE task_id=? AND user_id=?', time, key, OWNER);
    });
    return tasks().find(t => t.id === key);
}
export function deleteTask(id: string) { ensureRef('tasks', id); run('DELETE FROM tasks WHERE id=? AND user_id=?', id, OWNER); }
export function reminders(): Reminder[] { return all<Reminder>('SELECT id,title,note,item_id itemId,task_id taskId,due_at dueAt,timezone,status,snoozed_until snoozedUntil,recurrence,last_notified_at lastNotifiedAt,created_at createdAt,updated_at updatedAt FROM reminders WHERE user_id=? ORDER BY COALESCE(snoozed_until,due_at)', OWNER); }
export function createReminder(input: unknown) { const v = reminderInput.parse(input); ensureRef('items', v.itemId); ensureRef('tasks', v.taskId); const id = uuid(); run('INSERT INTO reminders(id,user_id,title,note,item_id,task_id,due_at,timezone,recurrence,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', id, OWNER, v.title, v.note, v.itemId ?? null, v.taskId ?? null, v.dueAt, v.timezone, v.recurrence, now(), now()); return reminders().find(r => r.id === id)!; }
export function transitionReminder(id: string, action: 'snooze' | 'complete' | 'dismiss' | 'reschedule', until?: string) {
    const r = reminders().find(x => x.id === id);
    if (!r)
        throw new AppError(404, 'Reminder not found.');
    if ((action === 'snooze' || action === 'reschedule') && (!until || !Number.isFinite(Date.parse(until)) || Date.parse(until) <= Date.now()))
        throw new AppError(400, 'Choose a future reminder time.');
    if (action === 'snooze')
        run('UPDATE reminders SET status=\'snoozed\',snoozed_until=?,last_notified_at=NULL,updated_at=? WHERE id=?', new Date(until!).toISOString(), now(), id);
    else if (action === 'reschedule')
        run('UPDATE reminders SET status=\'upcoming\',due_at=?,snoozed_until=NULL,last_notified_at=NULL,updated_at=? WHERE id=?', new Date(until!).toISOString(), now(), id);
    else {
        transaction(() => {
            run('UPDATE reminders SET status=?,updated_at=? WHERE id=?', action === 'complete' ? 'completed' : 'dismissed', now(), id);
            if (action === 'complete') {
                if (r.itemId)
                    updateItem(r.itemId, { status: 'completed' });
                if (r.taskId)
                    saveTask({ status: 'completed' }, r.taskId);
            }
        });
    }
    return reminders().find(x => x.id === id);
}
export function notifications(): Notification[] { return all<Notification>('SELECT id,reminder_id reminderId,title,body,created_at createdAt,read_at readAt FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100', OWNER); }
export function relations(): Relationship[] { return all<Relationship>('SELECT id,source_id sourceId,target_id targetId,type,origin,confidence,created_at createdAt FROM relationships WHERE user_id=?', OWNER); }
export function addRelation(sourceId: string, targetId: string, type: string, origin: 'user' | 'ai' = 'user', confidence = 1) {
    ensureRef('items', sourceId);
    ensureRef('items', targetId);
    const existing = one<{
        id: string;
    }>('SELECT id FROM relationships WHERE source_id=? AND target_id=? AND type=?', sourceId, targetId, type);
    if (existing)
        return existing;
    const id = uuid();
    run('INSERT INTO relationships VALUES(?,?,?,?,?,?,?,?)', id, OWNER, sourceId, targetId, type, origin, confidence, now());
    return { id };
}
export function conversations(): Conversation[] { return all<Conversation>('SELECT id,title,created_at createdAt,updated_at updatedAt FROM conversations WHERE user_id=? ORDER BY updated_at DESC', OWNER); }
export function conversationMessages(id: string): Message[] {
    if (!one('SELECT id FROM conversations WHERE id=? AND user_id=?', id, OWNER))
        throw new AppError(404, 'Conversation not found.');
    return all<Message>('SELECT id,conversation_id conversationId,role,content,mode,feedback,created_at createdAt FROM messages WHERE conversation_id=? ORDER BY created_at,rowid', id).map(m => ({ ...m, citations: all<{
            item_id: string;
            title: string;
            excerpt: string;
            relevance: number;
            created_at: string;
            canonical_url: string | null;
            methods: string;
        }>('SELECT c.*,i.title,i.created_at,i.canonical_url FROM citations c JOIN items i ON i.id=c.item_id WHERE c.message_id=? AND i.user_id=?', m.id, OWNER).map(c => ({ itemId: c.item_id, title: c.title, excerpt: c.excerpt, score: c.relevance, createdAt: c.created_at, url: c.canonical_url, methods: JSON.parse(c.methods) })) }));
}
export function writeMessage(conversationId: string, role: 'user' | 'assistant', content: string, citations: Citation[] = [], mode = 'retrieval') {
    const id = uuid();
    run('INSERT INTO messages(id,conversation_id,role,content,mode,created_at) VALUES(?,?,?,?,?,?)', id, conversationId, role, content, mode, now());
    for (const c of citations)
        run('INSERT INTO citations VALUES(?,?,?,?,?,?)', uuid(), id, c.itemId, c.excerpt, c.score, JSON.stringify(c.methods));
    run('UPDATE conversations SET updated_at=? WHERE id=? AND user_id=?', now(), conversationId, OWNER);
    return id;
}
export function createConversation(title: string) { const id = uuid(); run('INSERT INTO conversations VALUES(?,?,?,?,?)', id, OWNER, title.slice(0, 100), now(), now()); return id; }
export function exportData() { return { format: 'memnivo-export', version: 1, exportedAt: now(), preferences: preferences(), items: all<ItemRow>(`${itemSelect} WHERE i.user_id=? ORDER BY i.created_at DESC`, OWNER).map(mapItem), projects: projects(), tasks: tasks(), reminders: reminders(), relationships: relations(), conversations: conversations().map(c => ({ ...c, messages: conversationMessages(c.id) })), notifications: notifications() }; }
export function eraseData() { transaction(() => { run('DELETE FROM users WHERE id=?', OWNER); run('DELETE FROM items_fts'); run('DELETE FROM runtime_state'); run('INSERT INTO users VALUES(?,?,?,?,?)', OWNER, 'You', JSON.stringify({ ...preferences(), onboarded: false }), now(), now()); }); }
export type NewItem = z.infer<typeof itemInput>;
