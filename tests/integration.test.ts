import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { database, all, one, run, OWNER, preferences, setPreferences, uuid, now } from '../src/server/db';
import { createItem, getItem, listItems, updateItem, deleteItem, createReminder, transitionReminder, reminders, saveProject, saveTask, tasks, addRelation, eraseData, exportData, conversationMessages } from '../src/server/store';
import { search, ask } from '../src/server/retrieval';
import { processReminders } from '../src/server/reminders';
import { connectVault, syncVault, parseNote, allowedNote, resolveVaultConflict, vaultStatus } from '../src/server/vault';
import { api } from '../src/server/api';
import { issueSession } from '../src/server/security';
import { metadata } from '../src/server/store';
mkdirSync(path.resolve('.cache'), { recursive: true });
process.env.MEMNIVO_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'memnivo-integration-'));
process.env.AI_PROVIDER = 'none';
beforeEach(() => { eraseData(); setPreferences({ ...preferences(), quietStart: '00:00', quietEnd: '00:00', maxReminders: 5, timezone: 'UTC' }); });
test('capture persists in SQLite, edits, FTS indexes, archives and deletes', async () => { const item = createItem({ title: 'A local PDF chatbot', type: 'note', content: 'Use retrieval augmented generation and citations.', tags: ['RAG', 'rag'] }, { enrich: false }); assert.equal(getItem(item.id).tags.length, 1); assert.ok(all('SELECT id FROM items WHERE id=?', item.id).length); updateItem(item.id, { note: 'Start with SQLite', status: 'saved' }); assert.equal(getItem(item.id).note, 'Start with SQLite'); assert.equal((await search('PDF chatbot', { semantic: false }))[0].item.id, item.id); updateItem(item.id, { status: 'archived' }); assert.equal((await search('PDF chatbot', { semantic: false })).length, 0); deleteItem(item.id); assert.throws(() => getItem(item.id)); assert.equal(all('SELECT * FROM items_fts WHERE item_id=?', item.id).length, 0); assert.equal(all('SELECT * FROM embedding_chunks WHERE item_id=?', item.id).length, 0); });
test('canonical URL deduplication rejects tracked duplicates', () => { createItem({ title: 'Repo', type: 'repository', url: 'https://github.com/test/repo?utm_source=feed' }, { enrich: false }); assert.throws(() => createItem({ title: 'Same repo', type: 'repository', url: 'https://github.com/test/repo' }, { enrich: false }), /already in your library/); });
test('project links and task completion persist without orphaned references', () => { const project = saveProject({ name: 'Build a chatbot' })!; const item = createItem({ title: 'Chat architecture', type: 'note', projectId: project.id }, { enrich: false }); const task = saveTask({ title: 'Try retrieval', projectId: project.id, itemId: item.id })!; createReminder({ title: 'Try retrieval', taskId: task.id, dueAt: now(), timezone: 'UTC' }); saveTask({ status: 'completed' }, task.id); assert.equal(tasks()[0].status, 'completed'); assert.equal(reminders()[0].status, 'completed'); assert.ok(tasks()[0].completedAt); });
test('snooze, one-time notification, and item completion resolve reminders', () => { const item = createItem({ title: 'Watch vector tutorial', type: 'video', url: 'https://youtube.com/watch?v=test' }, { enrich: false }); const r = createReminder({ title: 'Watch it', itemId: item.id, dueAt: '2026-10-01T12:00:00.000Z', timezone: 'UTC' }); const clock = new Date('2026-10-02T12:00:00.000Z'); assert.equal(processReminders(clock), 1); assert.equal(processReminders(clock), 0); assert.equal(all('SELECT * FROM notifications').length, 1); transitionReminder(r.id, 'snooze', new Date(Date.now() + 3600000).toISOString()); assert.equal(reminders()[0].status, 'snoozed'); updateItem(item.id, { status: 'completed' }); assert.equal(reminders()[0].status, 'completed'); });
test('reminder budget, quiet hours and recurrence are durable', () => {
    setPreferences({ ...preferences(), maxReminders: 1 });
    for (let i = 0; i < 3; i++)
        createReminder({ title: `Follow-up ${i}`, dueAt: '2026-10-01T12:00:00.000Z', timezone: 'UTC', recurrence: i === 0 ? 'daily' : 'none' });
    assert.equal(processReminders(new Date('2026-10-02T12:00:00.000Z')), 1);
    assert.equal(processReminders(new Date('2026-10-02T13:00:00.000Z')), 0);
    assert.equal(reminders().find(r => r.recurrence === 'daily')?.dueAt, '2026-10-03T12:00:00.000Z');
    assert.equal(processReminders(new Date('2026-10-03T12:00:00.000Z')), 1);
    setPreferences({ ...preferences(), quietStart: '00:00', quietEnd: '13:00' });
    assert.equal(processReminders(new Date('2026-10-04T12:00:00.000Z')), 0);
});
test('natural language retrieval ranks specific source evidence and returns real citations', async () => { const repo = createItem({ title: 'PDF RAG repository', type: 'repository', url: 'https://github.com/example/pdf-rag', content: 'Build a local document chatbot using semantic retrieval.', reason: 'Use this for my PDF assistant', tags: ['python', 'rag'] }, { enrich: false }); createItem({ title: 'Cooking notes', type: 'note', content: 'Fresh tomatoes and basil.' }, { enrich: false }); const result = await ask('What was that GitHub project for my local PDF chatbot?', null, 'all', null); const assistant = result.messages.find(m => m.role === 'assistant')!; assert.ok(assistant.citations.some(c => c.itemId === repo.id)); assert.equal(assistant.mode, 'retrieval'); assert.equal(conversationMessages(result.conversationId).length, 2); assert.ok(assistant.content.includes(repo.title)); });
test('no matching records produces an honest response without fake citations', async () => { const result = await ask('quantum telescope', null, 'all', null); const assistant = result.messages.at(-1)!; assert.equal(assistant.citations.length, 0); assert.match(assistant.content, /could not find reliable/); });
test('controlled embeddings retrieve a semantic match when keywords differ', async () => {
    const item = createItem({ title: 'Quiet mornings', type: 'note', content: 'A daily ritual of calm and reflection.' }, { enrich: false });
    run('UPDATE embedding_chunks SET embedding=?,model=? WHERE item_id=?', JSON.stringify([1, 0, 0]), 'openai-compatible:test-embedding', item.id);
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_MODEL = 'test';
    process.env.AI_API_KEY = 'test-only';
    process.env.AI_EMBEDDING_MODEL = 'test-embedding';
    setPreferences({ ...preferences(), aiConsent: true });
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 0, 0] }] }), { headers: { 'content-type': 'application/json' } });
    try {
        const hits = await search('mindfulness', { semantic: true });
        assert.equal(hits[0].item.id, item.id);
        assert.ok(hits[0].methods.includes('Semantic similarity'));
    }
    finally {
        globalThis.fetch = original;
        process.env.AI_PROVIDER = 'none';
        delete process.env.AI_API_KEY;
        delete process.env.AI_EMBEDDING_MODEL;
    }
});
test('private content remains retrievable locally and has no embeddings or enrichment jobs', () => { const item = createItem({ title: 'Private preference', type: 'context', content: 'Use paper notebooks.', sensitivity: 'private' }); assert.equal(all('SELECT * FROM jobs WHERE item_id=?', item.id).length, 0); assert.equal(all('SELECT * FROM embedding_chunks WHERE item_id=? AND embedding IS NOT NULL', item.id).length, 0); });
test('generated answers use real sources without sharing previous private conversation excerpts', async () => {
    createItem({ title: 'Private telescope plan', type: 'note', content: 'PRIVATE_SENTINEL_73', sensitivity: 'private' }, { enrich: false });
    const prior = await ask('Private telescope plan', null, 'all', null);
    const publicItem = createItem({ title: 'Public database guide', type: 'note', content: 'Use FTS5 for local database retrieval.' }, { enrich: false });
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_MODEL = 'test-model';
    process.env.AI_API_KEY = 'test-only';
    delete process.env.AI_EMBEDDING_MODEL;
    setPreferences({ ...preferences(), aiConsent: true });
    const original = globalThis.fetch;
    globalThis.fetch = async (_input, init) => {
        const outgoing = String(init?.body);
        assert.ok(!outgoing.includes('PRIVATE_SENTINEL_73'));
        assert.ok(outgoing.includes('UNTRUSTED DATA'));
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: 'Your saved Public database guide describes local FTS5 retrieval.', usedSourceIds: [publicItem.id] }) } }] }));
    };
    try {
        const result = await ask('Public database guide', prior.conversationId, 'all', null);
        assert.equal(result.messages.at(-1)?.mode, 'ai');
        assert.equal(result.messages.at(-1)?.citations[0].itemId, publicItem.id);
    }
    finally {
        globalThis.fetch = original;
        process.env.AI_PROVIDER = 'none';
        delete process.env.AI_API_KEY;
    }
});
test('fabricated provider citations fall back to local evidence', async () => {
    const item = createItem({ title: 'Cited notebook', type: 'note', content: 'Keep records in SQLite.' }, { enrich: false });
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_MODEL = 'test-model';
    process.env.AI_API_KEY = 'test-only';
    setPreferences({ ...preferences(), aiConsent: true });
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: 'Made-up claim', usedSourceIds: [uuid()] }) } }] }));
    try {
        const result = await ask('Cited notebook', null, 'all', null);
        assert.equal(result.messages.at(-1)?.mode, 'provider-fallback');
        assert.equal(result.messages.at(-1)?.citations[0].itemId, item.id);
        assert.ok(!result.messages.at(-1)?.content.includes('Made-up claim'));
    }
    finally {
        globalThis.fetch = original;
        process.env.AI_PROVIDER = 'none';
        delete process.env.AI_API_KEY;
    }
});
test('AI suggestions require a real apply or dismiss action', async () => {
    const item = createItem({ title: 'Original title', type: 'note', content: 'Original body' }, { enrich: false });
    const suggestion = { title: 'Suggested title', summary: 'A summary of the saved body.', tags: ['reviewed'] };
    metadata(item.id, { aiSuggestions: suggestion });
    const request = () => new Request(`http://127.0.0.1:3000/api/suggestions/${item.id}`, { method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', cookie: `memnivo_session=${issueSession()}` } });
    await api(request(), { action: 'dismiss' });
    assert.equal(getItem(item.id).title, 'Original title');
    assert.equal(getItem(item.id).metadata.aiSuggestions, undefined);
    metadata(item.id, { aiSuggestions: suggestion });
    await api(request(), { action: 'apply' });
    assert.equal(getItem(item.id).title, 'Suggested title');
    assert.deepEqual(getItem(item.id).tags, ['reviewed']);
});
test('Markdown parser preserves frontmatter, wikilinks, code and block references', () => { const raw = '---\nid: stable-1\ntags: [AI, RAG]\n---\n# Test note\nSee [[Other Note|alias]] and ![[image.png]].\n```python\nprint(1)\n```\n^block-id'; const note = parseNote(raw, 'Notes/test.md'); assert.equal(note.raw, raw); assert.equal(note.stableId, 'stable-1'); assert.deepEqual(note.tags, ['ai', 'rag']); assert.ok(note.links.includes('Other Note')); assert.equal(allowedNote('Private/note.md', [], ['Private']), false); assert.equal(allowedNote('Notes/note.md', ['Notes'], ['Private']), true); assert.equal(allowedNote('.obsidian/workspace.md', [], []), false); });
test('actual filesystem vault sync handles selection, changes, rename, conflict and deletion safely', async () => {
    const vault = mkdtempSync(path.join(process.cwd(), '.cache', 'memnivo-vault-'));
    mkdirSync(path.join(vault, '.obsidian'));
    mkdirSync(path.join(vault, 'Notes'));
    mkdirSync(path.join(vault, 'Private'));
    const filename = path.join(vault, 'Notes', 'First.md');
    const raw = '---\nid: unique-note\ntags: [ai]\n---\n# First\nOriginal [[Second]]';
    writeFileSync(filename, raw);
    writeFileSync(path.join(vault, 'Private', 'secret.md'), 'Do not import');
    writeFileSync(path.join(vault, 'Notes', 'Second.md'), '# Second\nA related note');
    await connectVault(vault, ['Notes'], ['Private']);
    const first = await syncVault();
    assert.equal(first.imported, 2);
    assert.equal(listItems().length, 2);
    assert.equal(readFileSync(filename, 'utf8'), raw);
    assert.ok(all('SELECT * FROM relationships').length);
    const imported = listItems().find(i => i.title === 'First')!;
    const chunks = all<{
        id: string;
    }>('SELECT id FROM embedding_chunks WHERE item_id=?', imported.id);
    assert.equal((await syncVault()).changed, 0);
    assert.equal(all<{
        id: string;
    }>('SELECT id FROM embedding_chunks WHERE item_id=?', imported.id)[0].id, chunks[0].id);
    renameSync(filename, path.join(vault, 'Notes', 'Renamed.md'));
    assert.equal((await syncVault()).renamed, 1);
    const renamed = path.join(vault, 'Notes', 'Renamed.md');
    writeFileSync(renamed, raw + '\nSource update');
    assert.equal((await syncVault()).changed, 1);
    updateItem(imported.id, { content: 'A local edit' });
    writeFileSync(renamed, raw + '\nAnother source update');
    assert.equal((await syncVault()).conflicts, 1);
    assert.equal(getItem(imported.id).content, 'A local edit');
    assert.ok(readFileSync(renamed, 'utf8').includes('Another source update'));
    await resolveVaultConflict(imported.id, 'source');
    assert.ok(getItem(imported.id).content.includes('Another source update'));
    unlinkSync(renamed);
    assert.equal((await syncVault()).deleted, 1);
    assert.equal(getItem(imported.id).status, 'archived');
    assert.ok(vaultStatus()?.lastSync);
});
test('API auth denies unauthenticated requests and ignores client-supplied ownership', async () => {
    const request = new Request('http://127.0.0.1:3000/api/items', { headers: { host: '127.0.0.1:3000' } });
    await assert.rejects(() => api(request, undefined), /session expired/);
    const item = createItem({ title: 'Mine', type: 'note', user_id: 'another-user' }, { enrich: false });
    assert.equal(one<{
        user_id: string;
    }>('SELECT user_id FROM items WHERE id=?', item.id)?.user_id, OWNER);
    assert.throws(() => getItem(uuid()));
    assert.throws(() => createItem({ title: 'Bad link', type: 'note', projectId: uuid() }), /linked record/);
});
test('export and complete deletion remove owned records and preserve source files', () => { createItem({ title: 'Export me', type: 'note', content: 'Exact Markdown [[link]]' }, { enrich: false }); const result = exportData(); assert.equal(result.items[0].content, 'Exact Markdown [[link]]'); assert.equal(result.format, 'memnivo-export'); eraseData(); assert.equal(listItems().length, 0); assert.equal(all('SELECT * FROM messages').length, 0); assert.equal(all('SELECT * FROM embedding_chunks').length, 0); assert.equal(all('SELECT * FROM tags').length, 0); assert.equal(database().prepare('PRAGMA foreign_key_check').all().length, 0); });
