import { useEffect, useRef, useState } from 'react';
import { Library, FolderKanban, Settings, Plus, Bell, ArrowUpRight, X, Check, RefreshCw } from 'lucide-react';
import type { Item, Snapshot } from '../lib/types';
import { api, getSnapshot, errorMessage, humanDate, localInput, isoInput } from './api';
import { WorkspaceContext } from './context';
import { Button, Modal, Field, ErrorNotice } from './ui';
import { Capture } from './capture';
import { ItemDetail } from './detail';
import { HomeView, LibraryView, SavedLinksView } from './library';
import { ChatView } from './chat';
import { ProjectsView, TasksView } from './work';
import { GraphView } from './graph';
import { SettingsView, VaultView } from './settings';
type Confirm = {
    title: string;
    body: string;
    action: () => Promise<void>;
};
export function App() {
    const [data, setData] = useState<Snapshot | null>(null);
    const [path, setPath] = useState(location.pathname + location.search);
    const [loadingError, setLoadingError] = useState('');
    const [captureMode, setCaptureMode] = useState<'link' | 'full' | null>(null);
    const [itemId, setItemId] = useState<string | null>(null);
    const [toast, setToast] = useState('');
    const [notifications, setNotifications] = useState(false);
    const [confirmation, setConfirmation] = useState<Confirm | null>(null);
    const [confirmBusy, setConfirmBusy] = useState(false);
    const [reminderFor, setReminderFor] = useState<Item | null | undefined>(undefined);
    const [reminderTitle, setReminderTitle] = useState(''), [reminderDue, setReminderDue] = useState(localInput()), [reminderRecurrence, setReminderRecurrence] = useState('none');
    const [reminderError, setReminderError] = useState(''), [reminderBusy, setReminderBusy] = useState(false);
    const [onboardName, setOnboardName] = useState('');
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null), shownNotifications = useRef(new Set<string>());
    async function refresh() { const next = await getSnapshot(); setData(next); setLoadingError(''); }
    function notify(message: string) {
        setToast(message);
        if (toastTimer.current)
            clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(''), 6000);
    }
    function navigate(target: string) { history.pushState({}, '', target); setPath(target); window.scrollTo({ top: 0 }); }
    function ask(question: string, scope?: string) { navigate(`/ask?q=${encodeURIComponent(question)}${scope ? `&item=${scope}` : ''}`); }
    function openItem(value: Item | string) { setItemId(typeof value === 'string' ? value : value.id); }
    function newReminder(item?: Item) { setReminderFor(item || null); setReminderTitle(item ? `Revisit: ${item.title}` : ''); setReminderDue(localInput()); setReminderRecurrence('none'); setReminderError(''); }
    useEffect(() => { void refresh().catch(e => setLoadingError(errorMessage(e))); const timer = setInterval(() => void refresh().catch(() => setLoadingError('The local service is offline. Restart it to reconnect.')), 30000); const pop = () => setPath(location.pathname + location.search); window.addEventListener('popstate', pop); return () => { clearInterval(timer); window.removeEventListener('popstate', pop); }; }, []);
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                const input = document.getElementById('saved-links-search');
                if (input)
                    input.focus();
                else
                    navigate('/saved?focus=search');
            }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
                e.preventDefault();
                setCaptureMode('link');
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
    const [route, queryString = ''] = path.split('?');
    const isProjects = route === '/' || route === '/projects';
    const isSavedLinks = route === '/saved';
    const focused = isProjects || isSavedLinks;
    const unread = data.notifications.filter(n => !n.readAt).length;
    async function finishOnboard() {
        try {
            await api('preferences', 'PUT', { ...data!.preferences, displayName: onboardName.trim() || 'You', onboarded: true, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
            await refresh();
            notify('Your workspace is ready.');
        }
        catch (e) {
            notify(errorMessage(e));
        }
    }
    let page;
    switch (route) {
        case "/":
        case "/projects": page = <ProjectsView queryString={queryString}/>; break;
        case "/saved": page = <SavedLinksView queryString={queryString}/>; break;
        case "/home": page = <HomeView/>; break;
        case "/ask": page = <ChatView queryString={queryString}/>; break;
        case "/inbox":
        case "/library": page = <LibraryView inbox={route === "/inbox"} queryString={queryString}/>; break;
        case "/tasks": page = <TasksView/>; break;
        case "/graph": page = <GraphView/>; break;
        case "/vault": page = <VaultView/>; break;
        case "/settings": page = <SettingsView/>; break;
        default: page = <div className="empty"><h1>Page not found</h1><Button onClick={() => navigate("/")}>Back to projects</Button></div>;
    }
    return <WorkspaceContext.Provider value={{
        data, refresh, notify, openItem, navigate,
        capture: () => setCaptureMode(focused ? "link" : "full"), ask, newReminder,
        confirm: (title, body, action) => setConfirmation({ title, body, action }),
    }}>
        <div className="main-shell">
            <header className="workspace-header">
                <div className="workspace-header-inner">
                    <button className="workspace-brand" onClick={() => navigate("/")} aria-label={data.preferences.appName + " home"}>
                        <div className="brand-mark"><span/></div><strong>{data.preferences.appName}</strong>
                    </button>
                    <nav aria-label="Workspace" className="workspace-navigation">
                        <button aria-current={isProjects ? "page" : undefined} onClick={() => navigate("/")}><FolderKanban size={16}/> Projects</button>
                        <button aria-current={isSavedLinks ? "page" : undefined} onClick={() => navigate("/saved")}><Library size={16}/> Saved links</button>
                    </nav>
                    <div className="workspace-actions">
                        {route === "/tasks" ? <button className="icon-button" title="Notifications" aria-label={unread ? "Notifications, " + unread + " unread" : "Notifications"} onClick={() => setNotifications(true)}><Bell size={17}/></button> : null}
                        <Button variant="primary" onClick={() => setCaptureMode("link")}><Plus size={17}/> Quick save</Button>
                        <button className="icon-button" title="Settings" aria-label="Settings" onClick={() => navigate("/settings")}><Settings size={17}/></button>
                    </div>
                </div>
            </header>
            {loadingError ? <div className="connection-error" role="alert">{loadingError}<Button onClick={() => void refresh().catch(e => notify(errorMessage(e)))}>Reconnect</Button></div> : null}
            <main className={route === "/ask" ? "page chat-page" : "page"} key={route}>{page}</main>
            {!focused ? <footer className="app-footer"><span><span className={data.worker.running ? "live-dot" : "live-dot offline"}/>{data.worker.running ? "Companion running" : "Companion offline"}</span></footer> : null}
        </div>
        <Capture key={captureMode} open={!!captureMode} linkOnly={captureMode === "link"} onClose={() => setCaptureMode(null)}/>
        <ItemDetail key={itemId} id={itemId} compact={focused} onClose={() => setItemId(null)}/>
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
        <Modal open={!data.preferences.onboarded} onOpenChange={() => {}} title={"Welcome to " + data.preferences.appName} description="Create a project and save links you might use for it.">
            <form onSubmit={event => { event.preventDefault(); void finishOnboard(); }}>
                <Field label="Your name (optional)"><input autoFocus value={onboardName} onChange={event => setOnboardName(event.target.value)} maxLength={80}/></Field>
                <div className="modal-footer"><Button type="submit" variant="primary">Open my workspace</Button></div>
            </form>
        </Modal>
 {toast ? <div className="toast" role="status"><Check size={17}/><span>{toast}</span><button className="icon-button" onClick={() => setToast('')} aria-label="Dismiss message"><X size={15}/></button></div> : null}
 </WorkspaceContext.Provider>;
}
