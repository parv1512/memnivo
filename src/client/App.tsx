import { useEffect, useRef, useState } from 'react';
import { Home, BrainCircuit, Inbox, Library, FolderKanban, CheckSquare2, Network, Database, Settings, Search, Plus, Bell, PanelLeftClose, PanelLeftOpen, ChevronRight, ArrowUpRight, LockKeyhole, X, Check, RefreshCw, Menu, Command, Sun, Moon } from 'lucide-react';
import type { Item, Snapshot } from '../lib/types';
import { api, getSnapshot, errorMessage, humanDate, localInput, isoInput } from './api';
import { WorkspaceContext } from './context';
import { Button, Modal, Field, ErrorNotice } from './ui';
import { Capture } from './capture';
import { ItemDetail } from './detail';
import { HomeView, LibraryView } from './library';
import { ChatView } from './chat';
import { ProjectsView, TasksView } from './work';
import { GraphView } from './graph';
import { SettingsView, VaultView } from './settings';
const NAV = [{ path: '/', label: 'Home', icon: Home }, { path: '/ask', label: 'Ask AI', icon: BrainCircuit }, { path: '/inbox', label: 'Inbox', icon: Inbox }, { path: '/library', label: 'Library', icon: Library }, { path: '/projects', label: 'Projects', icon: FolderKanban }, { path: '/tasks', label: 'Tasks & reminders', icon: CheckSquare2 }, { path: '/graph', label: 'Knowledge graph', icon: Network }, { path: '/vault', label: 'Obsidian vault', icon: Database }];
type Confirm = {
    title: string;
    body: string;
    action: () => Promise<void>;
};
export function App() {
    const [data, setData] = useState<Snapshot | null>(null), [path, setPath] = useState(location.pathname + location.search), [loadingError, setLoadingError] = useState(''), [capture, setCapture] = useState(false), [itemId, setItemId] = useState<string | null>(null), [toast, setToast] = useState(''), [collapsed, setCollapsed] = useState(false), [mobile, setMobile] = useState(false), [notifications, setNotifications] = useState(false), [confirmation, setConfirmation] = useState<Confirm | null>(null), [confirmBusy, setConfirmBusy] = useState(false), [reminderFor, setReminderFor] = useState<Item | null | undefined>(undefined), [reminderTitle, setReminderTitle] = useState(''), [reminderDue, setReminderDue] = useState(localInput()), [reminderRecurrence, setReminderRecurrence] = useState('none'), [reminderError, setReminderError] = useState(''), [reminderBusy, setReminderBusy] = useState(false), [onboardName, setOnboardName] = useState(''), [onboardStep, setOnboardStep] = useState(0);
    const searchRef = useRef<HTMLInputElement>(null), toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null), shownNotifications = useRef(new Set<string>());
    async function refresh() { const next = await getSnapshot(); setData(next); setLoadingError(''); }
    function notify(message: string) {
        setToast(message);
        if (toastTimer.current)
            clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(''), 6000);
    }
    function navigate(target: string) { history.pushState({}, '', target); setPath(target); setMobile(false); window.scrollTo({ top: 0 }); }
    function ask(question: string, scope?: string) { navigate(`/ask?q=${encodeURIComponent(question)}${scope ? `&item=${scope}` : ''}`); }
    function openItem(value: Item | string) { setItemId(typeof value === 'string' ? value : value.id); }
    function newReminder(item?: Item) { setReminderFor(item || null); setReminderTitle(item ? `Revisit: ${item.title}` : ''); setReminderDue(localInput()); setReminderRecurrence('none'); setReminderError(''); }
    useEffect(() => { void refresh().catch(e => setLoadingError(errorMessage(e))); const timer = setInterval(() => void refresh().catch(() => setLoadingError('The local service is offline. Restart it to reconnect.')), 30000); const pop = () => setPath(location.pathname + location.search); window.addEventListener('popstate', pop); return () => { clearInterval(timer); window.removeEventListener('popstate', pop); }; }, []);
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                searchRef.current?.focus();
            }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
                e.preventDefault();
                setCapture(true);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);
    useEffect(() => {
        if (!data)
            return;
        const theme = data.preferences.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : data.preferences.theme;
        document.documentElement.dataset.theme = theme;
        document.title = `${data.preferences.appName} · Your memory, in motion`;
    }, [data]);
    useEffect(() => {
        if (!data)
            return;
        for (const n of data.notifications) {
            if (!shownNotifications.current.has(n.id) && !n.readAt && Date.now() - Date.parse(n.createdAt) < 90000 && data.preferences.desktopNotifications && 'Notification' in window && Notification.permission === 'granted') {
                const notice = new Notification(n.title, { body: n.body, tag: n.id });
                notice.onclick = () => { window.focus(); navigate('/tasks'); };
            }
            shownNotifications.current.add(n.id);
        }
    }, [data]);
    if (!data)
        return <div className="boot"><div className="brand-mark"><span /></div><h1>Opening your workspace</h1><p>{loadingError || 'Connecting to your local memory…'}</p>{loadingError ? <Button onClick={() => void refresh().catch(e => setLoadingError(errorMessage(e)))}><RefreshCw size={16}/> Retry connection</Button> : <div className="loading-dots"><i /><i /><i /></div>}</div>;
    const route = path.split('?')[0], nav = NAV.find(n => n.path === route), unread = data.notifications.filter(n => !n.readAt).length;
    async function finishOnboard() {
        try {
            await api('preferences', 'PUT', { ...data!.preferences, displayName: onboardName.trim() || 'You', onboarded: true, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
            await refresh();
            notify('Your workspace is ready. Start with one thing worth remembering.');
        }
        catch (e) {
            notify(errorMessage(e));
        }
    }
    return <WorkspaceContext.Provider value={{ data, refresh, notify, openItem, navigate, capture: () => setCapture(true), ask, newReminder, confirm: (title, body, action) => setConfirmation({ title, body, action }) }}><div className={`app-shell ${collapsed ? 'is-collapsed' : ''}`}><aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}><button className="brand" onClick={() => navigate('/')} aria-label={`${data.preferences.appName} home`}><div className="brand-mark"><span /></div>{!collapsed ? <><strong>{data.preferences.appName}</strong><span className="beta-label">LOCAL</span></> : null}</button><button className="sidebar-capture" onClick={() => setCapture(true)}><Plus size={18}/>{!collapsed ? <><span>Quick capture</span><kbd>⇧ N</kbd></> : null}</button><div className="nav-caption">WORKSPACE</div><nav>{NAV.map(n => <button key={n.path} className={`nav-item ${route === n.path ? 'active' : ''}`} onClick={() => navigate(n.path)} title={n.label}><n.icon size={18}/>{!collapsed ? <><span>{n.label}</span>{n.path === '/inbox' && data.items.some(i => i.status === 'inbox') ? <small>{data.items.filter(i => i.status === 'inbox').length}</small> : null}</> : null}</button>)}</nav>{!collapsed ? <div className="sidebar-projects"><div className="nav-caption">YOUR PROJECTS<button className="icon-button" aria-label="Manage projects" onClick={() => navigate('/projects')}><Plus size={13}/></button></div>{data.projects.filter(p => p.status === 'active').slice(0, 4).map((p, i) => <button key={p.id} onClick={() => navigate(`/projects?project=${p.id}`)}><span className={`project-dot color-${i % 4}`}/>{p.name}</button>)}{!data.projects.length ? <p>Your next idea starts here.</p> : null}</div> : null}<div className="sidebar-bottom">{!collapsed ? <button className="vault-mini" onClick={() => navigate('/vault')}><Database size={17}/><span><strong>{data.vault ? data.vault.name : 'Connect your vault'}</strong><small>{data.vault ? 'Read-only · ' + data.vault.status : 'Bring your Obsidian notes along'}</small></span><ChevronRight size={14}/></button> : null}<button className={`nav-item ${route === '/settings' ? 'active' : ''}`} onClick={() => navigate('/settings')} title="Settings"><Settings size={18}/>{!collapsed ? <span>Settings</span> : null}</button><div className="sidebar-profile"><button onClick={() => navigate('/settings')} className="avatar" aria-label="Open your profile">{data.preferences.displayName === 'You' ? 'Y' : data.preferences.displayName.slice(0, 1).toUpperCase()}</button>{!collapsed ? <span><strong>{data.preferences.displayName === 'You' ? 'Your workspace' : data.preferences.displayName}</strong><small><LockKeyhole size={10}/> Private & local</small></span> : null}<button className="icon-button collapse-control" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}</button></div></div></aside>{mobile ? <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobile(false)}/> : null}<div className="main-shell"><header className="topbar"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobile(true)}><Menu size={20}/></button><span className="breadcrumb">Workspace <ChevronRight size={13}/> <strong>{nav?.label || 'Settings'}</strong></span><form className="global-search" onSubmit={e => { e.preventDefault(); navigate(`/library?q=${encodeURIComponent(searchRef.current?.value || '')}`); }}><Search size={15}/><input ref={searchRef} aria-label="Search your memory" placeholder="Search your memory…"/><kbd>Ctrl K</kbd></form><button className={`icon-button notification-trigger ${unread ? 'has-unread' : ''}`} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={() => setNotifications(true)}><Bell size={18}/></button><Button variant="primary" className="top-capture" onClick={() => setCapture(true)}><Plus size={17}/> Quick capture</Button></header>{loadingError ? <div className="connection-error" role="alert">{loadingError}<Button onClick={() => void refresh().catch(e => notify(errorMessage(e)))}>Reconnect</Button></div> : null}<main className={`page ${route === '/ask' ? 'chat-page' : ''}`} key={route}>{route === '/' ? <HomeView /> : route === '/ask' ? <ChatView queryString={path.split('?')[1] || ''}/> : route === '/inbox' || route === '/library' ? <LibraryView inbox={route === '/inbox'} queryString={path.split('?')[1] || ''}/> : route === '/projects' ? <ProjectsView queryString={path.split('?')[1] || ''}/> : route === '/tasks' ? <TasksView /> : route === '/graph' ? <GraphView /> : route === '/vault' ? <VaultView /> : route === '/settings' ? <SettingsView /> : <div className="empty"><h1>Page not found</h1><Button onClick={() => navigate('/')}>Back home</Button></div>}</main><footer className="app-footer"><span><span className={`live-dot ${data.worker.running ? '' : 'offline'}`}/>{data.worker.running ? 'Companion running' : 'Companion offline · reminders paused'}</span><span>Your memory, in motion.</span><button onClick={() => navigate('/settings')}><LockKeyhole size={12}/> Local-first workspace</button></footer></div></div>
 <Capture open={capture} onClose={() => setCapture(false)}/><ItemDetail id={itemId} onClose={() => setItemId(null)}/>
 <Modal open={reminderFor !== undefined} onOpenChange={v => !v && setReminderFor(undefined)} title="Create a follow-up" description="A little nudge, exactly when you choose."><form onSubmit={async (e) => {
            e.preventDefault();
            setReminderBusy(true);
            setReminderError('');
            try {
                await api('reminders', 'POST', { title: reminderTitle, itemId: reminderFor?.id || null, dueAt: isoInput(reminderDue), timezone: data.preferences.timezone, recurrence: reminderRecurrence });
                await refresh();
                setReminderFor(undefined);
                notify('Follow-up scheduled.');
            }
            catch (e) {
                setReminderError(errorMessage(e));
            }
            finally {
                setReminderBusy(false);
            }
        }}><Field label="What would you like to revisit?"><input autoFocus required maxLength={240} value={reminderTitle} onChange={e => setReminderTitle(e.target.value)}/></Field><Field label="Date & time" hint={`Displayed in your device's time zone. Saved as an absolute time with ${data.preferences.timezone} preferences.`}><input required type="datetime-local" value={reminderDue} onChange={e => setReminderDue(e.target.value)}/></Field><Field label="Repeat"><select value={reminderRecurrence} onChange={e => setReminderRecurrence(e.target.value)}><option value="none">Just once</option><option value="daily">Every day</option><option value="weekly">Every week</option></select></Field>{!data.worker.running ? <div className="info-banner">Start the companion worker to deliver reminders. They will remain saved while it is offline.</div> : null}<p className="muted small">In-app delivery. Desktop alerts appear while the app is open if enabled. Quiet hours and your daily limit apply.</p><ErrorNotice message={reminderError}/><div className="modal-footer"><Button type="button" onClick={() => setReminderFor(undefined)}>Cancel</Button><Button type="submit" variant="primary" busy={reminderBusy}><Bell size={16}/> Schedule follow-up</Button></div></form></Modal>
 <Modal open={!!confirmation} onOpenChange={v => !v && !confirmBusy && setConfirmation(null)} title={confirmation?.title || 'Confirm action'} description={confirmation?.body}><div className="modal-footer"><Button disabled={confirmBusy} onClick={() => setConfirmation(null)}>Cancel</Button><Button variant="danger" busy={confirmBusy} onClick={async () => {
            setConfirmBusy(true);
            try {
                await confirmation?.action();
                setConfirmation(null);
            }
            catch (e) {
                notify(errorMessage(e));
            }
            finally {
                setConfirmBusy(false);
            }
        }}>Confirm</Button></div></Modal>
 <Modal open={notifications} onOpenChange={setNotifications} title="Your follow-ups" description="Only the reminders you asked for."><div className="notifications-list">{data.notifications.length ? data.notifications.map(n => <div className={`notification ${n.readAt ? 'read' : ''}`} key={n.id}><Bell size={17}/><div><strong>{n.title}</strong><p>{n.body}</p><small>{humanDate(n.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</small><button className="text-button" onClick={async () => { await api(`notifications/${n.id}`, 'PATCH'); await refresh(); setNotifications(false); navigate('/tasks'); }}>View follow-up <ArrowUpRight size={13}/></button></div></div>) : <div className="empty compact"><Bell size={25}/><h3>A little quiet is good.</h3><p>Your scheduled follow-ups will appear here.</p></div>}</div>{unread ? <Button onClick={async () => { await api('notifications', 'PATCH'); await refresh(); }}>Mark all as read <Check size={14}/></Button> : null}</Modal>
 <Modal open={!data.preferences.onboarded} onOpenChange={() => { }} title={onboardStep === 0 ? 'A little less to keep in your head.' : 'Make this workspace yours.'} description={onboardStep === 0 ? 'Your second brain should help you follow through.' : 'A private home for the things you want to remember.'} wide>{onboardStep === 0 ? <><div className="onboard-visual"><div className="orbit-node"><Inbox size={21}/><span>Capture</span></div><span className="orbit-line"/><div className="brand-mark large"><span /></div><span className="orbit-line"/><div className="orbit-node"><BrainCircuit size={21}/><span>Recall & act</span></div></div><div className="onboard-features"><div><LockKeyhole size={18}/><strong>Local first</strong><p>Your information lives in a real database on this computer.</p></div><div><Database size={18}/><strong>Obsidian, alongside</strong><p>Connect a vault when you are ready. Source notes stay untouched.</p></div><div><BrainCircuit size={18}/><strong>Useful from day one</strong><p>Search without a key. Add a local or external AI provider later.</p></div></div><div className="modal-footer"><span className="fine-print">No account or cloud connection required</span><Button variant="primary" onClick={() => setOnboardStep(1)}>Set up my workspace <ChevronRight size={16}/></Button></div></> : <><Field label="What should we call you?"><input autoFocus value={onboardName} onChange={e => setOnboardName(e.target.value)} placeholder="Your first name" maxLength={80}/></Field><div className="info-banner"><LockKeyhole size={17}/><span>External AI is off by default. You choose which providers can receive selected saved content. Private items stay excluded.</span></div><p className="muted">Reminders arrive in the app. You can configure quiet hours, daily limits, desktop alerts, and a vault connection in Settings.</p><div className="modal-footer"><Button onClick={() => setOnboardStep(0)}>Back</Button><Button variant="primary" onClick={() => void finishOnboard()}>Open my workspace <ArrowUpRight size={16}/></Button></div></>}</Modal>
 {toast ? <div className="toast" role="status"><Check size={17}/><span>{toast}</span><button className="icon-button" onClick={() => setToast('')} aria-label="Dismiss message"><X size={15}/></button></div> : null}
 </WorkspaceContext.Provider>;
}
