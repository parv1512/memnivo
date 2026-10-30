import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Clipboard, Plus, Link2, Sparkles, ArrowRight, LockKeyhole } from 'lucide-react';
import { Modal, Button, Field, TypeIcon, ErrorNotice } from './ui';
import { useWorkspace } from './context';
import { api, errorMessage, ClientError, localInput, isoInput } from './api';
import { classify, normalizeTags, normalizeUrl, titleFrom, intentFrom } from '../lib/core';
import type { Item, ItemType } from '../lib/types';
interface CaptureValues {
    input: string;
    title: string;
    reason: string;
    tags: string;
    projectId: string;
    due: string;
    sensitivity: 'normal' | 'private';
    type: ItemType | 'auto';
}
export function Capture({ open, onClose }: {
    open: boolean;
    onClose: () => void;
}) {
    const { data, refresh, notify, openItem } = useWorkspace();
    const { register, handleSubmit, watch, reset, setValue, formState: { errors, isSubmitting } } = useForm<CaptureValues>({ defaultValues: { input: '', title: '', reason: '', tags: '', projectId: '', due: '', sensitivity: 'normal', type: 'auto' } });
    const [error, setError] = useState(''), [duplicate, setDuplicate] = useState<string | null>(null), [advanced, setAdvanced] = useState(false);
    const input = watch('input') || '', type = watch('type') === 'auto' ? classify(input) : watch('type') as ItemType, intent = data.preferences.aiSuggestions ? intentFrom(`${input} ${watch('reason') || ''}`) : null;
    useEffect(() => {
        if (open) {
            reset({ input: '', title: '', reason: '', tags: '', projectId: '', due: '', sensitivity: 'normal', type: 'auto' });
            setError('');
            setDuplicate(null);
            setAdvanced(false);
        }
    }, [open, reset]);
    const save = handleSubmit(async (v) => {
        setError('');
        setDuplicate(null);
        try {
            const url = normalizeUrl(v.input);
            if (/^https?:/i.test(v.input.trim()) && !url)
                throw new Error('This URL is invalid. Check the address.');
            const item = await api<Item>('items', 'POST', { title: v.title.trim() || titleFrom(v.input), type: v.type === 'auto' ? classify(v.input) : v.type, url, content: url ? '' : v.input, source: url ? new URL(url).hostname : 'Personal note', reason: v.reason, tags: normalizeTags(v.tags), projectId: v.projectId || null, sensitivity: v.sensitivity });
            if (v.due) {
                try {
                    await api('reminders', 'POST', { title: `Revisit: ${item.title}`, itemId: item.id, dueAt: isoInput(v.due), timezone: data.preferences.timezone });
                }
                catch (e) {
                    await refresh();
                    onClose();
                    openItem(item);
                    notify(`Item saved. Reminder was not created: ${errorMessage(e)}`);
                    return;
                }
            }
            await refresh();
            notify(v.due ? 'Saved with a follow-up.' : 'Saved to your inbox.');
            onClose();
        }
        catch (e) {
            setError(errorMessage(e));
            if (e instanceof ClientError && e.detail?.itemId)
                setDuplicate(e.detail.itemId);
        }
    });
    return <Modal open={open} onOpenChange={v => !v && onClose()} title="Quick capture" description="Save the thought. Make sense of it when you are ready." wide><form onSubmit={save}><div className="capture-input"><textarea autoFocus aria-label="Link, note, or idea" placeholder="Paste a link, write a note, or save an idea…" {...register('input', { required: 'Add a link or a note first.', maxLength: { value: 250000, message: 'Keep captures under 250,000 characters.' } })}/><div><span className="type-detected"><TypeIcon type={type} size={15}/>{type} detected</span><button type="button" className="text-button" onClick={async () => {
            try {
                setValue('input', await navigator.clipboard.readText());
            }
            catch {
                setError('Clipboard access was denied. Paste using Ctrl+V.');
            }
        }}><Clipboard size={14}/> Paste</button></div></div>{errors.input ? <ErrorNotice message={errors.input.message || ''}/> : null}<Field label="Why are you saving this?"><input placeholder="For my next project, something to try, a thought to keep…" {...register('reason')}/></Field><div className="form-grid"><Field label="Project"><select {...register('projectId')}><option value="">No project yet</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="Tags"><input placeholder="ai, learning, inspiration" {...register('tags')}/></Field></div>{intent && !watch('due') ? <div className="intent-hint"><Sparkles size={16}/><span>{intent}</span><button type="button" className="text-button" onClick={() => { setValue('due', localInput()); setAdvanced(true); }}>Add follow-up <ArrowRight size={14}/></button></div> : null}<button type="button" className="text-button capture-options" onClick={() => setAdvanced(!advanced)}>{advanced ? 'Fewer options' : 'Title, type, privacy & follow-up'}</button>{advanced ? <div className="advanced-fields"><Field label="Title (optional)"><input placeholder={titleFrom(input) || 'Suggested from your content'} {...register('title', { maxLength: 240 })}/></Field><div className="form-grid"><Field label="Content type"><select {...register('type')}><option value="auto">Detect automatically</option>{['note', 'article', 'video', 'repository', 'context', 'document', 'code'].map(t => <option key={t}>{t}</option>)}</select></Field><Field label="Sensitivity"><select {...register('sensitivity')}><option value="normal">Normal</option><option value="private">Private · exclude from AI & metadata</option></select></Field></div><Field label="Follow up (optional)" hint={`Time shown in your device's time zone. Reminder preference: ${data.preferences.timezone}.`}><input type="datetime-local" {...register('due')}/></Field></div> : null}<ErrorNotice message={error}/>{duplicate ? <Button type="button" onClick={() => { onClose(); openItem(duplicate); }}>Open existing item</Button> : null}<div className="modal-footer"><span className="fine-print"><LockKeyhole size={13}/> Stored on this computer</span><Button type="submit" variant="primary" busy={isSubmitting}><Plus size={17}/>{watch('due') ? 'Save & create reminder' : 'Save to inbox'}</Button></div></form></Modal>;
}
