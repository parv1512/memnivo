import { z } from 'zod';
import { ITEM_TYPES, ITEM_STATUSES } from './types';
const id = z.string().uuid();
const optionalId = id.nullable().optional();
const date = z.string().datetime({ offset: true });
export const itemInput = z.object({ title: z.string().trim().min(1).max(240), type: z.enum(ITEM_TYPES), url: z.string().url().max(4096).nullable().optional(), source: z.string().max(200).default('Personal note'), content: z.string().max(250000).default(''), summary: z.string().max(10000).default(''), note: z.string().max(50000).default(''), reason: z.string().max(5000).default(''), status: z.enum(ITEM_STATUSES).default('inbox'), sensitivity: z.enum(['normal', 'private']).default('normal'), favorite: z.boolean().default(false), projectId: optionalId, tags: z.array(z.string().max(60)).max(20).default([]) });
export const itemPatch = itemInput.partial();
export const projectInput = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(5000).default(''), goal: z.string().max(2000).default(''), status: z.enum(['active', 'paused', 'completed']).default('active') });
export const taskInput = z.object({ title: z.string().trim().min(1).max(240), description: z.string().max(5000).default(''), status: z.enum(['open', 'in_progress', 'completed', 'dismissed']).default('open'), priority: z.enum(['low', 'normal', 'high']).default('normal'), dueAt: date.nullable().optional(), projectId: optionalId, itemId: optionalId });
export const reminderInput = z.object({ title: z.string().trim().min(1).max(240), note: z.string().max(3000).default(''), itemId: optionalId, taskId: optionalId, dueAt: date, timezone: z.string().refine(v => {
        try {
            new Intl.DateTimeFormat('en', { timeZone: v });
            return true;
        }
        catch {
            return false;
        }
    }, 'Choose a valid time zone.'), recurrence: z.enum(['none', 'daily', 'weekly']).default('none') });
export const preferencesInput = z.object({ displayName: z.string().trim().min(1).max(80), appName: z.string().trim().min(1).max(50), theme: z.enum(['dark', 'light', 'system']), timezone: reminderInput.shape.timezone, onboarded: z.boolean(), aiConsent: z.boolean(), aiSuggestions: z.boolean(), maxReminders: z.number().int().min(0).max(30), snoozeMinutes: z.number().int().min(5).max(10080), quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), desktopNotifications: z.boolean(), dailyReview: z.boolean() });
export const chatInput = z.object({ question: z.string().trim().min(1).max(4000), conversationId: optionalId, scope: z.enum(['all', 'project', 'item']).default('all'), scopeId: optionalId });
export const relationInput = z.object({ sourceId: id, targetId: id, type: z.enum(['related_to', 'links_to', 'inspired_by', 'derived_from']).default('related_to') }).refine(x => x.sourceId !== x.targetId, 'Choose two different items.');
