import { useEffect, useRef, useState } from 'react';
import { BrainCircuit, Plus, ArrowUp, ArrowUpRight, Copy, ThumbsUp, ThumbsDown, Trash2, RefreshCw, Search, FileText, GitFork, Clock, ShieldCheck, ChevronDown } from 'lucide-react';
import { useWorkspace } from './context';
import { Button, TypeIcon, Empty, ErrorNotice, Tag } from './ui';
import { api, humanDate, errorMessage } from './api';
import type { Message } from '../lib/types';
export function ChatView({ queryString }: {
    queryString: string;
}) {
    const { data, openItem, refresh, notify, navigate, confirm } = useWorkspace();
    const [conversationId, setConversationId] = useState<string | null>(null), [messages, setMessages] = useState<Message[]>([]), [question, setQuestion] = useState(''), [scope, setScope] = useState('all'), [scopeId, setScopeId] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [lastQuestion, setLastQuestion] = useState(''), [historyOpen, setHistoryOpen] = useState(false);
    const submitted = useRef(''), bottom = useRef<HTMLDivElement>(null);
    async function send(text: string, overrideScope?: string, overrideId?: string) {
        if (!text.trim() || busy)
            return;
        setBusy(true);
        setError('');
        setLastQuestion(text);
        setQuestion('');
        try {
            const result = await api<{
                conversationId: string;
                messages: Message[];
            }>('chat', 'POST', { question: text, conversationId, scope: overrideScope || scope, scopeId: overrideId || scopeId || null });
            setConversationId(result.conversationId);
            setMessages(result.messages);
            await refresh();
        }
        catch (e) {
            setError(errorMessage(e));
            setQuestion(text);
        }
        finally {
            setBusy(false);
        }
    }
    useEffect(() => {
        const params = new URLSearchParams(queryString), q = params.get('q'), item = params.get('item');
        if (item) {
            setScope('item');
            setScopeId(item);
        }
        if (q && submitted.current !== queryString) {
            submitted.current = queryString;
            void send(q, item ? 'item' : 'all', item || undefined);
        }
    }, [queryString]);
    useEffect(() => { bottom.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'end' }); }, [messages, busy]);
    const newChat = () => { setConversationId(null); setMessages([]); setError(''); setQuestion(''); setLastQuestion(''); setScope('all'); setScopeId(''); submitted.current = ''; navigate('/ask'); };
    async function load(id: string) {
        setBusy(true);
        setError('');
        try {
            setMessages(await api<Message[]>(`conversations/${id}`));
            setConversationId(id);
            setHistoryOpen(false);
        }
        catch (e) {
            setError(errorMessage(e));
        }
        finally {
            setBusy(false);
        }
    }
    return <div className="chat-layout"><aside className={`chat-history ${historyOpen ? 'open' : ''}`}><div className="chat-history-head"><span>CONVERSATIONS</span><button className="icon-button" aria-label="New conversation" onClick={newChat}><Plus size={17}/></button></div>{data.conversations.length ? data.conversations.map(c => <div className={`conversation-link ${conversationId === c.id ? 'active' : ''}`} key={c.id}><button onClick={() => void load(c.id)}><BrainCircuit size={15}/><span>{c.title}<small>{humanDate(c.updatedAt)}</small></span></button><button className="icon-button" aria-label={`Delete conversation ${c.title}`} onClick={() => confirm('Delete this conversation?', 'This removes its messages and citations. Saved sources remain in your library.', async () => {
                await api(`conversations/${c.id}`, 'DELETE');
                await refresh();
                if (conversationId === c.id)
                    newChat();
            })}><Trash2 size={13}/></button></div>) : <p className="history-empty">Your questions will find a home here.</p>}<div className="chat-privacy"><ShieldCheck size={18}/><p>Grounded in your saved information. Sources stay a click away.</p></div></aside><section className="chat-main"><div className="chat-topline"><button className="text-button mobile-history" onClick={() => setHistoryOpen(!historyOpen)}>Conversations <ChevronDown size={14}/></button><span><BrainCircuit size={17}/> Ask your memory</span><span className="provider-pill"><span className="live-dot"/>{data.provider.configured && data.provider.consent ? data.provider.model : 'Local retrieval'}</span><Button variant="ghost" onClick={newChat}><Plus size={15}/> New chat</Button></div><div className="chat-scroll">{!messages.length && !busy ? <div className="chat-welcome"><div className="chat-orb"><BrainCircuit size={30}/></div><div className="eyebrow">THE THINGS YOU SAVED, READY TO HELP</div><h1>You don’t need to remember<br />where you put it.</h1><p>Ask a question in your own words. We’ll look through your saved information and show you where the answer came from.</p><div className="chat-prompts">{[{ icon: GitFork, q: 'What repository did I save for my chatbot?' }, { icon: Clock, q: 'Show unfinished things I wanted to learn' }, { icon: FileText, q: 'Find notes related to my current project' }, { icon: Search, q: 'What business ideas have I saved?' }].map(p => <button key={p.q} onClick={() => void send(p.q)}><p.icon size={18}/><span>{p.q}</span><ArrowUpRight size={14}/></button>)}</div>{!data.items.length ? <p className="chat-empty-hint">Your memory is empty. Capture something first, then ask about it.</p> : null}</div> : <div className="messages">{messages.map(m => <article className={`message ${m.role}`} key={m.id}><div className="message-avatar">{m.role === 'user' ? data.preferences.displayName.slice(0, 1) : <BrainCircuit size={18}/>}</div><div className="message-body"><div className="message-byline"><strong>{m.role === 'user' ? 'You' : data.preferences.appName}</strong><small>{humanDate(m.createdAt, { hour: 'numeric', minute: '2-digit' })}</small>{m.role === 'assistant' ? <Tag>{m.mode === 'ai' ? 'AI answer' : m.mode === 'provider-fallback' ? 'Saved excerpts · provider unavailable' : 'Saved excerpts'}</Tag> : null}</div><div className="message-text">{m.content}</div>{m.citations.length ? <div className="source-cards"><div className="sources-heading"><ShieldCheck size={13}/>{m.citations.length} saved {m.citations.length === 1 ? 'source' : 'sources'}</div>{m.citations.map((c, i) => { const item = data.items.find(x => x.id === c.itemId); return <button className="source-card" key={c.itemId} onClick={() => openItem(c.itemId)}><span className="source-number">{i + 1}</span>{item ? <TypeIcon type={item.type} size={15}/> : null}<span><strong>{c.title}</strong><small>Saved {humanDate(c.createdAt)} · {c.methods.join(' + ')}</small><p>{c.excerpt.slice(0, 180)}</p></span><ArrowUpRight size={14}/></button>; })}</div> : null}{m.role === 'assistant' ? <div className="message-actions"><button aria-label="Copy answer" onClick={async () => {
                        try {
                            await navigator.clipboard.writeText(m.content);
                            notify('Answer copied.');
                        }
                        catch {
                            notify('Clipboard unavailable. Select the answer text to copy it.');
                        }
                    }}><Copy size={14}/></button><button className={m.feedback === 1 ? 'active' : ''} aria-label="Helpful answer" onClick={async () => { await api(`feedback/${m.id}`, 'PATCH', { value: 1 }); setMessages(prev => prev.map(x => x.id === m.id ? { ...x, feedback: 1 } : x)); }}><ThumbsUp size={14}/></button><button className={m.feedback === -1 ? 'active' : ''} aria-label="Unhelpful answer" onClick={async () => { await api(`feedback/${m.id}`, 'PATCH', { value: -1 }); setMessages(prev => prev.map(x => x.id === m.id ? { ...x, feedback: -1 } : x)); }}><ThumbsDown size={14}/></button></div> : null}</div></article>)}</div>}{busy ? <div className="thinking"><BrainCircuit size={18}/><span>Looking through your memory</span><span className="loading-dots"><i /><i /><i /></span></div> : null}<ErrorNotice message={error}/>{error && lastQuestion ? <Button onClick={() => void send(lastQuestion)}><RefreshCw size={14}/> Retry question</Button> : null}<div ref={bottom}/></div><div className="chat-composer"><div className="chat-scope"><span>Search in</span><select aria-label="Search scope" value={scope} onChange={e => { setScope(e.target.value); setScopeId(''); }}><option value="all">All saved items</option><option value="project">A project</option><option value="item">One saved item</option></select>{scope !== 'all' ? <select aria-label={scope === 'project' ? 'Choose project' : 'Choose saved item'} value={scopeId} onChange={e => setScopeId(e.target.value)}><option value="">Choose {scope}…</option>{(scope === 'project' ? data.projects.map(p => ({ id: p.id, title: p.name })) : data.items).map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</select> : null}</div><form onSubmit={e => { e.preventDefault(); void send(question); }}><textarea aria-label="Your question" placeholder="Ask about something you saved…" value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(question);
            }
        }} rows={2} maxLength={4000}/><button aria-label="Send question" disabled={busy || !question.trim() || (scope !== 'all' && !scopeId)}><ArrowUp size={19}/></button></form><p><ShieldCheck size={11}/>{data.provider.configured && data.provider.consent ? 'Only selected non-private snippets are shared with your configured provider.' : 'Local excerpts work without an AI key. Enable a provider in Settings for generated answers.'}</p></div></section></div>;
}
