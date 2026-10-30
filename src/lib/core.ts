import type { ItemType } from './types';
export function normalizeTags(input: string[] | string): string[] {
    const tags = typeof input === 'string' ? input.split(',') : input;
    return [...new Set(tags.map(t => t.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-')).filter(Boolean))].slice(0, 20);
}
export function normalizeUrl(input: string): string | null {
    const text = input.trim();
    if (!/^https?:\/\//i.test(text))
        return null;
    try {
        const u = new URL(text);
        if (u.username || u.password)
            return null;
        u.hash = '';
        for (const key of [...u.searchParams.keys()])
            if (/^utm_|^fbclid$|^gclid$/i.test(key))
                u.searchParams.delete(key);
        u.hostname = u.hostname.toLowerCase();
        if (u.pathname !== '/')
            u.pathname = u.pathname.replace(/\/$/, '');
        u.searchParams.sort();
        return u.toString();
    }
    catch {
        return null;
    }
}
export function classify(input: string): ItemType {
    const url = normalizeUrl(input);
    if (url) {
        const u = new URL(url);
        if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(u.hostname))
            return 'video';
        if (u.hostname === 'github.com' && u.pathname.split('/').filter(Boolean).length >= 2)
            return 'repository';
        if (/\.(pdf|docx?|txt|md)$/i.test(u.pathname))
            return 'document';
        return 'article';
    }
    if (/^```/.test(input.trim()))
        return 'code';
    return 'note';
}
export function titleFrom(input: string): string {
    const url = normalizeUrl(input);
    if (url) {
        const u = new URL(url);
        if (classify(url) === 'repository')
            return u.pathname.split('/').filter(Boolean).slice(0, 2).join(' / ');
        return `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname.replace(/\//g, ' / ')}`.slice(0, 160);
    }
    return input.replace(/^#+\s*/, '').split('\n')[0].slice(0, 160) || 'Untitled note';
}
export function intentFrom(text: string): string | null {
    if (/\b(watch|read|try|review|build|learn|finish|practice)\b.{0,60}\b(later|tomorrow|weekend|week|need|want)\b|\b(need|want|plan)\s+to\s+(watch|read|try|review|build|learn|finish)|\bremind me\b/i.test(text))
        return 'You mentioned an intention. Add a follow-up when you are ready.';
    return null;
}
export function words(text: string): string[] { return (text.toLowerCase().match(/[\p{L}\p{N}_+#.-]{2,}/gu) || []).filter(w => !STOP.has(w)); }
const STOP = new Set('the a an of in to i me my that this what was were for and with on it saved find show about have did do is are you from'.split(' '));
const SYNONYMS: Record<string, string[]> = { chatbot: ['chat', 'rag', 'assistant'], pdf: ['document', 'retrieval'], repo: ['repository', 'github'], repositories: ['repository', 'github'], video: ['youtube', 'watch'], unfinished: ['inbox', 'in_progress', 'open'], learn: ['learning', 'tutorial', 'course'], business: ['startup', 'entrepreneur'], scraping: ['scraper', 'crawl', 'scrape'] };
export function queryTokens(query: string): string[] { return [...new Set(words(query).flatMap(t => [t, ...(SYNONYMS[t] || [])]))]; }
export function cosine(a: number[], b: number[]): number {
    if (a.length !== b.length || !a.length)
        return 0;
    let dot = 0, aa = 0, bb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        aa += a[i] * a[i];
        bb += b[i] * b[i];
    }
    return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
export function inQuietHours(now: Date, timezone: string, start: string, end: string): boolean {
    if (start === end)
        return false;
    const value = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
    return start < end ? value >= start && value < end : value >= start || value < end;
}
export function dayInZone(now: Date, timezone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const value = (type: string) => parts.find(p => p.type === type)!.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
}
export function nextOccurrence(iso: string, recurrence: 'daily' | 'weekly', timezone: string): string {
    const prior = new Date(iso), target = new Date(prior.getTime() + (recurrence === 'daily' ? 1 : 7) * 86400000);
    // Preserve wall-clock time over daylight-saving transitions.
    const minutes = (date: Date) => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date).split(':').map(Number); return p[0] * 60 + p[1]; };
    let delta = minutes(prior) - minutes(target);
    if (delta > 720)
        delta -= 1440;
    if (delta < -720)
        delta += 1440;
    const corrected = new Date(target.getTime() + delta * 60000);
    // A nonexistent time during the spring transition rolls forward with the gap.
    return (minutes(corrected) === minutes(prior) ? corrected : target).toISOString();
}
export function snippet(text: string, tokens: string[], length = 400): string {
    const lower = text.toLowerCase();
    const at = tokens.map(t => lower.indexOf(t)).filter(i => i >= 0).sort((a, b) => a - b)[0] ?? 0;
    const start = Math.max(0, at - 80);
    return (start ? '…' : '') + text.slice(start, start + length) + (text.length > start + length ? '…' : '');
}
