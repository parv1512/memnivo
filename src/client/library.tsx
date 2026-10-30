import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, Search, Plus, Sparkles, Clock, Check, ChevronRight, FolderKanban, GitFork, Play, FileText, LayoutGrid, List, SlidersHorizontal, Archive, Trash2, Star, Bookmark, Inbox as InboxIcon, CheckCheck, BrainCircuit, Database, ArrowDownToLine } from 'lucide-react';
import { useWorkspace } from './context';
import { Button, ItemCard, ItemRow, Empty, SectionHead, Status, Tag, ErrorNotice } from './ui';
import { api, humanDate, errorMessage } from './api';
import { queryTokens, dayInZone } from '../lib/core';
import type { Item } from '../lib/types';
export function HomeView() {
    const { data, capture, ask, navigate, openItem, notify, refresh } = useWorkspace();
    const [question, setQuestion] = useState('');
    const date = new Date(), hour = date.getHours(), name = data.preferences.displayName === 'You' ? '' : `, ${data.preferences.displayName}`;
    const active = data.items.filter(i => i.status !== 'archived'), due = data.reminders.filter(r => !['completed', 'dismissed'].includes(r.status) && dayInZone(new Date(r.snoozedUntil || r.dueAt), data.preferences.timezone) <= dayInZone(date, data.preferences.timezone));
    const ongoing = active.filter(i => i.status === 'in_progress');
    return <><div className="page-heading home-heading"><div><div className="eyebrow date-eyebrow">{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(date)}</div><h1>Good {hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}{name}<span className="accent">.</span></h1><p>A little less to remember. A little more room to think.</p></div><span className="workspace-badge"><span className="live-dot"/> Your personal workspace</span></div><section className="memory-panel"><div className="memory-label"><BrainCircuit size={19}/><span>YOUR MEMORY, CONNECTED</span><span className="local-label">{data.provider.configured && data.provider.consent ? 'AI connected' : 'Local retrieval'}</span></div><h2>What’s on your mind?</h2><form className="ask-input" onSubmit={e => {
            e.preventDefault();
            if (question.trim())
                ask(question);
        }}><Search size={20}/><input aria-label="Ask your memory anything" value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask your memory anything…"/><button aria-label="Ask memory" disabled={!question.trim()}><ArrowRight size={19}/></button></form><div className="suggestion-chips">{['Find a saved repository', 'Show unfinished items', 'What did I want to learn this week?'].map(q => <button key={q} onClick={() => ask(q)}>{q}<ArrowUpRight size={12}/></button>)}</div><div className="memory-panel-corner" aria-hidden="true"><span /><span /><span /></div></section><div className="overview-strip"><div><span className="stat-icon indigo"><Bookmark size={17}/></span><span><strong>{active.length}</strong><small>things remembered</small></span></div><div><span className="stat-icon amber"><Clock size={17}/></span><span><strong>{due.length}</strong><small>need your attention</small></span></div><div><span className="stat-icon green"><FolderKanban size={17}/></span><span><strong>{data.projects.filter(p => p.status === 'active').length}</strong><small>ideas in motion</small></span></div><p>{active.length ? 'Everything has a place. You don’t have to keep it all in your head.' : 'Your next useful thought deserves a place to land.'}</p></div><div className="home-columns"><div><SectionHead title="A little attention" aside={<button className="text-button" onClick={() => navigate('/tasks')}>All follow-ups <ArrowUpRight size={13}/></button>}/><div className="attention-section">{!data.preferences.dailyReview ? <div className="attention-clear"><span><CheckCheck size={24}/></span><div><h3>Your briefing is paused.</h3><p>Open follow-ups whenever you want to review them.</p></div></div> : due.length ? due.slice(0, 3).map(r => <div className="attention-row" key={r.id}><button className="check-button" aria-label={`Complete ${r.title}`} onClick={async () => {
                try {
                    await api(`reminders/${r.id}`, 'PATCH', { action: 'complete' });
                    await refresh();
                    notify('Follow-up completed.');
                }
                catch (e) {
                    notify(errorMessage(e));
                }
            }}><Check size={15}/></button><div><strong>{r.title}</strong><small>{new Date(r.snoozedUntil || r.dueAt) < date ? 'Due' : 'Today'} · {humanDate(r.snoozedUntil || r.dueAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small></div><span className="status upcoming"><span />Follow-up</span></div>) : <div className="attention-clear"><span><CheckCheck size={24}/></span><div><h3>You have room to focus.</h3><p>No follow-ups need your attention today.</p></div></div>}</div></div><div><SectionHead title="In motion" aside={<button className="text-button" onClick={() => navigate('/projects')}>Projects <ArrowUpRight size={13}/></button>}/>{data.projects.filter(p => p.status === 'active').length ? <div className="project-mini-list">{data.projects.filter(p => p.status === 'active').slice(0, 2).map((p, i) => <button key={p.id} onClick={() => navigate(`/projects?project=${p.id}`)}><span className={`project-dot color-${i % 4}`}/><div><strong>{p.name}</strong><small>{p.itemCount} resources · {p.completedCount}/{p.taskCount} tasks done</small></div><ChevronRight size={16}/></button>)}</div> : <button className="project-start" onClick={() => navigate('/projects')}><span><FolderKanban size={21}/></span><div><strong>Give your next idea a home</strong><small>Bring resources and next steps together.</small></div><Plus size={16}/></button>}</div></div><SectionHead title="Recently captured" aside={<button className="text-button" onClick={() => navigate('/library')}>Open library <ArrowRight size={14}/></button>}/>{active.length ? <div className="item-grid home-grid">{active.slice(0, 6).map(item => <ItemCard key={item.id} item={item} onOpen={() => openItem(item)}/>)}</div> : <div className="first-capture"><div className="capture-stack" aria-hidden="true"><span><FileText size={20}/></span><span><GitFork size={22}/></span><span><Play size={20}/></span></div><div><h3>Keep the interesting things.</h3><p>A useful link. A half-formed idea. The thing you’ll need later.<br />Start with one capture, and let your memory grow.</p><Button variant="primary" onClick={capture}><Plus size={16}/> Capture your first thought</Button></div><span className="capture-shortcut"><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>N</kbd><small>whenever inspiration strikes</small></span></div>}{ongoing.length ? <><SectionHead title="Pick up where you left off"/><div className="surface">{ongoing.slice(0, 3).map(i => <ItemRow key={i.id} item={i} onOpen={() => openItem(i)}/>)}</div></> : null}<div className="home-bottom-note"><Database size={15}/><span>{data.vault ? `${data.vault.noteCount} notes connected from ${data.vault.name}. Last sync ${data.vault.lastSync ? humanDate(data.vault.lastSync, { hour: 'numeric', minute: '2-digit' }) : 'not yet'}.` : 'Your Obsidian notes can be part of the picture, too.'}</span><button className="text-button" onClick={() => navigate('/vault')}>{data.vault ? 'View vault' : 'Connect a vault'} <ArrowRight size={13}/></button></div></>;
}
export function LibraryView({ inbox, queryString }: {
    inbox: boolean;
    queryString: string;
}) {
    const { data, capture, openItem, refresh, notify, confirm } = useWorkspace();
    const [query, setQuery] = useState(new URLSearchParams(queryString).get('q') || ''), [collection, setCollection] = useState('all'), [type, setType] = useState(''), [project, setProject] = useState(''), [tag, setTag] = useState(''), [status, setStatus] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState(''), [sort, setSort] = useState('newest'), [view, setView] = useState('grid'), [filters, setFilters] = useState(false), [selected, setSelected] = useState<Set<string>>(new Set()), [remoteIds, setRemoteIds] = useState<string[] | null>(null), [error, setError] = useState(''), [searchBusy, setSearchBusy] = useState(false), [page, setPage] = useState(1);
    const allTags = [...new Set(data.items.flatMap(i => i.tags))].sort();
    useEffect(() => { setQuery(new URLSearchParams(queryString).get('q') || ''); }, [queryString]);
    useEffect(() => {
        setPage(1);
        setSelected(new Set());
        setRemoteIds(null);
        if (!query.trim())
            return;
        const timer = setTimeout(async () => {
            setSearchBusy(true);
            try {
                const response = await api<{
                    results: {
                        item: Item;
                    }[];
                }>('items?q=' + encodeURIComponent(query) + '&limit=100&archived=true');
                setRemoteIds(response.results.map(r => r.item.id));
                setError('');
            }
            catch (e) {
                setError(errorMessage(e));
            }
            finally {
                setSearchBusy(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [query, data.items.length]);
    const tokens = queryTokens(query);
    const results = useMemo(() => {
        let items = data.items.filter(i => (inbox ? i.status === 'inbox' : collection === 'archived' ? i.status === 'archived' : i.status !== 'archived') && (collection !== 'favorites' || i.favorite) && (collection !== 'completed' || i.status === 'completed') && (!type || i.type === type) && (!project || i.projectId === project) && (!tag || i.tags.includes(tag)) && (!status || i.status === status) && (!from || i.createdAt >= from) && (!to || i.createdAt.slice(0, 10) <= to));
        if (query.trim())
            items = items.filter(i => remoteIds ? remoteIds.includes(i.id) : tokens.some(t => `${i.title} ${i.content} ${i.reason} ${i.tags.join(' ')}`.toLowerCase().includes(t)));
        if (sort === 'title')
            items.sort((a, b) => a.title.localeCompare(b.title));
        else if (sort === 'oldest')
            items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        else if (sort === 'relevance' && remoteIds)
            items.sort((a, b) => remoteIds.indexOf(a.id) - remoteIds.indexOf(b.id));
        else
            items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return items;
    }, [data.items, inbox, collection, type, project, tag, status, from, to, query, remoteIds, sort, tokens]);
    async function bulk(action: 'saved' | 'archived' | 'delete') {
        try {
            for (const id of selected) {
                if (action === 'delete')
                    await api(`items/${id}`, 'DELETE');
                else
                    await api(`items/${id}`, 'PATCH', { status: action });
            }
            setSelected(new Set());
            await refresh();
            notify(action === 'delete' ? 'Selected items deleted.' : 'Selected items updated.');
        }
        catch (e) {
            setError(errorMessage(e));
            await refresh();
        }
    }
    async function importFile(file: File) {
        try {
            if (file.size > 1000000)
                throw new Error('Choose a text file smaller than 1 MB.');
            const result = await api<{
                imported?: number;
                skipped?: number;
            }>('import', 'POST', { filename: file.name, content: await file.text() });
            await refresh();
            notify(result.imported !== undefined ? `${result.imported} items imported; ${result.skipped} duplicates skipped.` : 'Document imported.');
        }
        catch (e) {
            setError(errorMessage(e));
        }
    }
    return <><div className="page-heading"><div><div className="eyebrow">{inbox ? 'CAPTURE FIRST. ORGANIZE LATER.' : 'A HOME FOR WHAT MATTERS'}</div><h1>{inbox ? 'Your inbox' : 'Your library'}<span className="count-pill">{inbox ? data.items.filter(i => i.status === 'inbox').length : data.items.length}</span></h1><p>{inbox ? 'A landing place for your latest finds. Make them useful at your own pace.' : 'Ideas, resources, and context. Always within reach.'}</p></div><div className="inline-actions"><label className="button secondary import-label"><ArrowDownToLine size={16}/> Import<input type="file" accept=".md,.txt,.json" hidden onChange={e => {
            if (e.target.files?.[0])
                void importFile(e.target.files[0]);
            e.target.value = '';
        }}/></label><Button variant="primary" onClick={capture}><Plus size={16}/> Capture</Button></div></div>{!inbox ? <div className="tabs collection-tabs">{[{ id: 'all', label: 'All items', icon: Bookmark }, { id: 'favorites', label: 'Favorites', icon: Star }, { id: 'completed', label: 'Completed', icon: CheckCheck }, { id: 'archived', label: 'Archived', icon: Archive }].map(t => <button className={collection === t.id ? 'active' : ''} key={t.id} onClick={() => { setCollection(t.id); setPage(1); }}><t.icon size={15}/>{t.label}</button>)}</div> : null}<div className="library-toolbar"><div className="search-field"><Search size={17}/><input aria-label="Search saved items" placeholder="Find something you saved…" value={query} onChange={e => setQuery(e.target.value)}/>{searchBusy ? <span className="search-spinner"/> : null}</div><select aria-label="Filter by content type" value={type} onChange={e => { setType(e.target.value); setPage(1); }}><option value="">All types</option>{['note', 'article', 'video', 'repository', 'context', 'document', 'code'].map(t => <option key={t}>{t}</option>)}</select><Button onClick={() => setFilters(!filters)}><SlidersHorizontal size={15}/> Filters{[project, tag, status, from, to].filter(Boolean).length ? <span className="filter-count">{[project, tag, status, from, to].filter(Boolean).length}</span> : null}</Button><div className="view-toggle"><button className={view === 'grid' ? 'active' : ''} aria-label="Grid view" onClick={() => setView('grid')}><LayoutGrid size={17}/></button><button className={view === 'list' ? 'active' : ''} aria-label="List view" onClick={() => setView('list')}><List size={17}/></button></div></div>{filters ? <div className="filter-panel"><label>Project<select value={project} onChange={e => setProject(e.target.value)}><option value="">All projects</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Tag<select value={tag} onChange={e => setTag(e.target.value)}><option value="">All tags</option>{allTags.map(t => <option key={t}>{t}</option>)}</select></label><label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{['inbox', 'saved', 'in_progress', 'completed', 'archived'].map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</select></label><label>From<input type="date" value={from} onChange={e => setFrom(e.target.value)}/></label><label>Through<input type="date" value={to} onChange={e => setTo(e.target.value)}/></label><Button variant="ghost" onClick={() => { setProject(''); setTag(''); setStatus(''); setFrom(''); setTo(''); setType(''); }}>Reset</Button></div> : null}<div className="results-toolbar"><span>{results.length} {results.length === 1 ? 'item' : 'items'}{query ? ` matching “${query}”` : ''}</span><div>{query ? <Button variant="ghost" onClick={async () => {
                try {
                    await api('saved-searches', 'POST', { name: query.slice(0, 80), query });
                    await refresh();
                    notify('Search saved.');
                }
                catch (e) {
                    setError(errorMessage(e));
                }
            }}><Bookmark size={13}/> Save search</Button> : null}<select aria-label="Sort items" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option><option value="relevance">Relevance</option></select></div></div>{data.savedSearches.length ? <div className="saved-searches"><small>Saved searches</small>{data.savedSearches.map(s => <span key={s.id}><button onClick={() => setQuery(s.query)}>{s.name}</button><button aria-label={`Remove saved search ${s.name}`} onClick={async () => { await api(`saved-searches/${s.id}`, 'DELETE'); await refresh(); }}>×</button></span>)}</div> : null}<ErrorNotice message={error}/>{selected.size ? <div className="bulk-bar"><strong>{selected.size} selected</strong><Button onClick={() => void bulk('saved')}><Check size={14}/> Keep</Button><Button onClick={() => void bulk('archived')}><Archive size={14}/> Archive</Button><Button variant="danger" onClick={() => confirm(`Delete ${selected.size} items?`, 'This removes the selected saved copies and linked reminders.', () => bulk('delete'))}><Trash2 size={14}/></Button><button className="text-button" onClick={() => setSelected(new Set())}>Clear</button></div> : null}{results.length ? view === 'grid' ? <div className="item-grid">{results.slice(0, page * 24).map(item => <ItemCard key={item.id} item={item} onOpen={() => openItem(item)} selected={selected.has(item.id)} onSelect={() => setSelected(prior => {
                    const next = new Set(prior);
                    if (next.has(item.id))
                        next.delete(item.id);
                    else
                        next.add(item.id);
                    return next;
                })}/>)}</div> : <div className="surface">{results.slice(0, page * 24).map(item => <div className="selectable-row" key={item.id}><input type="checkbox" aria-label={`Select ${item.title}`} checked={selected.has(item.id)} onChange={() => setSelected(prior => {
                    const n = new Set(prior);
                    if (n.has(item.id))
                        n.delete(item.id);
                    else
                        n.add(item.id);
                    return n;
                })}/><ItemRow item={item} onOpen={() => openItem(item)}/></div>)}</div> : <Empty icon={query ? 'search' : 'capture'} title={query ? 'No matching memories yet' : inbox ? 'Your inbox has room to breathe' : 'Build a collection worth coming back to'} description={query ? 'Try a different word, remove a filter, or save the source you have in mind.' : inbox ? 'New captures arrive here. Save a link or a thought whenever something catches your attention.' : 'Capture a note, a repository, a video, or an idea. It stays here, ready for when you need it.'} action={<Button variant="primary" onClick={capture}><Plus size={15}/> Quick capture</Button>}/>} {results.length > page * 24 ? <div className="load-more"><Button onClick={() => setPage(page + 1)}>Show more items</Button></div> : null}<p className="library-footnote"><LockIcon /> Important information is stored in SQLite, never in browser local storage.</p></>;
}
function LockIcon() { return <span aria-hidden="true">◇</span>; }
