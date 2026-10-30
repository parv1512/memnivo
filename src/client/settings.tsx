import { useEffect, useState } from 'react';
import { Settings, UserRound, Palette, BrainCircuit, Bell, ShieldCheck, Database, Download, Trash2, Keyboard, RefreshCw, Check, Copy, FolderOpen, ExternalLink, Info, PlugZap, LockKeyhole, ArrowUpRight, Save, Sun, Moon } from 'lucide-react';
import { useWorkspace } from './context';
import { Button, Field, SectionHead, Status, ErrorNotice, Empty, Tag } from './ui';
import { api, errorMessage, humanDate } from './api';
import type { Preferences } from '../lib/types';
const SECTIONS = [{ id: 'general', label: 'General', icon: UserRound }, { id: 'appearance', label: 'Appearance', icon: Palette }, { id: 'ai', label: 'AI providers', icon: BrainCircuit }, { id: 'memory', label: 'Memory & retrieval', icon: Database }, { id: 'notifications', label: 'Notifications', icon: Bell }, { id: 'privacy', label: 'Privacy & data', icon: ShieldCheck }, { id: 'shortcuts', label: 'Keyboard shortcuts', icon: Keyboard }];
export function SettingsView() {
    const { data, refresh, notify, navigate, confirm } = useWorkspace();
    const [section, setSection] = useState('general'), [draft, setDraft] = useState<Preferences>(data.preferences), [error, setError] = useState(''), [busy, setBusy] = useState(false), [providerBusy, setProviderBusy] = useState(false);
    useEffect(() => setDraft(data.preferences), [data.preferences]);
    async function save() {
        setBusy(true);
        setError('');
        try {
            await api('preferences', 'PUT', draft);
            await refresh();
            notify('Preferences saved.');
        }
        catch (e) {
            setError(errorMessage(e));
        }
        finally {
            setBusy(false);
        }
    }
    const toggle = (key: 'aiConsent' | 'aiSuggestions' | 'desktopNotifications' | 'dailyReview', label: string, description: string) => <label className="setting-toggle"><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" role="switch" checked={draft[key]} onChange={async (e) => {
            const value = e.target.checked;
            if (key === 'desktopNotifications' && value) {
                if (!('Notification' in window)) {
                    setError('This browser does not support desktop notifications. In-app reminders still work.');
                    return;
                }
                const result = await Notification.requestPermission();
                if (result !== 'granted') {
                    setError('Desktop notification permission was denied. Enable it in browser settings, or keep using in-app notifications.');
                    return;
                }
            }
            setDraft({ ...draft, [key]: value });
        }}/></label>;
    return <><div className="page-heading"><div><div className="eyebrow">A WORKSPACE THAT WORKS YOUR WAY</div><h1>Make it yours<span className="accent">.</span></h1><p>Your memory, your preferences, your control.</p></div><Button variant="primary" busy={busy} onClick={() => void save()}><Save size={16}/> Save preferences</Button></div><div className="settings-layout"><nav className="settings-nav">{SECTIONS.map(s => <button key={s.id} className={section === s.id ? 'active' : ''} onClick={() => { setSection(s.id); setError(''); }}><s.icon size={16}/>{s.label}</button>)}<button onClick={() => navigate('/vault')}><Database size={16}/> Obsidian vault <ArrowUpRight size={13}/></button></nav><div className="settings-content"><ErrorNotice message={error}/>{section === 'general' ? <><h2>Your workspace</h2><p className="muted">A few details to make this feel like home.</p><Field label="Display name"><input maxLength={80} value={draft.displayName} onChange={e => setDraft({ ...draft, displayName: e.target.value })}/></Field><Field label="Product name" hint="Branding is configurable. This does not imply name or domain availability."><input maxLength={50} value={draft.appName} onChange={e => setDraft({ ...draft, appName: e.target.value })}/></Field><Field label="Time zone" hint="Use an IANA name, such as America/New_York or Asia/Kolkata."><input value={draft.timezone} onChange={e => setDraft({ ...draft, timezone: e.target.value })} list="timezones"/><datalist id="timezones">{Intl.supportedValuesOf('timeZone').map(t => <option key={t} value={t}/>)}</datalist></Field><div className="setting-info"><LockKeyhole size={18}/><div><strong>Local-first mode</strong><p>A single-owner workspace served only on this computer. Cloud accounts and multi-device sync are not enabled.</p></div></div></> : null}{section === 'appearance' ? <><h2>A calmer workspace</h2><p className="muted">Choose the light that works for you.</p><div className="theme-options">{(['dark', 'light', 'system'] as const).map(t => <button className={draft.theme === t ? 'selected' : ''} key={t} onClick={() => setDraft({ ...draft, theme: t })}><span className={`theme-preview ${t}`}><i /><i /><i /></span><span>{t === 'dark' ? <Moon size={15}/> : t === 'light' ? <Sun size={15}/> : <Palette size={15}/>} {t.charAt(0).toUpperCase() + t.slice(1)}{draft.theme === t ? <Check size={14}/> : null}</span></button>)}</div><p className="muted small">Save preferences to apply. System mode uses your operating system preference.</p></> : null}{section === 'ai' ? <><h2>Your AI, your choice</h2><p className="muted">Local search always works. Connect an OpenAI-compatible service or local Ollama model for generated answers and optional semantic retrieval.</p><div className="provider-status"><BrainCircuit size={22}/><div><strong>{data.provider.provider === 'none' ? 'No provider configured' : data.provider.provider}</strong><small>{data.provider.configured ? `Model: ${data.provider.model}` : 'Configure the server environment, then restart Memnivo.'}</small></div><Status status={data.provider.configured ? 'connected' : 'offline'}/></div>{toggle('aiConsent', 'Allow selected content to reach my AI provider', 'Required for generated answers, enrichment suggestions, and embeddings. Private items remain excluded.')}{toggle('aiSuggestions', 'Suggest optional next steps', 'Show intention prompts after capture. Scheduling always needs your choice.')}<h3>Server configuration</h3><p>Put these values in <code>.env.local</code>. API keys stay on the server and are never returned to this screen.</p><pre className="setup-code">{'AI_PROVIDER=openai-compatible\nAI_BASE_URL=https://api.openai.com/v1\nAI_MODEL=your-chat-model\nAI_EMBEDDING_MODEL=your-embedding-model\nAI_API_KEY=your-key'}</pre><p className="muted small">For local Ollama, use <code>AI_PROVIDER=ollama</code> and <code>AI_BASE_URL=http://127.0.0.1:11434/v1</code>. Choose models you have installed; an API key is optional.</p><Button busy={providerBusy} onClick={async () => {
                setProviderBusy(true);
                try {
                    const result = await api<{
                        message: string;
                    }>('provider-test', 'POST');
                    notify(result.message);
                }
                catch (e) {
                    setError(errorMessage(e));
                }
                finally {
                    setProviderBusy(false);
                }
            }}><PlugZap size={15}/> Test saved configuration</Button><div className="info-banner">Save consent above before testing. Only a short connection test prompt is sent; it contains no saved information.</div></> : null}{section === 'memory' ? <><h2>Find the useful connections</h2><p>Retrieval combines full-text matching, titles, tags, saved context, explicit relationships, and optional provider embeddings. Each answer shows its actual saved sources.</p><div className="memory-settings-stats"><div><strong>{data.items.length}</strong><span>saved items</span></div><div><strong>{data.relationships.length}</strong><span>connections</span></div><div><strong>{data.provider.embeddingModel || 'Off'}</strong><span>embedding model</span></div></div><h3>Incremental indexing</h3><p className="muted">Unchanged chunks retain their embeddings. Re-indexing queues missing vectors and rebuilds the local chunk index. Sensitive items stay local and have no provider embeddings.</p><Button onClick={async () => {
                try {
                    await api('reindex', 'POST');
                    notify('Re-indexing queued. Start the companion to process embeddings.');
                }
                catch (e) {
                    setError(errorMessage(e));
                }
            }}><RefreshCw size={15}/> Re-index saved content</Button><div className="info-banner">This MVP searches up to 1,000 saved items and 10,000 indexed chunks at a time. The graph displays up to 120 nodes.</div></> : null}{section === 'notifications' ? <><h2>Useful nudges. Enough quiet.</h2><p className="muted">Reminders are opt-in. Nothing is scheduled from an inferred intention.</p><div className="form-grid"><Field label="Maximum reminders per day"><input type="number" min={0} max={30} value={draft.maxReminders} onChange={e => setDraft({ ...draft, maxReminders: Number(e.target.value) })}/></Field><Field label="Default snooze (minutes)"><input type="number" min={5} max={10080} value={draft.snoozeMinutes} onChange={e => setDraft({ ...draft, snoozeMinutes: Number(e.target.value) })}/></Field><Field label="Quiet hours start"><input type="time" value={draft.quietStart} onChange={e => setDraft({ ...draft, quietStart: e.target.value })}/></Field><Field label="Quiet hours end"><input type="time" value={draft.quietEnd} onChange={e => setDraft({ ...draft, quietEnd: e.target.value })}/></Field></div><p className="muted small">Quiet hours use {draft.timezone}. Set the same start and end to disable them. Set the daily limit to 0 to pause delivery.</p>{toggle('desktopNotifications', 'Desktop notifications while the app is open', 'Requires browser permission. Closed-browser delivery is recorded persistently in the in-app inbox.')}{toggle('dailyReview', 'Show due items in my daily briefing', 'A concise attention section on Home. This does not schedule additional notifications.')}<div className="setting-info"><Bell size={19}/><div><strong>How background delivery works</strong><p>The companion checks persisted schedules every five seconds. It runs independently of the browser. This computer and the companion must stay on; overdue jobs are processed when it restarts, within your daily limit.</p></div></div></> : null}{section === 'privacy' ? <><h2>Your information belongs to you</h2><p>Notes, source text, conversations, and schedules are kept in the local SQLite database. The app has one local owner and does not create a cloud account.</p><div className="privacy-list"><div><LockKeyhole size={17}/><span><strong>Private items stay out of AI requests</strong><p>External metadata fetching and embedding jobs are disabled for items marked private.</p></span></div><div><BrainCircuit size={17}/><span><strong>Provider use needs your consent</strong><p>When enabled, selected non-private source snippets, the current question, and requested enrichment text are sent to your configured provider. Embeddings also send non-private chunks. An entire vault is never sent in one request.</p></span></div><div><Database size={17}/><span><strong>Vault access is read-only</strong><p>Only explicitly included Markdown files are indexed. No source note is silently overwritten. Excluded source folders are not read; previously imported copies remain until you delete them.</p></span></div></div><h3>Take your information with you</h3><p className="muted">Export saved items, tags, projects, tasks, reminders, relationships, and conversations as JSON. Markdown and plain text remain intact. Provider keys and local vault root paths are excluded.</p><Button onClick={async () => {
                try {
                    const result = await api('export');
                    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
                    a.href = url;
                    a.download = `memnivo-export-${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                    notify('Export downloaded.');
                }
                catch (e) {
                    setError(errorMessage(e));
                }
            }}><Download size={15}/> Export my data</Button><h3 className="danger-heading">Delete the workspace</h3><p className="muted">Permanently delete all saved items, conversations, tasks, reminders, and vault connection records. Obsidian source files and your server environment file are untouched.</p><Button variant="danger" onClick={() => confirm('Permanently delete all workspace data?', 'This cannot be undone. Export your information first if you may need it again.', async () => { await api('data', 'DELETE', { confirmation: 'DELETE ALL MY DATA' }); await refresh(); notify('Workspace data deleted.'); })}><Trash2 size={15}/> Delete all my data</Button></> : null}{section === 'shortcuts' ? <><h2>Keep your hands on the keyboard</h2><div className="shortcut-list"><div><span>Search your memory</span><span><kbd>Ctrl</kbd> + <kbd>K</kbd></span></div><div><span>Quick capture, from any screen</span><span><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>N</kbd></span></div><div><span>Send a chat question</span><kbd>Enter</kbd></div><div><span>New line in chat</span><span><kbd>Shift</kbd> + <kbd>Enter</kbd></span></div><div><span>Close a dialog</span><kbd>Esc</kbd></div><div><span>Focus graph neighbors</span><span>Tab to a node, then <kbd>F</kbd></span></div></div><p className="muted">On macOS, use Command instead of Ctrl. Dialogs keep keyboard focus inside until you close them.</p></> : null}</div></div></>;
}
export function VaultView() {
    const { data, refresh, notify, confirm } = useWorkspace();
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [includes, setIncludes] = useState(data.vault?.includes.join(', ') || ''), [excludes, setExcludes] = useState(data.vault?.excludes.join(', ') || 'Private');
    useEffect(() => { setIncludes(data.vault?.includes.join(', ') || ''); setExcludes(data.vault?.excludes.join(', ') || 'Private'); }, [data.vault?.includes.join(','), data.vault?.excludes.join(',')]);
    const command = 'npm run vault -- connect "C:\\path\\to\\your-vault" --include Notes,Projects --exclude Private';
    async function sync() {
        setBusy(true);
        setError('');
        try {
            const result = await api<{
                imported: number;
                changed: number;
                renamed: number;
                deleted: number;
                conflicts: number;
            }>('vault', 'POST');
            await refresh();
            notify(`${result.imported} imported · ${result.changed} updated · ${result.renamed} renamed · ${result.conflicts} conflicts`);
        }
        catch (e) {
            setError(errorMessage(e));
            await refresh();
        }
        finally {
            setBusy(false);
        }
    }
    return <><div className="page-heading"><div><div className="eyebrow">YOUR NOTES, PART OF THE BIGGER PICTURE</div><h1>Alongside Obsidian<span className="accent">.</span></h1><p>Keep writing where you love. Bring your knowledge along.</p></div>{data.vault ? <Button variant="primary" busy={busy} onClick={() => void sync()}><RefreshCw size={16}/> Sync now</Button> : null}</div><ErrorNotice message={error}/><div className="vault-hero"><span className="vault-logo"><Database size={34}/></span><div><div className="eyebrow">READ-ONLY LOCAL COMPANION</div><h2>{data.vault ? data.vault.name : 'Your vault. Your files. Your control.'}</h2><p>{data.vault ? 'Your selected Markdown notes are connected to your memory.' : 'A genuine connection to a folder you explicitly choose. Your notes stay exactly where they are.'}</p></div>{data.vault ? <Status status={data.vault.status}/> : <Tag>Optional integration</Tag>}</div>{data.vault ? <><div className="vault-metrics"><div><strong>{data.vault.noteCount}</strong><span>notes indexed</span></div><div><strong>{data.vault.lastSync ? humanDate(data.vault.lastSync, { hour: 'numeric', minute: '2-digit' }) : 'Not yet'}</strong><span>last successful sync</span></div><div><strong>{data.vault.pending}</strong><span>conflicts to review</span></div><div><strong>Read only</strong><span>sync direction</span></div></div>{data.vault.error ? <ErrorNotice message={data.vault.error}/> : null}<div className="vault-columns"><section className="surface padded"><h2>Choose what becomes memory</h2><p className="muted">Folder names are relative to the vault. Leave inclusion empty to include all Markdown notes except excluded folders. Hidden folders, symlinks, and notes over 1 MB are skipped.</p><Field label="Included folders" hint="Comma-separated, for example Notes, Projects"><input value={includes} onChange={e => setIncludes(e.target.value)}/></Field><Field label="Excluded folders" hint="Private folders take precedence over inclusion rules."><input value={excludes} onChange={e => setExcludes(e.target.value)}/></Field><Button onClick={async () => {
                try {
                    await api('vault', 'PATCH', { includes: includes.split(',').map(v => v.trim()).filter(Boolean), excludes: excludes.split(',').map(v => v.trim()).filter(Boolean) });
                    await refresh();
                    notify('Folder rules saved. Run a sync to apply them. Previously indexed copies remain until deleted.');
                }
                catch (e) {
                    setError(errorMessage(e));
                }
            }}><Check size={15}/> Save folder rules</Button></section><section className="surface padded"><h2>Safe by design</h2><div className="vault-safety"><ShieldCheck size={19}/><p>Original Markdown, frontmatter, wikilinks, and attachments references stay intact. The companion never writes back to source files.</p></div><div className="vault-safety"><RefreshCw size={19}/><p>New and changed notes sync incrementally. Renames are matched by stable frontmatter IDs or unchanged content hashes. Ambiguous changes are flagged.</p></div><div className="vault-safety"><Info size={19}/><p>If both copies change, both are preserved. Resolve the conflict from the imported item. Deleted source notes are archived.</p></div><Button variant="danger" onClick={() => confirm('Disconnect this vault?', 'The original files and imported copies stay intact. The companion will stop indexing this vault.', async () => { await api('vault', 'DELETE'); await refresh(); notify('Vault disconnected.'); })}>Disconnect vault</Button></section></div><SectionHead title="Synchronization activity"/><div className="surface sync-log">{data.vaultLogs.length ? data.vaultLogs.map(l => <div key={l.id}><Status status={l.kind}/><p>{l.message}</p><time>{humanDate(l.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</time></div>) : <p>No synchronization activity yet.</p>}</div></> : <><div className="connection-steps"><section><span>01</span><div><h3>Choose the vault on your computer</h3><p>A browser cannot freely access a vault. This app ships a local companion, and folder access is granted from your terminal.</p></div></section><section><span>02</span><div><h3>Connect only what you want indexed</h3><p>Run the command below from the Memnivo project folder. Replace the example path with your actual Obsidian vault and choose your included and private folders.</p><pre className="setup-code">{command}</pre><Button onClick={async () => {
                try {
                    await navigator.clipboard.writeText(command);
                    notify('Example command copied. Replace the vault path before running.');
                }
                catch {
                    notify('Select the command text and copy it manually.');
                }
            }}><Copy size={14}/> Copy command</Button></div></section><section><span>03</span><div><h3>See your notes connect</h3><p>The initial sync imports selected Markdown. Keep Memnivo running for incremental sync every minute. Return here to see status and resolve conflicts.</p><Button onClick={async () => { await refresh(); notify('Connection status refreshed.'); }}><RefreshCw size={14}/> Check connection</Button></div></section></div><div className="info-banner"><ShieldCheck size={18}/><span>No community plugin is required: the permissioned companion reads the selected local folder. No cloud upload or write-back is enabled by connecting a vault. AI provider consent is controlled separately.</span></div></>}</>;
}
