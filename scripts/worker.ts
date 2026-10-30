import { heartbeat, processReminders } from '../src/server/reminders';
import { all, one, run, now, transaction } from '../src/server/db';
import { enrichItem, embedItem } from '../src/server/ai';
import { syncVault, vaultStatus } from '../src/server/vault';
let running = false, lastVault = 0;
async function tick() {
    if (running)
        return;
    running = true;
    try {
        heartbeat();
        processReminders();
        const stale = new Date(Date.now() - 180000).toISOString();
        run('UPDATE jobs SET status=\'pending\',lease_at=NULL WHERE status=\'running\' AND lease_at<?', stale);
        const job = transaction(() => {
            const j = one<{
                id: string;
                item_id: string;
                kind: string;
                attempts: number;
            }>('SELECT * FROM jobs WHERE status=\'pending\' AND run_at<=? ORDER BY created_at LIMIT 1', now());
            if (j)
                run('UPDATE jobs SET status=\'running\',lease_at=?,attempts=attempts+1 WHERE id=?', now(), j.id);
            return j;
        });
        if (job) {
            try {
                if (job.kind === 'embed')
                    await embedItem(job.item_id);
                else
                    await enrichItem(job.item_id);
                run('UPDATE jobs SET status=\'completed\',error=NULL WHERE id=?', job.id);
            }
            catch (error) {
                run('UPDATE jobs SET status=?,run_at=?,error=? WHERE id=?', job.attempts >= 2 ? 'failed' : 'pending', new Date(Date.now() + 60000 * 2 ** job.attempts).toISOString(), error instanceof Error ? error.message : 'Enrichment failed', job.id);
                console.error('An enrichment job failed; review the item or provider configuration.');
            }
        }
        if (Date.now() - lastVault > 60000 && vaultStatus()) {
            lastVault = Date.now();
            try {
                await syncVault();
            }
            catch {
                console.error('Vault synchronization needs attention. See Obsidian Vault in the app.');
            }
        }
    }
    catch {
        console.error('Background processing failed. Check database access and restart the worker.');
    }
    finally {
        running = false;
    }
}
void all('SELECT version FROM schema_migrations');
console.log('Memnivo companion running: durable reminders, enrichment, and read-only vault sync.');
void tick();
const timer = setInterval(() => void tick(), 5000);
process.on('SIGTERM', () => { clearInterval(timer); process.exit(0); });
