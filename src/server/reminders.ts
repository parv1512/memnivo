import { all, run, transaction, now, uuid, OWNER, preferences } from './db';
import { reminders } from './store';
import { inQuietHours, dayInZone, nextOccurrence } from '../lib/core';
export function processReminders(clock = new Date()): number {
    const prefs = preferences();
    if (prefs.maxReminders === 0 || inQuietHours(clock, prefs.timezone, prefs.quietStart, prefs.quietEnd))
        return 0;
    return transaction(() => {
        const sent = all<{
            created_at: string;
        }>('SELECT created_at FROM notifications WHERE user_id=? AND created_at>=?', OWNER, new Date(clock.getTime() - 36 * 3600000).toISOString()).filter(n => dayInZone(new Date(n.created_at), prefs.timezone) === dayInZone(clock, prefs.timezone)).length;
        let budget = Math.max(0, prefs.maxReminders - sent), count = 0;
        for (const reminder of reminders()) {
            if (!budget)
                break;
            const occurrence = reminder.snoozedUntil || reminder.dueAt;
            if (!['upcoming', 'snoozed'].includes(reminder.status) || occurrence > clock.toISOString() || reminder.lastNotifiedAt)
                continue;
            const result = run('INSERT OR IGNORE INTO notifications(id,user_id,reminder_id,occurrence,title,body,created_at) VALUES(?,?,?,?,?,?,?)', uuid(), OWNER, reminder.id, occurrence, reminder.title, reminder.note || 'You asked to revisit this. Complete it, snooze it, or dismiss it.', clock.toISOString());
            run('UPDATE reminders SET last_notified_at=?,updated_at=? WHERE id=?', clock.toISOString(), clock.toISOString(), reminder.id);
            if (result.changes) {
                count++;
                budget--;
            }
            if (reminder.recurrence !== 'none') {
                let next = nextOccurrence(reminder.dueAt, reminder.recurrence, reminder.timezone);
                while (next <= clock.toISOString())
                    next = nextOccurrence(next, reminder.recurrence, reminder.timezone);
                run('UPDATE reminders SET due_at=?,snoozed_until=NULL,status=\'upcoming\',last_notified_at=NULL WHERE id=?', next, reminder.id);
            }
        }
        return count;
    });
}
export function heartbeat() { run('INSERT INTO runtime_state(key,value) VALUES(\'worker_heartbeat\',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', now()); }
