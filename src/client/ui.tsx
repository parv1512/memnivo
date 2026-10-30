import * as Dialog from '@radix-ui/react-dialog';
import { X, LoaderCircle, FileText, Play, GitFork, Globe, Code2, BookOpen, UserRound, Plus, ArrowUpRight, Search } from 'lucide-react';
import type { Item, ItemType } from '../lib/types';
import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { humanDate } from './api';
export function Button({ children, variant = 'secondary', busy = false, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    busy?: boolean;
}) { return <button {...props} className={`button ${variant} ${className}`} disabled={props.disabled || busy}>{busy ? <LoaderCircle className="spin" size={16}/> : null}{children}</button>; }
export function Modal({ open, onOpenChange, title, description, children, wide = false }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    children: ReactNode;
    wide?: boolean;
}) { return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="modal-overlay"/><Dialog.Content className={`modal ${wide ? 'wide' : ''}`}><div className="modal-heading"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description className={description ? 'muted' : 'sr-only'}>{description || title}</Dialog.Description></div><Dialog.Close className="icon-button" aria-label="Close dialog"><X size={20}/></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>; }
export function TypeIcon({ type, size = 19 }: {
    type: ItemType;
    size?: number;
}) { const Icon = { note: FileText, article: Globe, video: Play, repository: GitFork, context: UserRound, document: BookOpen, code: Code2 }[type]; return <span className={`type-icon ${type}`}><Icon size={size}/></span>; }
export function Tag({ children }: {
    children: ReactNode;
}) { return <span className="tag">{children}</span>; }
export function Status({ status }: {
    status: string;
}) { return <span className={`status ${status}`}><span />{status.replaceAll('_', ' ')}</span>; }
export function Empty({ icon = 'capture', title, description, action }: {
    icon?: 'capture' | 'search';
    title: string;
    description: string;
    action?: ReactNode;
}) { return <div className="empty"><div className="empty-symbol">{icon === 'search' ? <Search size={25}/> : <Plus size={25}/>}</div><h3>{title}</h3><p>{description}</p>{action}</div>; }
export function ItemCard({ item, onOpen, selected, onSelect }: {
    item: Item;
    onOpen: () => void;
    selected?: boolean;
    onSelect?: () => void;
}) { return <article className={`item-card ${selected ? 'selected' : ''}`}><div className="item-card-top"><TypeIcon type={item.type}/><span className="eyebrow">{item.type}</span>{onSelect ? <input type="checkbox" checked={!!selected} aria-label={`Select ${item.title}`} onChange={onSelect}/> : null}</div><button className="card-title" onClick={onOpen}>{item.title}</button><p className="card-description">{item.summary || item.reason || item.content.slice(0, 160) || 'Open to add your notes and context.'}</p><div className="tags">{item.tags.slice(0, 3).map(t => <Tag key={t}>{t}</Tag>)}</div><div className="item-card-bottom"><Status status={item.status}/><span>{humanDate(item.createdAt)}</span></div>{item.favorite ? <span className="favorite-dot" aria-label="Favorite">★</span> : null}</article>; }
export function ItemRow({ item, onOpen, end }: {
    item: Item;
    onOpen: () => void;
    end?: ReactNode;
}) { return <div className="item-row"><button className="row-main" onClick={onOpen}><TypeIcon type={item.type}/><span><strong>{item.title}</strong><small>{item.source} · {humanDate(item.createdAt)}{item.tags.length ? ` · ${item.tags.slice(0, 2).join(', ')}` : ''}</small></span></button>{end || <Status status={item.status}/>}<button className="icon-button" onClick={onOpen} aria-label={`Open ${item.title}`}><ArrowUpRight size={16}/></button></div>; }
export function SectionHead({ title, aside }: {
    title: string;
    aside?: ReactNode;
}) { return <div className="section-head"><h2>{title}</h2>{aside}</div>; }
export function Field({ label, children, hint }: {
    label: string;
    children: ReactNode;
    hint?: string;
}) { return <label className="field"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>; }
export function ErrorNotice({ message }: {
    message: string;
}) { return message ? <div className="error-notice" role="alert">{message}</div> : null; }
