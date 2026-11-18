import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { WorkspaceContext } from '../src/client/context';
import { HomeView, LibraryView, SavedLinksView } from '../src/client/library';
import { ChatView } from '../src/client/chat';
import { ProjectsView, TasksView } from '../src/client/work';
import { GraphView } from '../src/client/graph';
import { SettingsView, VaultView } from '../src/client/settings';
import { snapshot } from '../src/server/api';
import { createItem, saveProject } from '../src/server/store';
mkdirSync('.cache', { recursive: true });
process.env.MEMNIVO_DATA_DIR = mkdtempSync(path.resolve('.cache/screens-'));
function render(children: ReactNode) { return renderToStaticMarkup(<WorkspaceContext.Provider value={{ data: snapshot(), refresh: async () => { }, notify: () => { }, openItem: () => { }, navigate: () => { }, capture: () => { }, ask: () => { }, newReminder: () => { }, confirm: () => { } }}>{children}</WorkspaceContext.Provider>); }
test('all navigation destinations render meaningful and distinct empty states', () => { const screens = [{ name: 'home', view: <HomeView />, text: 'What’s on your mind?' }, { name: 'library', view: <LibraryView inbox={false} queryString=""/>, text: 'Your library' }, { name: 'inbox', view: <LibraryView inbox={true} queryString=""/>, text: 'Your inbox' }, { name: 'chat', view: <ChatView queryString=""/>, text: 'You don’t need to remember' }, { name: 'projects', view: <ProjectsView queryString=""/>, text: 'Projects' }, { name: 'tasks', view: <TasksView />, text: 'Follow through' }, { name: 'graph', view: <GraphView />, text: 'Connect the dots' }, { name: 'vault', view: <VaultView />, text: 'Alongside Obsidian' }, { name: 'settings', view: <SettingsView />, text: 'Make it yours' }]; const htmls = screens.map(s => { const html = render(s.view); assert.ok(html.includes(s.text), s.name); return html; }); assert.equal(new Set(htmls).size, screens.length); });
test('saved titles are escaped and real project resources render', () => { const project = saveProject({ name: 'Real test project' })!; createItem({ title: '<script>alert(1)</script>', type: 'note', content: 'Safe text', projectId: project.id }, { enrich: false }); const library = render(<LibraryView inbox={false} queryString=""/>); assert.ok(library.includes('&lt;script&gt;alert(1)&lt;/script&gt;')); assert.ok(!library.includes('<script>alert(1)</script>')); const details = render(<ProjectsView queryString={`project=${project.id}`}/>); assert.ok(details.includes('Real test project')); assert.ok(details.includes('Safe text') || details.includes('&lt;script&gt;')); });

test('the saved links view filters active URLs and searches their saved context', () => {
    createItem({ title: 'A browser test resource', type: 'article', url: 'https://example.test/reference', reason: 'Handy for PDF citations' }, { enrich: false });
    createItem({ title: 'An archived test page', type: 'article', url: 'https://example.test/old', status: 'archived' }, { enrich: false });
    createItem({ title: 'A standalone note', type: 'note', content: 'Also about PDF citations' }, { enrich: false });
    const all = render(<SavedLinksView queryString=""/>);
    assert.match(all, /https:\/\/example\.test\/reference/);
    assert.doesNotMatch(all, /An archived test page|A standalone note/);
    assert.match(render(<SavedLinksView queryString="q=pdf+citations"/>), /A browser test resource/);
    assert.match(render(<SavedLinksView queryString="q=sourdough"/>), /No matching links/);
});
