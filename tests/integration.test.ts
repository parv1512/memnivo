import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { database, all, one, run, OWNER, preferences, setPreferences, uuid, now } from '../src/server/db';
import { createItem, getItem, listItems, updateItem, deleteItem, createReminder, transitionReminder, reminders, saveProject, saveTask, tasks, addRelation, eraseData, exportData, conversationMessages } from '../src/server/store';
import { search, ask, suggestProjectLinks } from '../src/server/retrieval';
import { processReminders } from '../src/server/reminders';
import { connectVault, disconnectVault, syncVault, parseNote, allowedNote, resolveVaultConflict, vaultStatus } from '../src/server/vault';
import { api } from '../src/server/api';
import { issueSession } from '../src/server/security';
import { metadata } from '../src/server/store';
import { enrichItem } from '../src/server/ai';
import type { ProjectSuggestions } from '../src/lib/types';
mkdirSync(path.resolve('.cache'), { recursive: true });
process.env.MEMNIVO_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'memnivo-integration-'));
process.env.AI_PROVIDER = 'none';
beforeEach(() => { eraseData(); setPreferences({ ...preferences(), quietStart: '00:00', quietEnd: '00:00', maxReminders: 5, timezone: 'UTC' }); });
test('capture persists in SQLite, edits, FTS indexes, archives and deletes', async () => { const item = createItem({ title: 'A local PDF chatbot', type: 'note', content: 'Use retrieval augmented generation and citations.', tags: ['RAG', 'rag'] }, { enrich: false }); assert.equal(getItem(item.id).tags.length, 1); assert.ok(all('SELECT id FROM items WHERE id=?', item.id).length); updateItem(item.id, { note: 'Start with SQLite', status: 'saved' }); assert.equal(getItem(item.id).note, 'Start with SQLite'); assert.equal((await search('PDF chatbot', { semantic: false }))[0].item.id, item.id); updateItem(item.id, { status: 'archived' }); assert.equal((await search('PDF chatbot', { semantic: false })).length, 0); deleteItem(item.id); assert.throws(() => getItem(item.id)); assert.equal(all('SELECT * FROM items_fts WHERE item_id=?', item.id).length, 0); assert.equal(all('SELECT * FROM embedding_chunks WHERE item_id=?', item.id).length, 0); });
test('canonical URL deduplication rejects tracked duplicates', () => { createItem({ title: 'Repo', type: 'repository', url: 'https://github.com/test/repo?utm_source=feed' }, { enrich: false }); assert.throws(() => createItem({ title: 'Same repo', type: 'repository', url: 'https://github.com/test/repo' }, { enrich: false }), /already in your library/); });
test('background source refresh keeps manual edits and clears a recovered fetch failure', async () => {
    const item = createItem({ title: 'Manual title', type: 'article', url: 'https://example.com/first' });
    await enrichItem(item.id, async () => { throw new Error('fixture unavailable'); });
    assert.equal(getItem(item.id).metadata.metadataFetchFailed, true);
    const refreshed = (text: string) => async () => ({ title: 'Fetched title', extractedText: text, description: 'Solar battery charging', contentBasis: 'Public page text' });
    await enrichItem(item.id, refreshed('First downloaded text'));
    assert.equal(getItem(item.id).metadata.metadataFetchFailed, false);
    assert.equal(getItem(item.id).metadata.metadataWarning, null);
    assert.equal(getItem(item.id).content, 'First downloaded text');
    await enrichItem(item.id, refreshed('Updated downloaded text'));
    assert.equal(getItem(item.id).content, 'Updated downloaded text');
    updateItem(item.id, { content: 'My corrections', note: 'Keep this note' });
    await enrichItem(item.id, refreshed('New website text'));
    const current = getItem(item.id);
    assert.equal(current.content, 'My corrections');
    assert.equal(current.note, 'Keep this note');
    assert.equal(current.title, 'Manual title');
    assert.equal((await search('solar battery')).at(0)?.item.id, item.id);
    updateItem(item.id, { content: '' });
    await enrichItem(item.id, refreshed('Text should stay empty'));
    assert.equal(getItem(item.id).content, '');
});
test('changing a source link invalidates old metadata and ignores an in-flight response for the old link', async () => {
    const item = createItem({ title: 'Saved reference', type: 'article', url: 'https://example.com/first' });
    await enrichItem(item.id, async () => ({ extractedText: 'Old source text', description: 'Old source description' }));
    let finish!: (value: Record<string, unknown>) => void;
    const inFlight = enrichItem(item.id, () => new Promise(resolve => { finish = resolve; }));
    updateItem(item.id, { url: 'https://example.com/second', note: 'Remember the new link' });
    finish({ extractedText: 'Stale response', description: 'Stale description' });
    await inFlight;
    const current = getItem(item.id);
    assert.equal(current.url, 'https://example.com/second');
    assert.equal(current.content, '');
    assert.equal(current.metadata.description, undefined);
    assert.equal(current.note, 'Remember the new link');
    assert.equal(all("SELECT id FROM jobs WHERE item_id=? AND kind='enrich' AND status='pending'", item.id).length, 1);
});
test('quick capture with a follow-up commits one item and reminder even when submission is retried', async () => {
    const origin = 'http://127.0.0.1:3000';
    const request = () => new Request(`${origin}/api/items`, { method: 'POST', headers: { origin, host: '127.0.0.1:3000', cookie: `memnivo_session=${issueSession()}` } });
    const note = { title: 'x'.repeat(240), type: 'note', content: 'A capture with a follow-up' };
    await assert.rejects(api(request(), { ...note, followUp: { dueAt: 'invalid', timezone: 'UTC' } }));
    assert.equal(listItems().length, 0);
    const body = { ...note, followUp: { dueAt: now(), timezone: 'UTC' } };
    await api(request(), body);
    await assert.rejects(api(request(), body), /already in your library/);
    assert.equal(listItems().length, 1);
    assert.equal(reminders().length, 1);
    assert.equal(reminders()[0].itemId, listItems()[0].id);
});
test('invalid portable imports fail without saving partial items', async () => {
    const origin = 'http://127.0.0.1:3000';
    const request = () => new Request(`${origin}/api/import`, { method: 'POST', headers: { origin, host: '127.0.0.1:3000', cookie: `memnivo_session=${issueSession()}` } });
    const filename = 'memnivo-export.json';
    const good = { title: 'Portable note', type: 'note', content: 'Saved to an export' };
    await assert.rejects(api(request(), { filename, content: '{' }), /invalid JSON/);
    const content = JSON.stringify({ format: 'memnivo-export', items: [good, { title: '', type: 'note' }] });
    await assert.rejects(api(request(), { filename, content }));
    assert.equal(listItems().length, 0);
    const valid = JSON.stringify({ format: 'memnivo-export', items: [good, good] });
    assert.deepEqual((await api(request(), { filename, content: valid })).body, { imported: 1, skipped: 1 });
});
test('project links and task completion persist without orphaned references', () => { const project = saveProject({ name: 'Build a chatbot' })!; const item = createItem({ title: 'Chat architecture', type: 'note', projectId: project.id }, { enrich: false }); const task = saveTask({ title: 'Try retrieval', projectId: project.id, itemId: item.id })!; createReminder({ title: 'Try retrieval', taskId: task.id, dueAt: now(), timezone: 'UTC' }); saveTask({ status: 'completed' }, task.id); assert.equal(tasks()[0].status, 'completed'); assert.equal(reminders()[0].status, 'completed'); assert.ok(tasks()[0].completedAt); });
test('snooze, one-time notification, and item completion resolve reminders', () => { const item = createItem({ title: 'Watch vector tutorial', type: 'video', url: 'https://youtube.com/watch?v=test' }, { enrich: false }); const r = createReminder({ title: 'Watch it', itemId: item.id, dueAt: '2026-10-01T12:00:00.000Z', timezone: 'UTC' }); const clock = new Date('2026-10-02T12:00:00.000Z'); assert.equal(processReminders(clock), 1); assert.equal(processReminders(clock), 0); assert.equal(all('SELECT * FROM notifications').length, 1); transitionReminder(r.id, 'snooze', new Date(Date.now() + 3600000).toISOString()); assert.equal(reminders()[0].status, 'snoozed'); updateItem(item.id, { status: 'completed' }); assert.equal(reminders()[0].status, 'completed'); });
test('reminders compare time-zone offsets correctly, including dates stored by older versions', () => {
    const dueAt = '2026-11-15T02:15:00-05:00';
    const reminder = createReminder({ title: 'Offset check', dueAt, timezone: 'America/New_York' });
    assert.equal(reminder.dueAt, '2026-11-15T07:15:00.000Z');
    run('UPDATE reminders SET due_at=? WHERE id=?', dueAt, reminder.id);
    assert.equal(processReminders(new Date('2026-11-15T07:14:59.000Z')), 0);
    assert.equal(processReminders(new Date('2026-11-15T07:15:00.000Z')), 1);
});
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
test('casual chat skips search and the provider even when saved notes match its wording', async () => {
    const note = createItem({ title: 'How are you doing?', type: 'note', content: 'Personal notes for a check-in.' }, { enrich: false });
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_MODEL = 'test-model';
    process.env.AI_API_KEY = 'test-only';
    process.env.AI_EMBEDDING_MODEL = 'test-embedding';
    setPreferences({ ...preferences(), aiConsent: true });
    const originalFetch = globalThis.fetch;
    let providerCalls = 0;
    globalThis.fetch = async () => {
        providerCalls++;
        throw new Error('Casual chat should stay local');
    };
    try {
        const first = await ask('how r u?', null, 'all', null);
        assert.match(first.messages.at(-1)!.content, /I'm doing well/);
        const second = await ask('Hey, how are you doing today?', first.conversationId, 'item', note.id);
        const third = await ask('Thanks!', second.conversationId, 'all', null);
        assert.match(third.messages.at(-1)!.content, /You're welcome/);
        for (const message of third.messages.filter(message => message.role === 'assistant')) {
            assert.equal(message.mode, 'conversation');
            assert.equal(message.citations.length, 0);
        }
        assert.equal(providerCalls, 0);
    }
    finally {
        globalThis.fetch = originalFetch;
        process.env.AI_PROVIDER = 'none';
        delete process.env.AI_API_KEY;
        delete process.env.AI_EMBEDDING_MODEL;
    }
});
test('ordinary questions rank strong evidence, skip partial matches and respect a selected item', async () => {
    const strongest = createItem({ title: 'PDF chatbot citation pattern', type: 'note', content: 'Overview and setup. Teach the PDF chatbot to cite the page number next to each answer.' }, { enrich: false });
    const second = createItem({ title: 'PDF chatbot setup', type: 'note', content: 'Enable citations in the PDF chatbot configuration.' }, { enrich: false });
    createItem({ title: 'PDF invoice checklist', type: 'note', content: 'How to file invoices as PDF documents.' }, { enrich: false });
    createItem({ title: 'Cooking guide', type: 'note', content: 'How to freeze tomatoes.' }, { enrich: false });

    const question = 'Hi, how do I add citations to my PDF chatbot?';
    const result = await ask(question, null, 'all', null);
    const answer = result.messages.at(-1)!;
    assert.deepEqual(answer.citations.map(source => source.itemId), [strongest.id, second.id]);
    assert.match(answer.content, /\[1\] PDF chatbot citation pattern\nTeach the PDF chatbot to cite the page number/);

    const scoped = (await ask('Summarize this', null, 'item', second.id)).messages.at(-1)!;
    assert.deepEqual(scoped.citations.map(source => source.itemId), [second.id]);
    assert.match(scoped.content, /Enable citations in the PDF chatbot configuration/);
});
test('unfinished work lists open tasks and written to-dos while excluding completed items and reference links', async () => {
    const project = saveProject({ name: 'Semester planning' })!;
    const note = createItem({ type: 'note', title: 'Weekend notes', projectId: project.id, content: [
        'I have these different works to be done:',
        '1. Finish the economics assignment',
        '2. Submit the study group form',
        '3. Renew the parking permit',
        '4. [Design references](https://example.com/design)',
        '- [ ] Upload the lecture notes',
        '- [x] Pay the library fee',
        '- ~~Print the old syllabus~~',
        '## Completed',
        '- Renew the parking permit',
        '## Saved links',
        '- Design references — https://example.com/design',
    ].join('\n') }, { enrich: false });
    createItem({ type: 'note', title: 'Office hours note', content: 'I need to email the professor and send the meeting agenda.' }, { enrich: false });
    createItem({ type: 'note', title: 'Class discussion', content: 'We discussed unfinished assignments and our general approach.' }, { enrich: false });
    createItem({ type: 'article', title: 'Design reference', url: 'https://example.com/design', reason: 'Saved for my other works', projectId: project.id }, { enrich: false });
    createItem({ type: 'repository', title: 'Starter templates', url: 'https://github.com/example/templates', status: 'in_progress' }, { enrich: false });
    saveTask({ title: 'Book an advising appointment', projectId: project.id });
    saveTask({ title: 'Finish the economics assignment', itemId: note.id, status: 'completed' });
    saveTask({ title: 'Call the housing office' });

    const response = (await ask('What are my unifinished works?', null, 'all', null)).messages.at(-1)!;
    assert.equal(response.mode, 'unfinished-work');
    assert.deepEqual(new Set(response.citations.map(source => source.title)), new Set(['Weekend notes', 'Office hours note']));
    for (const expected of ['Book an advising appointment', 'Submit the study group form', 'Upload the lecture notes', 'email the professor', 'send the meeting agenda', 'Call the housing office']) {
        assert.ok(response.content.includes(expected), expected);
    }
    assert.doesNotMatch(response.content, /economics assignment|parking permit|library fee|old syllabus|Design reference|Starter templates|Class discussion/);

    const scoped = (await ask('What are my unfinished tasks for Semester planning?', null, 'all', null)).messages.at(-1)!;
    assert.deepEqual(scoped.citations.map(source => source.itemId), [note.id]);
    assert.match(scoped.content, /Book an advising appointment/);
    assert.doesNotMatch(scoped.content, /Call the housing office|email the professor/);
});

test('asking for unfinished work does not surface a library of saved references', async () => {
    const reference = createItem({ type: 'article', title: 'Garden guide', url: 'https://example.com/gardening', reason: 'Useful for unfinished work in the garden' }, { enrich: false });
    const answer = (await ask('Show unfinished items', null, 'all', null)).messages.at(-1)!;
    assert.equal(answer.citations.length, 0);
    assert.match(answer.content, /no open tasks or clear to-dos/);

    const resourceAnswer = (await ask('Which links would help with my unfinished work in the garden?', null, 'all', null)).messages.at(-1)!;
    assert.equal(resourceAnswer.mode, 'retrieval');
    assert.equal(resourceAnswer.citations[0].itemId, reference.id);
});
test('projects suggest saved links from their goals and update after the source or goal changes', async () => {
    const link = createItem({ title: 'Saved document resource', type: 'article', url: 'https://example.test/document-qa' }, { enrich: false });
    createItem({ title: 'PDF invoice templates', type: 'article', url: 'https://example.test/invoices' }, { enrich: false });
    createItem({ title: 'PDF chatbot citations', type: 'note', content: 'A note about PDF chatbot citations' }, { enrich: false });
    const project = saveProject({ name: 'Atlas', goal: 'Add citations to my PDF chatbot' })!;
    createItem({ title: 'PDF chatbot citations quickstart', type: 'repository', url: 'https://example.test/quickstart', projectId: project.id }, { enrich: false });
    createItem({ title: 'PDF chatbot citations old guide', type: 'article', url: 'https://example.test/old-guide', status: 'archived' }, { enrich: false });

    async function suggestions(id: string) {
        const request = new Request(`http://127.0.0.1:3000/api/projects/${id}/suggestions`, { headers: { host: '127.0.0.1:3000', cookie: `memnivo_session=${issueSession()}` } });
        return (await api(request, undefined)).body as ProjectSuggestions;
    }

    assert.deepEqual(await suggestions(project.id), { needsContext: false, links: [] });
    metadata(link.id, { description: 'The PDF chatbot cites original pages in answers.' });
    const found = await suggestions(project.id);
    assert.deepEqual(found.links.map(({ itemId }) => itemId), [link.id]);
    assert.deepEqual(found.links[0].topics, ['citation', 'pdf', 'chatbot']);
    assert.match(found.links[0].excerpt ?? '', /cites original pages/);
    assert.equal(found.links[0].url, link.url);

    saveProject({ name: 'Atlas', goal: 'Plan a sourdough workshop' }, project.id);
    assert.deepEqual(await suggestions(project.id), { needsContext: false, links: [] });
    const vague = saveProject({ name: 'New project' })!;
    assert.deepEqual(await suggestions(vague.id), { needsContext: true, links: [] });

    const nameMatch = createItem({ title: 'PeakCut', type: 'repository', url: 'https://example.test/video-editor' }, { enrich: false });
    const named = saveProject({ name: 'PeakCut' })!;
    assert.deepEqual((await suggestions(named.id)).links.map(({ itemId }) => itemId), [nameMatch.id]);
});
test('attaching a strong suggestion leaves weaker links out and safely handles retries', async () => {
    const project = saveProject({ name: 'Voice demo', goal: 'Voice generation Python audio synthesis deployment' })!;
    const other = saveProject({ name: 'A second project' })!;
    const best = createItem({
        title: 'Voice generation Python audio synthesis deployment',
        type: 'article',
        url: 'https://example.test/voice-sdk',
    }, { enrich: false });
    createItem({
        title: 'Python audio deployment checklist',
        type: 'article',
        url: 'https://example.test/audio-checklist',
        content: 'Deploy a Python audio player with a static playlist.',
    }, { enrich: false });

    const origin = 'http://127.0.0.1:3000';
    const headers = { origin, host: '127.0.0.1:3000', cookie: `memnivo_session=${issueSession()}` };
    const path = `${origin}/api/projects/${project.id}`;
    const getSuggestions = async () => (await api(new Request(`${path}/suggestions`, { headers }), undefined)).body as ProjectSuggestions;
    function attach(projectUrl: string, expectedProjectId: string | null) {
        return api(new Request(`${projectUrl}/links`, { method: 'POST', headers }), { itemId: best.id, expectedProjectId });
    }

    assert.deepEqual((await getSuggestions()).links.map(link => link.itemId), [best.id]);
    await attach(path, null);
    await attach(path, null);
    assert.equal(getItem(best.id).projectId, project.id);
    assert.deepEqual(await getSuggestions(), { needsContext: false, links: [] });
    const otherPath = `${origin}/api/projects/${other.id}`;
    await assert.rejects(attach(otherPath, null), /project changed/);
    assert.equal(getItem(best.id).projectId, project.id);
    await attach(otherPath, project.id);
    assert.equal(getItem(best.id).projectId, other.id);
});
test('project suggestions ignore generic action words without AI', async () => {
    const project = saveProject({ name: 'Research', goal: 'Finding a new startup idea' })!;
    const link = createItem({ title: 'IdeaBrowser', type: 'article', url: 'https://ideabrowser.com/', summary: 'Browse startup ideas and market research.' }, { enrich: false });
    const { links } = await suggestProjectLinks(project);
    assert.deepEqual(links.map(suggestion => [suggestion.itemId, suggestion.evidence]), [[link.id, 'topics']]);
});

test('local Ollama matches by meaning, attachments boost related projects, and dismissals stay scoped', async () => {
    const initial = saveProject({ name: 'Discovery', goal: 'Find a new startup idea' })!;
    const similar = saveProject({ name: 'Planning', goal: 'Validate a business opportunity' })!;
    const separate = saveProject({ name: 'Router', goal: 'Configure a packet network' })!;
    const idea = createItem({ title: 'IdeaBrowser', type: 'article', url: 'https://ideabrowser.com/', content: 'Discover business opportunities and market gaps.' }, { enrich: false });
    const reference = createItem({ title: 'Market notes', type: 'article', url: 'https://example.test/market', content: 'Explore promising opportunities.' }, { enrich: false });
    const privateLink = createItem({ title: 'Private notes', type: 'article', url: 'https://example.test/private', content: 'Private fixture', sensitivity: 'private' }, { enrich: false });
    const model = 'project-feedback-fixture';
    run('UPDATE embedding_chunks SET embedding=?,model=? WHERE item_id=?', JSON.stringify([0.98, 0.2, 0]), 'ollama:' + model, idea.id);
    for (const link of [reference, privateLink])
        run('UPDATE embedding_chunks SET embedding=?,model=? WHERE item_id=?', JSON.stringify([1, 0, 0]), 'ollama:' + model, link.id);

    const names = ['AI_PROVIDER', 'AI_BASE_URL', 'AI_MODEL', 'AI_EMBEDDING_MODEL'];
    const originalEnv = names.map(name => [name, process.env[name]] as const);
    const originalFetch = globalThis.fetch;
    Object.assign(process.env, { AI_PROVIDER: 'ollama', AI_BASE_URL: 'http://127.0.0.1:11434/v1', AI_MODEL: 'test', AI_EMBEDDING_MODEL: model });
    setPreferences({ ...preferences(), aiConsent: true });
    globalThis.fetch = async (url, init) => {
        assert.equal(String(url), 'http://127.0.0.1:11434/v1/embeddings');
        const body = JSON.parse(String(init?.body)) as { input: string[] };
        return new Response(JSON.stringify({ data: body.input.map((context, index) => ({
            index, embedding: /packet/.test(context) ? [0, 0, 1] : [1, 0, 0],
        })) }));
    };

    try {
        const before = await suggestProjectLinks(similar);
        assert.deepEqual(before.links.map(link => link.itemId), [reference.id, idea.id]);
        assert.equal(before.links[1].evidence, 'semantic');
        assert.match(before.links[1].excerpt ?? '', /business opportunities/);

        // The ordinary attachment path stores the goal. A later move or detach keeps that example.
        updateItem(idea.id, { projectId: initial.id });
        updateItem(idea.id, { projectId: initial.id });
        updateItem(idea.id, { projectId: null });
        assert.equal(all('SELECT * FROM project_link_feedback WHERE item_id=? AND signal=\'attached\'', idea.id).length, 1);
        assert.equal((await suggestProjectLinks(separate)).links.length, 0);
        const after = await suggestProjectLinks(similar);
        assert.deepEqual(after.links.map(link => link.itemId), [idea.id, reference.id]);
        assert.equal(after.links[0].evidence, 'attachment');

        const origin = 'http://127.0.0.1:3000';
        const request = new Request(`${origin}/api/projects/${similar.id}/suggestions`, {
            method: 'POST', headers: { origin, host: '127.0.0.1:3000', cookie: `memnivo_session=${issueSession()}` },
        });
        await api(request, { itemId: idea.id });
        assert.deepEqual((await suggestProjectLinks(similar)).links.map(link => link.itemId), [reference.id]);
        assert.ok((await suggestProjectLinks(initial)).links.some(link => link.itemId === idea.id));
    }
    finally {
        globalThis.fetch = originalFetch;
        for (const [name, value] of originalEnv) {
            if (value === undefined)
                delete process.env[name];
            else
                process.env[name] = value;
        }
    }
});

test('recommendations cite the useful passage and skip items that only match generic language or one topic', async () => {
    const repo = createItem({
        title: 'Document Q&A starter',
        type: 'repository',
        url: 'https://github.com/example/document-qa',
        content: 'Install the package and read the getting started notes.\n\nUse the PDF loader to index documents. The chatbot retrieves and cites passages from your PDFs.',
    }, { enrich: false });
    const decoys = [
        { title: 'Build a portfolio website', content: 'A helpful project for learning website design.' },
        { title: 'Weekend recipe project', content: 'Build your own meal planner with these useful resources.' },
        { title: 'PDF invoice templates', content: 'Use these PDF templates for invoicing.' },
    ];
    for (const item of decoys)
        createItem({ ...item, type: 'article' }, { enrich: false });

    const result = await ask('Which saved websites are useful for my project to build a PDF chatbot?', null, 'all', null);
    const answer = result.messages.at(-1)!;
    assert.deepEqual(answer.citations.map(source => source.itemId), [repo.id]);
    assert.match(answer.content, /Start with Document Q&A starter/);
    assert.match(answer.content, /retrieves and cites passages/);
    assert.equal(answer.citations[0].url, repo.url);
});

test('a named project supplies its goal and an ambiguous request asks for context', async () => {
    saveProject({ name: 'Atlas', goal: 'Build a PDF chatbot' });
    saveProject({ name: 'Personal site', goal: 'Publish a design portfolio' });
    const resource = createItem({ title: 'Paper tools', type: 'article', url: 'https://example.com/papers' }, { enrich: false });
    metadata(resource.id, { description: 'A PDF chatbot starter with document citations.' });

    const named = (await ask('What should I use for Atlas?', null, 'all', null)).messages.at(-1)!;
    assert.deepEqual(named.citations.map(source => source.itemId), [resource.id]);
    assert.match(named.content, /PDF chatbot starter with document citations/);
    const ambiguous = (await ask('Which links could help my current project right now?', null, 'all', null)).messages.at(-1)!;
    assert.equal(ambiguous.citations.length, 0);
    assert.match(ambiguous.content, /Which project or task/);
    const unmatched = (await ask('What saved websites could help me make sourdough bread?', null, 'all', null)).messages.at(-1)!;
    assert.equal(unmatched.citations.length, 0);
    assert.match(unmatched.content, /could not find a saved source that clearly fits/);
});

test('the provider sees relevant saved sources and its next steps stay attached to the cited items', async () => {
    const repo = createItem({ title: 'PDF chatbot starter', type: 'repository', content: 'Use a PDF loader and index document passages.' }, { enrich: false });
    const article = createItem({ title: 'Adding citations to a PDF chatbot', type: 'article', content: 'Include the page number beside each excerpt.' }, { enrich: false });
    createItem({ title: 'Project planning guide', type: 'article', content: 'Helpful resources for a new project.' }, { enrich: false });
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_MODEL = 'test-model';
    process.env.AI_API_KEY = 'test-only';
    setPreferences({ ...preferences(), aiConsent: true });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_input, init) => {
        const request = JSON.parse(String(init?.body));
        const { sources } = JSON.parse(request.messages.at(-1).content);
        assert.deepEqual(new Set(sources.map((source: { id: string }) => source.id)), new Set([repo.id, article.id]));
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ recommendations: [
            { sourceId: article.id, why: 'Its page-number examples show how to cite the PDFs in chatbot answers.', nextStep: 'Add the page number beside each retrieved excerpt.' },
            { sourceId: repo.id, why: 'The PDF loader in this repo can prepare the source documents for retrieval.', nextStep: 'Try the loader with one PDF and index its passages.' },
        ] }) } }] }));
    };
    try {
        const result = await ask('Which links would help me build a PDF chatbot?', null, 'all', null);
        const answer = result.messages.at(-1)!;
        assert.equal(answer.mode, 'ai');
        assert.deepEqual(answer.citations.map(source => source.itemId), [article.id, repo.id]);
        assert.match(answer.content, /Add the page number beside each retrieved excerpt/);
    }
    finally {
        globalThis.fetch = originalFetch;
        process.env.AI_PROVIDER = 'none';
        delete process.env.AI_API_KEY;
    }
});
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
test('generated answers preserve citation order without sharing previous private conversation excerpts', async () => {
    createItem({ title: 'Private telescope plan', type: 'note', content: 'PRIVATE_SENTINEL_73', sensitivity: 'private' }, { enrich: false });
    const prior = await ask('Private telescope plan', null, 'all', null);
    const publicItem = createItem({ title: 'Local database retrieval', type: 'note', content: 'Use FTS5 for database searches.' }, { enrich: false });
    const setup = createItem({ title: 'Database retrieval example', type: 'note', content: 'Set up a local FTS5 index.' }, { enrich: false });
    process.env.AI_PROVIDER = 'openai-compatible';
    process.env.AI_MODEL = 'test-model';
    process.env.AI_API_KEY = 'test-only';
    delete process.env.AI_EMBEDDING_MODEL;
    setPreferences({ ...preferences(), aiConsent: true });
    const original = globalThis.fetch;
    let outgoing = '';
    globalThis.fetch = async (_input, init) => {
        outgoing = String(init?.body);
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: 'Create a local FTS5 index [1], then use FTS5 for database searches [2].', usedSourceIds: [setup.id, publicItem.id] }) } }] }));
    };
    try {
        const result = await ask('How does local database retrieval use FTS5?', prior.conversationId, 'all', null);
        assert.ok(!outgoing.includes('PRIVATE_SENTINEL_73'));
        assert.ok(outgoing.includes('UNTRUSTED DATA'));
        const { sources } = JSON.parse(JSON.parse(outgoing).messages.at(-1).content);
        assert.deepEqual(sources.map((source: { id: string }) => source.id), [publicItem.id, setup.id]);
        assert.equal(result.messages.at(-1)?.mode, 'ai');
        assert.deepEqual(result.messages.at(-1)?.citations.map(source => source.itemId), [setup.id, publicItem.id]);
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
    const second = listItems().find(item => item.title === 'Second')!;
    run('UPDATE vault_connections SET excludes=? WHERE user_id=?', JSON.stringify(['Private', 'Notes/Second.md']), OWNER);
    writeFileSync(path.join(vault, 'Notes', 'Second.md'), '# Second\nSource edited after exclusion');
    writeFileSync(path.join(vault, 'Notes', 'Long.md'), 'x'.repeat(250001));
    assert.deepEqual(await syncVault(), { imported: 0, changed: 0, renamed: 0, deleted: 0, conflicts: 0 });
    assert.equal(getItem(second.id).status, 'saved');
    assert.match(getItem(second.id).content, /A related note/);
    disconnectVault();
    assert.equal(vaultStatus(), null);
    await assert.rejects(syncVault(), /Connect a vault/);
    assert.equal(getItem(second.id).status, 'saved');
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
