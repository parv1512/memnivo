import { useMemo, useRef, useState } from 'react';
import { Network, Plus, Minus, Maximize2, Search, Link2, ArrowUpRight, Focus, Info } from 'lucide-react';
import { useWorkspace } from './context';
import { Button, Modal, Field, Empty, ErrorNotice } from './ui';
import { api, errorMessage } from './api';
interface Node {
    id: string;
    label: string;
    type: string;
    kind: 'item' | 'project' | 'topic' | 'task';
    x: number;
    y: number;
}
interface Edge {
    id: string;
    source: string;
    target: string;
    explicit: boolean;
    type: string;
}
const COLORS: Record<string, string> = { note: '#8b83ff', article: '#74b6e8', video: '#ef9d8d', repository: '#9bcca7', context: '#d7abe8', document: '#e4c178', code: '#8bd0ca', project: '#a2afff', topic: '#737d90', task: '#d2b181' };
export function GraphView() {
    const { data, openItem, navigate, refresh, notify } = useWorkspace();
    const [query, setQuery] = useState(''), [type, setType] = useState(''), [topics, setTopics] = useState(false), [projects, setProjects] = useState(true), [tasks, setTasks] = useState(false), [focus, setFocus] = useState<string | null>(null), [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 }), [positions, setPositions] = useState<Record<string, {
        x: number;
        y: number;
    }>>({}), [connecting, setConnecting] = useState(false), [source, setSource] = useState(''), [target, setTarget] = useState(''), [relationType, setRelationType] = useState('related_to'), [error, setError] = useState('');
    const svg = useRef<SVGSVGElement>(null), drag = useRef<{
        id: string;
        x: number;
        y: number;
        startX: number;
        startY: number;
        moved: boolean;
    } | null>(null);
    const graph = useMemo(() => {
        let items = data.items.filter(i => i.status !== 'archived' && (!type || i.type === type));
        const edges: Edge[] = data.relationships.map(r => ({ id: r.id, source: r.sourceId, target: r.targetId, explicit: r.origin === 'user', type: r.type }));
        let nodes: Node[] = items.map(i => ({ id: i.id, label: i.title, type: i.type, kind: 'item', x: 0, y: 0 }));
        if (projects)
            for (const p of data.projects) {
                nodes.push({ id: p.id, label: p.name, type: 'project', kind: 'project', x: 0, y: 0 });
                for (const item of items.filter(i => i.projectId === p.id))
                    edges.push({ id: `${p.id}:${item.id}`, source: p.id, target: item.id, explicit: true, type: 'part of project' });
            }
        if (topics) {
            const tags = [...new Set(items.flatMap(i => i.tags))].slice(0, 30);
            for (const tag of tags) {
                const id = `tag:${tag}`;
                nodes.push({ id, label: tag, type: 'topic', kind: 'topic', x: 0, y: 0 });
                for (const item of items.filter(i => i.tags.includes(tag)))
                    edges.push({ id: `${id}:${item.id}`, source: id, target: item.id, explicit: false, type: 'tagged' });
            }
        }
        if (tasks)
            for (const t of data.tasks.filter(t => t.itemId)) {
                nodes.push({ id: t.id, label: t.title, type: 'task', kind: 'task', x: 0, y: 0 });
                edges.push({ id: `${t.id}:task`, source: t.id, target: t.itemId!, explicit: true, type: 'next step' });
            }
        if (query.trim())
            nodes = nodes.filter(n => n.label.toLowerCase().includes(query.toLowerCase()));
        if (focus) {
            const neighbor = new Set(edges.filter(e => e.source === focus || e.target === focus).flatMap(e => [e.source, e.target]));
            neighbor.add(focus);
            nodes = nodes.filter(n => neighbor.has(n.id));
        }
        nodes = nodes.slice(0, 120);
        nodes = nodes.map((n, i) => { const angle = i * 2.39996, radius = nodes.length === 1 ? 0 : Math.min(275, 65 * Math.sqrt(i + 1)); return { ...n, ...(positions[n.id] || { x: 500 + Math.cos(angle) * radius * 1.3, y: 330 + Math.sin(angle) * radius }) }; });
        const ids = new Set(nodes.map(n => n.id));
        return { nodes, edges: edges.filter(e => ids.has(e.source) && ids.has(e.target)), capped: data.items.length > 120 };
    }, [data.items, data.projects, data.relationships, data.tasks, type, topics, projects, tasks, query, focus, positions]);
    const point = (e: React.PointerEvent) => { const rect = svg.current!.getBoundingClientRect(); return { x: (e.clientX - rect.left) / rect.width * 1000, y: (e.clientY - rect.top) / rect.height * 660 }; };
    const open = (n: Node) => {
        if (n.kind === 'item')
            openItem(n.id);
        else if (n.kind === 'project')
            navigate(`/projects?project=${n.id}`);
        else if (n.kind === 'task')
            navigate('/tasks');
        else
            navigate(`/library?q=${encodeURIComponent(n.label)}`);
    };
    return <><div className="page-heading"><div><div className="eyebrow">GOOD IDEAS RARELY STAND ALONE</div><h1>Connect the dots<span className="accent">.</span></h1><p>Explore the relationships between the things you know.</p></div><Button variant="primary" onClick={() => setConnecting(true)} disabled={data.items.length < 2}><Link2 size={16}/> Add connection</Button></div><div className="graph-toolbar"><div className="search-field"><Search size={16}/><input aria-label="Search graph" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a node…"/></div><select aria-label="Filter graph item type" value={type} onChange={e => setType(e.target.value)}><option value="">All item types</option>{['note', 'article', 'video', 'repository', 'context', 'document', 'code'].map(t => <option key={t}>{t}</option>)}</select><label>Focus<select aria-label="Focus on an item and its neighbors" value={focus || ''} onChange={e => setFocus(e.target.value || null)}><option value="">All nodes</option>{data.items.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</select></label><label><input type="checkbox" checked={projects} onChange={e => setProjects(e.target.checked)}/> Projects</label><label><input type="checkbox" checked={topics} onChange={e => setTopics(e.target.checked)}/> Topics</label><label><input type="checkbox" checked={tasks} onChange={e => setTasks(e.target.checked)}/> Tasks</label></div><div className="graph-container">{graph.nodes.length ? <svg ref={svg} viewBox="0 0 1000 660" className="knowledge-svg" aria-label="Interactive knowledge graph. Drag nodes, click to open, press F on a focused node to see neighbors." onPointerDown={e => {
                if (e.target === svg.current) {
                    const p = point(e);
                    drag.current = { id: 'pan', x: p.x, y: p.y, startX: pan.x, startY: pan.y, moved: false };
                    e.currentTarget.setPointerCapture(e.pointerId);
                }
            }} onPointerMove={e => {
                const d = drag.current;
                if (!d)
                    return;
                const p = point(e);
                const dx = p.x - d.x, dy = p.y - d.y;
                if (Math.abs(dx) + Math.abs(dy) > 4)
                    d.moved = true;
                if (d.id === 'pan')
                    setPan({ x: d.startX + dx, y: d.startY + dy });
                else
                    setPositions(prev => ({ ...prev, [d.id]: { x: d.startX + dx / zoom, y: d.startY + dy / zoom } }));
            }} onPointerUp={() => { setTimeout(() => { drag.current = null; }, 0); }}><defs><pattern id="graph-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.8" className="graph-dot"/></pattern></defs><rect width="1000" height="660" fill="url(#graph-dots)" pointerEvents="none"/><g transform={`translate(${pan.x + 500 * (1 - zoom)},${pan.y + 330 * (1 - zoom)}) scale(${zoom})`}>{graph.edges.map(e => { const a = graph.nodes.find(n => n.id === e.source)!, b = graph.nodes.find(n => n.id === e.target)!; return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`graph-edge ${e.explicit ? 'explicit' : 'derived'}`}><title>{e.type.replaceAll('_', ' ')} · {e.explicit ? 'User-created' : 'Imported or derived'}</title></line>; })}{graph.nodes.map(n => <g key={n.id} className={`graph-node ${focus === n.id ? 'focused' : ''}`} transform={`translate(${n.x},${n.y})`} role="button" tabIndex={0} aria-label={`${n.label}, ${n.type}. Enter to open. F to focus neighbors.`} onKeyDown={e => {
                    if (e.key === 'Enter')
                        open(n);
                    if (e.key.toLowerCase() === 'f')
                        setFocus(n.id);
                }} onPointerDown={e => { e.stopPropagation(); const p = point(e); drag.current = { id: n.id, x: p.x, y: p.y, startX: n.x, startY: n.y, moved: false }; svg.current?.setPointerCapture(e.pointerId); }} onClick={() => {
                    if (!drag.current?.moved)
                        open(n);
                }} onDoubleClick={e => { e.preventDefault(); setFocus(n.id); }}><circle r={n.kind === 'project' ? 17 : n.kind === 'topic' ? 9 : 12} fill={COLORS[n.type] || COLORS.note} fillOpacity="0.17" stroke={COLORS[n.type] || COLORS.note} strokeWidth="1.6"/><circle r="3" fill={COLORS[n.type] || COLORS.note}/><text y={n.kind === 'project' ? 34 : 29} textAnchor="middle">{n.label.length > 27 ? n.label.slice(0, 25) + '…' : n.label}</text><title>{n.label}</title></g>)}</g></svg> : <Empty icon="search" title={data.items.length ? 'No nodes match this view' : 'A picture of your thinking, over time'} description={data.items.length ? 'Adjust the search, item type, or focus to see more connections.' : 'Save a few things and connect related items. Your knowledge graph will grow from the real links you make.'}/>}<div className="graph-controls"><Button aria-label="Zoom in" onClick={() => setZoom(Math.min(2.5, zoom + 0.2))}><Plus size={16}/></Button><span>{Math.round(zoom * 100)}%</span><Button aria-label="Zoom out" onClick={() => setZoom(Math.max(0.4, zoom - 0.2))}><Minus size={16}/></Button><Button aria-label="Reset graph view" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setPositions({}); setFocus(null); }}><Maximize2 size={16}/></Button></div><div className="graph-count">{graph.nodes.length} nodes · {graph.edges.length} connections{focus ? <button onClick={() => setFocus(null)}>Clear focus ×</button> : null}</div></div><div className="graph-legend"><span><i className="line-key"/> Your connections & project links</span><span><i className="line-key dashed"/> Imported links & topic connections</span><p><Info size={13}/> Drag to arrange · Click to open · Focus from a node with the F key</p></div>{graph.capped ? <div className="info-banner">Showing up to 120 nodes to keep exploration responsive. Use search or type filters to narrow your view.</div> : null}<Modal open={connecting} onOpenChange={setConnecting} title="Make a connection" description="Tell your memory how two saved things fit together."><form onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            try {
                await api('relationships', 'POST', { sourceId: source, targetId: target, type: relationType });
                await refresh();
                setConnecting(false);
                notify('Connection created.');
            }
            catch (e) {
                setError(errorMessage(e));
            }
        }}><Field label="From"><select required value={source} onChange={e => setSource(e.target.value)}><option value="">Choose an item</option>{data.items.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</select></Field><Field label="Relationship"><select value={relationType} onChange={e => setRelationType(e.target.value)}>{['related_to', 'links_to', 'inspired_by', 'derived_from'].map(r => <option key={r} value={r}>{r.replaceAll('_', ' ')}</option>)}</select></Field><Field label="To"><select required value={target} onChange={e => setTarget(e.target.value)}><option value="">Choose an item</option>{data.items.filter(i => i.id !== source).map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</select></Field><ErrorNotice message={error}/><div className="modal-footer"><Button type="submit" variant="primary" disabled={!source || !target}>Create connection</Button></div></form></Modal></>;
}
