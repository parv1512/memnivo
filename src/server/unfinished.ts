import { listItems, tasks } from './store';
import type { Citation, Item } from '../lib/types';

const TODO_SECTION = /^(?:to[ -]?dos?|tasks?(?: to (?:do|finish|complete))?|action items?|next steps|(?:things|works?) (?:to (?:do|finish|complete|be done)|(?:i )?(?:still )?have to do)|(?:unfinished|pending|remaining) (?:works?|things|assignments))$/i;
const DONE_SECTION = /^(?:already )?(?:done|completed|finished)(?: (?:tasks?|work|items?|assignments))?$/i;
const REFERENCE_SECTION = /^(?:resources?|references?|(?:saved )?links?|bookmarks?|background|ideas|notes)$/i;
const INTENT = /^(?:(?:i |we )?(?:also )?(?:still )?(?:need to|have to|must|plan to)|(?:i|we) (?:also )?(?:still )?(?:want|intend) to)\s+(.+)$/i;
const DONE = /^(?:\[x\]|(?:already )?(?:done|completed|finished)\s*[:–-]|(?:i|we)(?:'ve| have)?\s+(?:already )?(?:completed|finished|done)\b)|(?:\s+[–-]\s+|\s+\()(?:already )?(?:done|completed|finished)\)?\s*[.!]?$/i;
const REFERENCE = /^(?:https?:\/\/|<https?:\/\/|!?\[[^\]]+\]\(|\[\[[^\]]+\]\])/i;
const ACTION = 'add|apply|book|build|buy|call|check|clean|complete|create|draft|email|finish|fix|follow up|learn|make|meet|pay|prepare|read|register|research|review|send|set up|start|study|submit|test|try|update|upload|watch|write';
const STARTS_ACTION = new RegExp(`^(?:${ACTION})\\b`, 'i');
const ACTION_SEPARATOR = new RegExp(`[;,]\\s*(?:and\\s+)?(?=(?:${ACTION})\\b)|\\s+and\\s+(?=(?:${ACTION})\\b)`, 'i');

export function asksForUnfinishedWork(question: string): boolean {
    const normalized = question.trim().toLowerCase().replace(/’/g, "'").replace(/\bunifinished\b/g, 'unfinished');
    const work = '(?:works?|tasks?|to[ -]?dos?|items?|things|assignments?)';
    const status = '(?:unfinished|pending|outstanding|remaining|open|incomplete)';
    return new RegExp(`^${status}\\s+${work}[?.!\\s]*$`).test(normalized)
        || new RegExp(`^(?:please\\s+)?(?:what|which|show|list|tell me|find|do i have)\\b(?:[' ](?:are|is|s|me|the|of|all|my|our|any|i|have|still|to|do|left))*\\s+${status}\\s+${work}\\b`).test(normalized)
        || new RegExp(`^(?:what|which)\\s+(?:of\\s+)?(?:my\\s+)?${work}\\s+(?:are|is)\\s+(?:still\\s+)?${status}\\b`).test(normalized)
        || /^what(?:'s| is) (?:still )?(?:left|pending)\b/.test(normalized)
        || /^what (?:do|did) i (?:still (?:need|have) to (?:do|finish|complete)\b|(?:need|have) to (?:do|finish|complete)(?=[?!.]*$| (?:next|for)\b))/.test(normalized)
        || /^what (?:work|tasks?|assignments?) (?:do i |is |are )?(?:still )?(?:have )?left\b/.test(normalized)
        || /^(?:show me |list |what are )?(?:my|our)\s+(?:to[ -]?dos?|task list)\b/.test(normalized);
}

function actionKey(text: string): string {
    return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function todoHeading(label: string): boolean {
    return TODO_SECTION.test(label.replace(/^(?:here (?:are|is) |(?:i |we )?have (?:these |some )?(?:different )?|my |open )+/i, ''));
}

function noteActions(item: Item): string[] {
    const open = new Map<string, string>();
    const completed = new Set<string>();
    const noteFields = [item.content, item.note, item.reason];
    if (!noteFields.some(text => text.trim()))
        noteFields.push(item.title);

    for (const [index, text] of noteFields.entries()) {
        let section: 'todo' | 'done' | 'reference' | null = index === 0 && todoHeading(item.title.replace(/[:.!?]$/, '').trim()) ? 'todo' : null;
        const note = text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
        let fence = '';
        for (const raw of note.split(/\r?\n/)) {
            const line = raw.trim();
            const marker = line.match(/^(?:`{3,}|~{3,})/)?.[0];
            if (marker) {
                if (!fence || marker[0] === fence[0] && marker.length >= fence.length)
                    fence = fence ? '' : marker;
                continue;
            }
            if (fence || !line || line.startsWith('>'))
                continue;
            const heading = /^#{1,6}\s+/.test(line);
            const bullet = /^(?:[-*+]\s+|\d+[.)]\s+)/.test(line);
            const content = line.replace(/^(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)/, '').replace(/^\*\*(.+?)\*\*(?=:|\s|$)/, '$1');
            const checkbox = content.match(/^\[([ xX])\]\s+(.+)$/);
            const label = content.split(':', 1)[0].replace(/[.!?]$/, '').trim();
            const startsTodoList = !checkbox && todoHeading(label);
            const startsDoneList = !checkbox && DONE_SECTION.test(label);
            const startsReferenceList = !checkbox && REFERENCE_SECTION.test(label);
            if (heading || startsTodoList || startsDoneList || startsReferenceList)
                section = startsTodoList ? 'todo' : startsDoneList ? 'done' : startsReferenceList ? 'reference' : null;
            if (startsReferenceList || heading && !startsTodoList && !startsDoneList || section === 'reference')
                continue;

            if ((startsTodoList || startsDoneList) && !content.includes(':'))
                continue;
            const intent = content.match(INTENT)?.[1];
            const inTaskList = section === 'todo' || section === 'done';
            if (!checkbox && !intent && !(inTaskList && (bullet || startsTodoList || startsDoneList || STARTS_ACTION.test(content))))
                continue;
            const actions = checkbox?.[2] ?? (startsTodoList || startsDoneList ? content.slice(content.indexOf(':') + 1).trim() : intent ?? content);
            const candidates = checkbox || bullet ? [actions] : actions.split(/(?<=[.!?])\s+(?=(?:i|we)\b)/i).flatMap(sentence => (sentence.match(INTENT)?.[1] ?? sentence).split(ACTION_SEPARATOR));
            for (const candidate of candidates) {
                const action = candidate.trim().replace(/^and\s+/i, '');
                if (!action || REFERENCE.test(action) || /\bhttps?:\/\//i.test(action) && !STARTS_ACTION.test(action))
                    continue;
                const crossedOut = action.match(/^~~(.+?)~~[.!]?$/);
                const key = actionKey((crossedOut?.[1] ?? action).replace(DONE, '').trim());
                if (!key)
                    continue;
                if (section === 'done' || crossedOut || checkbox?.[1].toLowerCase() === 'x' || DONE.test(action))
                    completed.add(key);
                else
                    open.set(key, action);
            }
        }
    }
    return [...open].filter(([key]) => !completed.has(key)).map(([, action]) => action);
}

export function unfinishedWork(scope: 'all' | 'project' | 'item', scopeId: string | null) {
    const items = listItems();
    const inScope = (projectId: string | null, itemId: string | null) => scope === 'all'
        || (scope === 'item' ? itemId === scopeId : projectId === scopeId);
    const tracked = tasks().filter(task => inScope(task.projectId ?? items.find(item => item.id === task.itemId)?.projectId ?? null, task.itemId));
    const taskLines = tracked.filter(task => task.status === 'open' || task.status === 'in_progress').map(task => `- ${task.title}`);
    const noteLines: string[] = [];
    const citations: Citation[] = [];
    for (const note of items) {
        if (note.type !== 'note' || note.status === 'archived' || note.status === 'completed' || !inScope(note.projectId, note.id))
            continue;
        const actions = noteActions(note).filter(action => !tracked.some(task => actionKey(task.title) === actionKey(action)
            && (task.itemId === note.id || (task.projectId === note.projectId && task.updatedAt >= note.updatedAt))));
        if (!actions.length)
            continue;
        const number = citations.length + 1;
        noteLines.push(...actions.map(action => `- ${action} [${number}]`));
        citations.push({ itemId: note.id, title: note.title, excerpt: actions.join('\n'), score: 1, createdAt: note.createdAt, url: note.url, methods: ['Tasks written in note'] });
    }
    const sections = [];
    if (taskLines.length)
        sections.push(['Open tasks', ...taskLines].join('\n'));
    if (noteLines.length)
        sections.push(['To-dos from your notes', ...noteLines].join('\n'));
    return {
        answer: sections.join('\n\n') || 'I found no open tasks or clear to-dos in the notes in this search. You can add a task or write an unchecked item like “- [ ] Submit the form” in a note.',
        citations,
    };
}
