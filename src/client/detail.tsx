import { useEffect, useState } from 'react';
import { ExternalLink, Star, Archive, Trash2, MessageCircle, Bell, Check, Link2, Sparkles, RefreshCw, FileText } from 'lucide-react';
import { useWorkspace } from './context';
import { Modal, Button, Field, TypeIcon, Tag, Status, ErrorNotice } from './ui';
import { api, humanDate, errorMessage } from './api';
import { normalizeTags } from '../lib/core';
import type { Item, Activity } from '../lib/types';
interface DetailData {
    item: Item;
    activity: Activity[];
    vaultReference: {
        path: string;
        uri: string;
        status: string;
    } | null;
    jobs: {
        id: string;
        kind: string;
        status: string;
        error: string | null;
    }[];
}
export function ItemDetail({ id, onClose }: {
    id: string | null;
    onClose: () => void;
}) {
    const { data, refresh, notify, ask, newReminder, confirm } = useWorkspace();
    const [details, setDetails] = useState<DetailData | null>(null), [draft, setDraft] = useState<Item | null>(null), [error, setError] = useState(''), [saving, setSaving] = useState(false), [editing, setEditing] = useState(false), [related, setRelated] = useState('');
    async function load(key: string) {
        try {
            const result = await api<DetailData>(`items/${key}`);
            setDetails(result);
            setDraft(result.item);
            setError('');
        }
        catch (e) {
            setError(errorMessage(e));
        }
    }
    useEffect(() => {
        setDetails(null);
        setDraft(null);
        setEditing(false);
        if (id)
            void load(id);
    }, [id]);
    async function mutate(patch: Partial<Item>) {
        if (!id)
            return;
        setSaving(true);
        try {
            await api(`items/${id}`, 'PATCH', patch);
            await refresh();
            await load(id);
            notify('Item updated.');
            setEditing(false);
        }
        catch (e) {
            setError(errorMessage(e));
        }
        finally {
            setSaving(false);
        }
    }
    const item = details?.item;
    const reminders = data.reminders.filter(r => r.itemId === id && !['completed', 'dismissed'].includes(r.status));
    const relationships = data.relationships.filter(r => r.sourceId === id || r.targetId === id);
    const suggestions = item?.metadata.aiSuggestions as {
        title: string;
        summary: string;
        tags: string[];
    } | undefined;
    return <Modal open={!!id} onOpenChange={v => !v && onClose()} title={item ? 'Saved item' : 'Opening item…'} description={item ? `${item.source} · Saved ${humanDate(item.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}` : undefined} wide>{!item || !draft ? <><ErrorNotice message={error}/>{!error ? <div className="loading-line">Loading saved information…</div> : null}</> : <><div className="detail-title"><TypeIcon type={item.type} size={24}/><h2>{item.title}</h2><button className={`icon-button ${item.favorite ? 'starred' : ''}`} aria-label={item.favorite ? 'Remove favorite' : 'Add favorite'} onClick={() => void mutate({ favorite: !item.favorite })}><Star size={19} fill={item.favorite ? 'currentColor' : 'none'}/></button></div><div className="detail-toolbar"><Status status={item.status}/>{item.sensitivity === 'private' ? <Tag>Private · excluded from AI</Tag> : null}{item.url ? <a className="button secondary" href={item.url} target="_blank" rel="noreferrer">Open source <ExternalLink size={14}/></a> : null}<Button onClick={() => { onClose(); ask(`What do I know about ${item.title}?`, item.id); }}><MessageCircle size={15}/> Ask about this</Button><Button onClick={() => newReminder(item)}><Bell size={15}/> Remind me</Button></div><ErrorNotice message={error}/>{suggestions ? <div className="suggestion-box"><h3><Sparkles size={16}/> Suggestions to review</h3><strong>{suggestions.title}</strong><p>{suggestions.summary}</p><div className="tags">{suggestions.tags.map(t => <Tag key={t}>{t}</Tag>)}</div><div className="inline-actions"><Button variant="primary" busy={saving} onClick={async () => {
                    try {
                        await api(`suggestions/${id}`, 'POST', { action: 'apply' });
                        await refresh();
                        await load(id!);
                        notify('Suggestions applied.');
                    }
                    catch (e) {
                        setError(errorMessage(e));
                    }
                }}>Apply suggestions</Button><Button onClick={async () => {
                    try {
                        await api(`suggestions/${id}`, 'POST', { action: 'dismiss' });
                        await load(id!);
                        notify('Suggestions dismissed. Your version was kept.');
                    }
                    catch (e) {
                        setError(errorMessage(e));
                    }
                }}>Keep my version</Button></div></div> : null}
 {editing ? <form onSubmit={e => { e.preventDefault(); void mutate({ title: draft.title, type: draft.type, url: draft.url, source: draft.source, content: draft.content, summary: draft.summary, note: draft.note, reason: draft.reason, tags: draft.tags, projectId: draft.projectId, status: draft.status, sensitivity: draft.sensitivity }); }}><Field label="Title"><input required maxLength={240} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></Field><div className="form-grid"><Field label="Source URL (optional)"><input type="url" value={draft.url || ''} onChange={e => setDraft({ ...draft, url: e.target.value || null })}/></Field><Field label="Content type"><select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value as Item['type'] })}>{['note', 'article', 'video', 'repository', 'context', 'document', 'code'].map(t => <option key={t}>{t}</option>)}</select></Field></div><Field label="Source label"><input value={draft.source} onChange={e => setDraft({ ...draft, source: e.target.value })}/></Field><Field label="Content (Markdown or text)"><textarea className="code-editor" rows={9} value={draft.content} onChange={e => setDraft({ ...draft, content: e.target.value })}/></Field><Field label="Summary"><textarea rows={3} value={draft.summary} onChange={e => setDraft({ ...draft, summary: e.target.value })}/></Field><Field label="Why I saved this"><input value={draft.reason} onChange={e => setDraft({ ...draft, reason: e.target.value })}/></Field><Field label="Personal notes"><textarea rows={3} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })}/></Field><div className="form-grid"><Field label="Tags"><input value={draft.tags.join(', ')} onChange={e => setDraft({ ...draft, tags: e.target.value.split(',') })} onBlur={() => setDraft({ ...draft, tags: normalizeTags(draft.tags) })}/></Field><Field label="Project"><select value={draft.projectId || ''} onChange={e => setDraft({ ...draft, projectId: e.target.value || null })}><option value="">No project</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="Status"><select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as Item['status'] })}>{['inbox', 'saved', 'in_progress', 'completed', 'archived'].map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</select></Field><Field label="Privacy"><select value={draft.sensitivity} onChange={e => setDraft({ ...draft, sensitivity: e.target.value as Item['sensitivity'] })}><option value="normal">Normal</option><option value="private">Private · exclude from AI</option></select></Field></div><div className="inline-actions"><Button type="submit" variant="primary" busy={saving}>Save changes</Button><Button type="button" onClick={() => setEditing(false)}>Cancel</Button></div></form> : <><div className="detail-facts">{item.reason ? <section><h3>Why you saved it</h3><p>{item.reason}</p></section> : null}{item.summary ? <section><h3>Summary</h3><p className="pre-wrap">{item.summary}</p></section> : null}{item.metadata.contentBasis ? <p className="source-basis">{String(item.metadata.contentBasis)}</p> : null}{item.content ? <section><h3>{item.type === 'code' ? 'Code snippet' : 'Saved content'}</h3><pre className={`saved-content ${item.type === 'code' ? 'code' : ''}`}>{item.content}</pre></section> : null}{item.note ? <section><h3>Your notes</h3><p className="pre-wrap">{item.note}</p></section> : null}<div className="tags">{item.tags.map(t => <Tag key={t}>{t}</Tag>)}</div></div><div className="inline-actions"><Button onClick={() => setEditing(true)}><FileText size={15}/> Edit item</Button>{item.status !== 'completed' ? <Button onClick={() => void mutate({ status: 'completed' })}><Check size={15}/> Mark completed</Button> : null}{item.status === 'inbox' ? <Button onClick={() => void mutate({ status: 'saved' })}>Move to library</Button> : null}</div></>}
 {item.metadata.metadataWarning ? <div className="info-banner">{String(item.metadata.metadataWarning)}</div> : null}{details.jobs.some(j => j.status === 'failed') ? <div className="error-notice">Enrichment failed. Review your provider settings, then retry.</div> : null}<div className="detail-divider"/><section><h3>Follow-ups</h3>{reminders.length ? reminders.map(r => <p key={r.id}>{r.title} · {humanDate(r.snoozedUntil || r.dueAt, { dateStyle: 'medium', timeStyle: 'short' })}</p>) : <p className="muted">No active reminders. Save information without creating a task.</p>}</section>{details.vaultReference ? <section className="vault-reference"><h3>Obsidian source</h3><a href={details.vaultReference.uri}>{details.vaultReference.path} <ExternalLink size={13}/></a><Status status={details.vaultReference.status}/>{details.vaultReference.status === 'conflict' ? <><p>Both copies have changed. Choose which version the app should keep. The source file is always preserved.</p><div className="inline-actions"><Button onClick={() => confirm('Use the vault version?', 'This replaces this imported copy with the current vault note. Your source file will not be edited.', async () => { await api(`vault/${id}`, 'PATCH', { choice: 'source' }); await refresh(); await load(id!); })}>Use vault version</Button><Button onClick={async () => { await api(`vault/${id}`, 'PATCH', { choice: 'local' }); await refresh(); await load(id!); notify('Your copy is detached from vault sync.'); }}>Keep my copy & detach</Button></div></> : null}</section> : null}
 <section><h3>Connections</h3>{relationships.map(r => { const other = data.items.find(i => i.id === (r.sourceId === id ? r.targetId : r.sourceId)); return other ? <div key={r.id} className="connection-row"><Link2 size={14}/><span>{other.title}</span><small>{r.origin === 'ai' ? 'Imported / derived' : 'Your connection'}</small><Button variant="ghost" onClick={async () => { await api(`relationships/${r.id}`, 'DELETE'); await refresh(); }}>Remove</Button></div> : null; })}<div className="inline-actions"><select aria-label="Connect to another saved item" value={related} onChange={e => setRelated(e.target.value)}><option value="">Connect another item…</option>{data.items.filter(i => i.id !== id).map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</select><Button disabled={!related} onClick={async () => {
                try {
                    await api('relationships', 'POST', { sourceId: id, targetId: related, type: 'related_to' });
                    await refresh();
                    setRelated('');
                }
                catch (e) {
                    setError(errorMessage(e));
                }
            }}>Connect</Button></div></section><section><h3>Activity</h3><div className="activity-list">{details.activity.slice(0, 6).map(a => <p key={a.id}><span>{a.action}</span><small>{humanDate(a.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</small></p>)}</div></section><div className="modal-footer"><Button variant="ghost" onClick={async () => { await api(`enrich/${id}`, 'POST'); notify('Enrichment queued. The companion will process it.'); }} disabled={item.sensitivity === 'private'}><RefreshCw size={14}/> Refresh metadata</Button><div className="inline-actions"><Button onClick={() => void mutate({ status: item.status === 'archived' ? 'saved' : 'archived' })}><Archive size={15}/>{item.status === 'archived' ? 'Restore' : 'Archive'}</Button><Button variant="danger" onClick={() => confirm('Delete this item?', 'This removes the saved item, its source citations, and linked reminders. The original source is untouched.', async () => { await api(`items/${id}`, 'DELETE'); await refresh(); onClose(); notify('Item deleted.'); })}><Trash2 size={15}/></Button></div></div></>}</Modal>;
}
