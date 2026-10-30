import { useState } from 'react';
import { Plus, FolderKanban, ArrowUpRight, Target, Check, MoreHorizontal, Trash2, Pencil, Clock, Bell, CalendarDays, List, ChevronLeft, ChevronRight, Link2, ArrowRight, CheckCheck, Pause } from 'lucide-react';
import { useWorkspace } from './context';
import { Button, Modal, Field, Empty, ItemRow, SectionHead, Status, ErrorNotice } from './ui';
import { api, errorMessage, localInput, isoInput, humanDate } from './api';
import { dayInZone } from '../lib/core';
import type { Project, Task, Reminder } from '../lib/types';
export function ProjectsView({ queryString }: {
    queryString: string;
}) {
    const { data, refresh, notify, navigate, openItem, capture, confirm } = useWorkspace();
    const selected = new URLSearchParams(queryString).get('project'), project = data.projects.find(p => p.id === selected);
    const [editing, setEditing] = useState<Partial<Project> | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [attach, setAttach] = useState(''), [taskTitle, setTaskTitle] = useState('');
    async function save(e: React.FormEvent) {
        e.preventDefault();
        if (!editing)
            return;
        setBusy(true);
        setError('');
        try {
            const result = await api<Project>(`projects${editing.id ? `/${editing.id}` : ''}`, editing.id ? 'PATCH' : 'POST', { name: editing.name, description: editing.description || '', goal: editing.goal || '', status: editing.status || 'active' });
            await refresh();
            setEditing(null);
            notify('Project saved.');
            navigate(`/projects?project=${result.id}`);
        }
        catch (e) {
            setError(errorMessage(e));
        }
        finally {
            setBusy(false);
        }
    }
    return <><div className="page-heading"><div><div className="eyebrow">TURN SAVED INSPIRATION INTO SOMETHING REAL</div><h1>{project ? project.name : 'Ideas in motion'}{!project ? <span className="count-pill">{data.projects.length}</span> : null}</h1><p>{project ? project.description : 'A little structure for the things you want to make happen.'}</p></div><div className="inline-actions">{project ? <><Button onClick={() => navigate('/projects')}>All projects</Button><Button onClick={() => setEditing({ ...project })}><Pencil size={15}/> Edit project</Button></> : <Button variant="primary" onClick={() => setEditing({ name: '', description: '', goal: '', status: 'active' })}><Plus size={16}/> New project</Button>}</div></div>{project ? <><div className="project-detail-summary"><div><Target size={20}/><span><small>WHAT YOU’RE WORKING TOWARD</small><strong>{project.goal || 'Add a goal to give this project a direction.'}</strong></span></div><Status status={project.status}/></div><div className="project-stats"><span><strong>{project.itemCount}</strong> saved resources</span><span><strong>{project.completedCount}/{project.taskCount}</strong> tasks complete</span><div className="progress-track"><span style={{ width: `${project.taskCount ? project.completedCount / project.taskCount * 100 : 0}%` }}/></div></div><div className="project-columns"><section><SectionHead title="Connected resources" aside={<Button variant="ghost" onClick={capture}><Plus size={14}/> Capture</Button>}/><div className="surface">{data.items.filter(i => i.projectId === project.id).length ? data.items.filter(i => i.projectId === project.id).map(i => <ItemRow key={i.id} item={i} onOpen={() => openItem(i)}/>) : <Empty title="Bring your resources together" description="Attach the notes, repositories, and ideas that will help you move forward."/>}</div><div className="attach-item"><select aria-label="Choose a resource to attach" value={attach} onChange={e => setAttach(e.target.value)}><option value="">Attach an existing item…</option>{data.items.filter(i => i.projectId !== project.id && i.status !== 'archived').map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</select><Button disabled={!attach} onClick={async () => {
                try {
                    await api(`items/${attach}`, 'PATCH', { projectId: project.id });
                    await refresh();
                    setAttach('');
                    notify('Resource attached.');
                }
                catch (e) {
                    notify(errorMessage(e));
                }
            }}><Link2 size={15}/> Attach</Button></div></section><section><SectionHead title="Next steps"/><div className="surface project-task-list">{data.tasks.filter(t => t.projectId === project.id).map(t => <div className={`project-task ${t.status === 'completed' ? 'done' : ''}`} key={t.id}><button className="check-button" aria-label={`Mark ${t.title} ${t.status === 'completed' ? 'open' : 'completed'}`} onClick={async () => { await api(`tasks/${t.id}`, 'PATCH', { status: t.status === 'completed' ? 'open' : 'completed' }); await refresh(); }}><Check size={15}/></button><span>{t.title}</span><button className="icon-button" aria-label={`Delete task ${t.title}`} onClick={() => confirm('Delete task?', 'The linked saved resources will remain.', async () => { await api(`tasks/${t.id}`, 'DELETE'); await refresh(); })}><Trash2 size={13}/></button></div>)}{!data.tasks.some(t => t.projectId === project.id) ? <p className="project-no-tasks">What’s the next small step?</p> : null}<form className="inline-task-form" onSubmit={async (e) => {
                e.preventDefault();
                if (!taskTitle.trim())
                    return;
                try {
                    await api('tasks', 'POST', { title: taskTitle, projectId: project.id });
                    setTaskTitle('');
                    await refresh();
                }
                catch (e) {
                    notify(errorMessage(e));
                }
            }}><Plus size={15}/><input aria-label="New project task" placeholder="Add a next step…" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} maxLength={240}/><button aria-label="Add task"><ArrowRight size={16}/></button></form></div><div className="project-note"><span className="eyebrow">SMALL STEPS COUNT</span><p>A project doesn’t need a perfect plan. It just needs a next step.</p></div><Button variant="danger" onClick={() => confirm('Delete this project?', 'Tasks and saved resources remain, with their project association removed.', async () => { await api(`projects/${project.id}`, 'DELETE'); await refresh(); navigate('/projects'); notify('Project deleted.'); })}><Trash2 size={14}/> Delete project</Button></section></div></> : data.projects.length ? <div className="projects-grid">{data.projects.map((p, i) => <button className="project-card" key={p.id} onClick={() => navigate(`/projects?project=${p.id}`)}><div><span className={`project-emblem color-${i % 4}`}><FolderKanban size={21}/></span><Status status={p.status}/><ArrowUpRight size={17}/></div><h2>{p.name}</h2><p>{p.description || p.goal || 'Your resources and next steps, together.'}</p><div className="project-card-meta"><span>{p.itemCount} resources</span><span>{p.completedCount}/{p.taskCount} steps done</span></div><div className="progress-track"><span style={{ width: `${p.taskCount ? p.completedCount / p.taskCount * 100 : 0}%` }}/></div></button>)}</div> : <Empty title="Make room for your next idea" description="Create a project, gather the resources you’ve saved, and choose one small next step." action={<Button variant="primary" onClick={() => setEditing({ name: '', description: '', goal: '', status: 'active' })}><Plus size={16}/> Create your first project</Button>}/>}
 <Modal open={!!editing} onOpenChange={v => !v && setEditing(null)} title={editing?.id ? 'Edit project' : 'A home for your next idea'} description="Keep the goal clear and the next step small.">{editing ? <form onSubmit={save}><Field label="Project name"><input required autoFocus maxLength={120} value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Learning AI, a side project, a new business…"/></Field><Field label="Description"><textarea rows={3} value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })}/></Field><Field label="What are you working toward?"><input value={editing.goal || ''} onChange={e => setEditing({ ...editing, goal: e.target.value })} placeholder="A concrete outcome to keep in mind"/></Field><Field label="Status"><select value={editing.status || 'active'} onChange={e => setEditing({ ...editing, status: e.target.value })}><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option></select></Field><ErrorNotice message={error}/><div className="modal-footer"><Button type="button" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" variant="primary" busy={busy}>Save project</Button></div></form> : null}</Modal></>;
}
export function TasksView() {
    const { data, refresh, notify, newReminder, openItem, confirm } = useWorkspace();
    const [tab, setTab] = useState('today'), [view, setView] = useState('list'), [weekOffset, setWeekOffset] = useState(0), [editing, setEditing] = useState<Partial<Task> | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const today = dayInZone(new Date(), data.preferences.timezone);
    const due = (iso: string | null) => iso ? dayInZone(new Date(iso), data.preferences.timezone) : '';
    function visible(status: string, date: string | null) {
        const terminal = ['completed', 'dismissed'].includes(status);
        if (tab === 'completed')
            return terminal;
        if (terminal)
            return false;
        const day = due(date);
        if (tab === 'overdue')
            return !!day && day < today;
        if (tab === 'upcoming')
            return !day || day > today;
        if (tab === 'all')
            return true;
        return day === today;
    }
    const tasks = data.tasks.filter(t => visible(t.status, t.dueAt)), reminders = data.reminders.filter(r => visible(r.status, r.snoozedUntil || r.dueAt));
    const overdue = data.tasks.filter(t => t.status !== 'completed' && t.status !== 'dismissed' && due(t.dueAt) && due(t.dueAt) < today).length + data.reminders.filter(r => !['completed', 'dismissed'].includes(r.status) && due(r.snoozedUntil || r.dueAt) < today).length;
    async function reminderAction(r: Reminder, action: 'snooze' | 'complete' | 'dismiss') {
        try {
            await api(`reminders/${r.id}`, 'PATCH', { action, ...(action === 'snooze' ? { until: new Date(Date.now() + data.preferences.snoozeMinutes * 60000).toISOString() } : {}) });
            await refresh();
            notify(action === 'complete' ? 'Follow-up completed.' : action === 'snooze' ? `Snoozed for ${data.preferences.snoozeMinutes} minutes.` : 'Follow-up dismissed.');
        }
        catch (e) {
            notify(errorMessage(e));
        }
    }
    const taskRow = (t: Task) => <div className={`work-row ${t.status === 'completed' ? 'done' : ''}`} key={t.id}><button className="check-button" aria-label={`Mark ${t.title} ${t.status === 'completed' ? 'open' : 'completed'}`} onClick={async () => {
            try {
                await api(`tasks/${t.id}`, 'PATCH', { status: t.status === 'completed' ? 'open' : 'completed' });
                await refresh();
            }
            catch (e) {
                notify(errorMessage(e));
            }
        }}><Check size={16}/></button><div className="work-row-main"><button onClick={() => setEditing({ ...t })}>{t.title}</button><small>{t.projectId ? data.projects.find(p => p.id === t.projectId)?.name + ' · ' : ''}{t.dueAt ? humanDate(t.dueAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'No due date'}</small></div><span className={`priority ${t.priority}`}>{t.priority}</span>{t.itemId ? <button className="icon-button" aria-label="Open linked item" onClick={() => openItem(t.itemId!)}><Link2 size={15}/></button> : null}<button className="icon-button" aria-label={`Edit task ${t.title}`} onClick={() => setEditing({ ...t })}><Pencil size={14}/></button><button className="icon-button" aria-label={`Delete task ${t.title}`} onClick={() => confirm('Delete task?', 'This removes the task. Saved resources remain.', async () => { await api(`tasks/${t.id}`, 'DELETE'); await refresh(); })}><Trash2 size={14}/></button></div>;
    const reminderRow = (r: Reminder) => <div className={`reminder-row ${r.status === 'completed' ? 'done' : ''}`} key={r.id}><span className="reminder-icon"><Bell size={17}/></span><div className="work-row-main"><strong>{r.title}</strong><small>{humanDate(r.snoozedUntil || r.dueAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {r.timezone}{r.recurrence !== 'none' ? ` · ${r.recurrence}` : ''}{r.status === 'snoozed' ? ' · Snoozed' : ''}</small></div>{r.itemId ? <button className="icon-button" aria-label="Open reminder source" onClick={() => openItem(r.itemId!)}><Link2 size={15}/></button> : null}{!['completed', 'dismissed'].includes(r.status) ? <div className="inline-actions"><Button onClick={() => void reminderAction(r, 'complete')}><Check size={14}/> Done</Button><Button variant="ghost" onClick={() => void reminderAction(r, 'snooze')}><Clock size={14}/> Later</Button><Button variant="ghost" onClick={() => void reminderAction(r, 'dismiss')}>Dismiss</Button></div> : <Status status={r.status}/>}<button className="icon-button" aria-label={`Delete reminder ${r.title}`} onClick={() => confirm('Delete follow-up?', 'This removes the schedule and its notification history.', async () => { await api(`reminders/${r.id}`, 'DELETE'); await refresh(); })}><Trash2 size={14}/></button></div>;
    const start = new Date();
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + weekOffset * 7);
    start.setHours(12, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
    return <><div className="page-heading"><div><div className="eyebrow">A GENTLE NUDGE IN THE RIGHT DIRECTION</div><h1>Follow through<span className="accent">.</span></h1><p>Your intentions deserve a next step. Keep the important ones in view.</p></div><div className="inline-actions"><Button onClick={() => newReminder()}><Bell size={15}/> New follow-up</Button><Button variant="primary" onClick={() => setEditing({ title: '', description: '', priority: 'normal', status: 'open', dueAt: null, projectId: null, itemId: null })}><Plus size={16}/> New task</Button></div></div><div className="tabs task-tabs">{[{ id: 'today', label: 'Today' }, { id: 'upcoming', label: 'Upcoming' }, { id: 'overdue', label: `Overdue${overdue ? ' · ' + overdue : ''}` }, { id: 'all', label: 'All open' }, { id: 'completed', label: 'Resolved' }].map(t => <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}<div className="view-toggle"><button aria-label="Task list view" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><List size={16}/></button><button aria-label="Calendar view" className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}><CalendarDays size={16}/></button></div></div>{!data.worker.running ? <div className="info-banner"><Pause size={17}/><span>Your schedules are saved. Start the companion to deliver reminders while the browser is closed.</span></div> : null}{view === 'list' ? <>{tasks.length || reminders.length ? <>{tasks.length ? <><SectionHead title="Tasks"/><div className="surface">{tasks.map(taskRow)}</div></> : null}{reminders.length ? <><SectionHead title="Follow-ups"/><div className="surface">{reminders.map(reminderRow)}</div></> : null}</> : <Empty title={tab === 'today' ? 'A little room in your day' : tab === 'overdue' ? 'Nothing overdue' : 'Nothing here just yet'} description={tab === 'today' ? 'No tasks or follow-ups are due today. Focus on what matters, or choose a next step from a project.' : 'Add an intentional next step or schedule a follow-up when something needs another look.'} action={<Button onClick={() => newReminder()}><Plus size={15}/> Create a follow-up</Button>}/>}</> : <><div className="calendar-header"><Button onClick={() => setWeekOffset(weekOffset - 1)} aria-label="Previous week"><ChevronLeft size={16}/></Button><h2>{humanDate(days[0])} – {humanDate(days[6], { month: 'short', day: 'numeric', year: 'numeric' })}</h2><Button onClick={() => setWeekOffset(weekOffset + 1)} aria-label="Next week"><ChevronRight size={16}/></Button><Button variant="ghost" onClick={() => setWeekOffset(0)}>This week</Button></div><div className="calendar-grid">{days.map(d => { const day = dayInZone(d, data.preferences.timezone); return <section key={day} className={day === today ? 'is-today' : ''}><header><small>{humanDate(d.toISOString(), { weekday: 'short' })}</small><strong>{d.getDate()}</strong></header>{data.tasks.filter(t => due(t.dueAt) === day).map(t => <button key={t.id} className={`calendar-item ${t.status === 'completed' ? 'done' : ''}`} onClick={() => setEditing({ ...t })}><CheckSquareIcon />{t.title}</button>)}{data.reminders.filter(r => due(r.snoozedUntil || r.dueAt) === day).map(r => <button key={r.id} className="calendar-item reminder" onClick={() => { setTab('all'); setView('list'); }}><Bell size={12}/>{r.title}</button>)}</section>; })}</div><p className="muted small">Calendar shows scheduled items for this week, including resolved items. Time zone: {data.preferences.timezone}.</p></>}
 <Modal open={!!editing} onOpenChange={v => !v && setEditing(null)} title={editing?.id ? 'Edit next step' : 'One small next step'} description="A task is an intention you choose to act on.">{editing ? <form onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError('');
                try {
                    await api(`tasks${editing.id ? `/${editing.id}` : ''}`, editing.id ? 'PATCH' : 'POST', { title: editing.title, description: editing.description || '', status: editing.status || 'open', priority: editing.priority || 'normal', dueAt: editing.dueAt || null, projectId: editing.projectId || null, itemId: editing.itemId || null });
                    await refresh();
                    setEditing(null);
                    notify('Task saved.');
                }
                catch (e) {
                    setError(errorMessage(e));
                }
                finally {
                    setBusy(false);
                }
            }}><Field label="Task"><input autoFocus required maxLength={240} value={editing.title || ''} onChange={e => setEditing({ ...editing, title: e.target.value })}/></Field><Field label="Details"><textarea rows={3} value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })}/></Field><div className="form-grid"><Field label="Due (optional)"><input type="datetime-local" value={editing.dueAt ? localInput(editing.dueAt) : ''} onChange={e => setEditing({ ...editing, dueAt: e.target.value ? isoInput(e.target.value) : null })}/></Field><Field label="Priority"><select value={editing.priority || 'normal'} onChange={e => setEditing({ ...editing, priority: e.target.value as Task['priority'] })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></Field><Field label="Project"><select value={editing.projectId || ''} onChange={e => setEditing({ ...editing, projectId: e.target.value || null })}><option value="">No project</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="Saved resource"><select value={editing.itemId || ''} onChange={e => setEditing({ ...editing, itemId: e.target.value || null })}><option value="">No linked item</option>{data.items.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</select></Field><Field label="Status"><select value={editing.status || 'open'} onChange={e => setEditing({ ...editing, status: e.target.value as Task['status'] })}>{['open', 'in_progress', 'completed', 'dismissed'].map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</select></Field></div><ErrorNotice message={error}/><div className="modal-footer"><Button type="button" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" variant="primary" busy={busy}>Save task</Button></div></form> : null}</Modal></>;
}
function CheckSquareIcon() { return <Check size={12}/>; }
