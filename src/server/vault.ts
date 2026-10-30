import { readdir, readFile, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { all, one, run, uuid, now, hash, OWNER, transaction } from './db';
import { createItem, getItem, updateItem, metadata, addRelation, AppError } from './store';
import { normalizeTags } from '../lib/core';
import type { VaultConnection, VaultLog } from '../lib/types';
interface VaultRow {
    id: string;
    name: string;
    root_path: string;
    includes: string;
    excludes: string;
    status: string;
    last_sync: string | null;
    last_error: string | null;
}
interface Ref {
    id: string;
    item_id: string | null;
    relative_path: string;
    stable_id: string | null;
    file_hash: string;
    imported_hash: string;
    status: string;
}
export function parseNote(raw: string, relativePath: string) { const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/); const value = match ? parseYaml(match[1], { maxAliasCount: 30 }) : {}; const data: Record<string, unknown> = value && typeof value === 'object' && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : {}; const content = match ? raw.slice(match[0].length) : raw; const title = typeof data.title === 'string' ? data.title : content.match(/^#\s+(.+)$/m)?.[1] || path.basename(relativePath, '.md'); const frontTags = Array.isArray(data.tags) ? data.tags : typeof data.tags === 'string' ? data.tags.split(/[, ]/) : []; const inlineTags = [...content.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)].map(x => x[1]); return { raw, title, body: content, frontmatter: data, tags: normalizeTags([...frontTags.filter((x: unknown) => typeof x === 'string'), ...inlineTags]), links: [...content.matchAll(/!?\[\[([^\]#|]+)(?:[^\]]*)\]\]/g)].map(x => x[1]), stableId: typeof data.id === 'string' ? data.id : typeof data.uid === 'string' ? data.uid : null }; }
export function normalizeRule(rule: string) {
    const clean = rule.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (clean.split('/').some(s => s === '..' || s === '.') || /^[a-z]:/i.test(clean))
        throw new Error('Folder rules must be paths relative to the vault.');
    return clean;
}
export function allowedNote(relative: string, includes: string[], excludes: string[]) {
    const name = relative.replace(/\\/g, '/');
    const parts = name.split('/');
    if (parts.some(p => p.startsWith('.')) || !name.endsWith('.md'))
        return false;
    const match = (rule: string) => name === rule || name.startsWith(`${rule}/`);
    return (!includes.length || includes.some(match)) && !excludes.some(match);
}
function log(connectionId: string, kind: string, message: string) { run('INSERT INTO vault_logs VALUES(?,?,?,?,?)', uuid(), connectionId, kind, message.slice(0, 1200), now()); run('DELETE FROM vault_logs WHERE id NOT IN (SELECT id FROM vault_logs ORDER BY created_at DESC LIMIT 200)'); }
export async function connectVault(root: string, includes: string[] = [], excludes: string[] = ['Private']) {
    const absolute = await realpath(path.resolve(root));
    if (!(await lstat(absolute)).isDirectory())
        throw new Error('Select an existing vault directory.');
    if (!await lstat(path.join(absolute, '.obsidian')).catch(() => null))
        throw new Error('This folder is not an Obsidian vault (.obsidian directory not found).');
    const existing = one<VaultRow>('SELECT * FROM vault_connections WHERE user_id=?', OWNER);
    if (existing)
        throw new Error('Disconnect the existing vault before connecting another.');
    const id = uuid();
    run('INSERT INTO vault_connections(id,user_id,name,root_path,includes,excludes,created_at) VALUES(?,?,?,?,?,?,?)', id, OWNER, path.basename(absolute), absolute, JSON.stringify(includes.map(normalizeRule).filter(Boolean)), JSON.stringify(excludes.map(normalizeRule).filter(Boolean)), now());
    log(id, 'connected', 'Vault connected with read-only access.');
    return id;
}
export function vaultStatus(): VaultConnection | null {
    const r = one<VaultRow>('SELECT * FROM vault_connections WHERE user_id=?', OWNER);
    if (!r)
        return null;
    return { id: r.id, name: r.name, includes: JSON.parse(r.includes), excludes: JSON.parse(r.excludes), status: r.status, lastSync: r.last_sync, noteCount: one<{
            n: number;
        }>('SELECT count(*) n FROM vault_notes WHERE connection_id=? AND status<>\'deleted\'', r.id)?.n || 0, error: r.last_error, pending: one<{
            n: number;
        }>('SELECT count(*) n FROM vault_notes WHERE connection_id=? AND status=\'conflict\'', r.id)?.n || 0 };
}
export function vaultLogs(): VaultLog[] { return all<VaultLog>('SELECT id,kind,message,created_at createdAt FROM vault_logs ORDER BY created_at DESC LIMIT 30'); }
async function walk(root: string, dir: string, includes: string[], excludes: string[], files: string[] = []): Promise<string[]> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.isSymbolicLink())
            continue;
        const full = path.join(dir, entry.name), relative = path.relative(root, full).replace(/\\/g, '/');
        if (excludes.some(e => relative === e || relative.startsWith(`${e}/`)))
            continue;
        if (entry.isDirectory())
            await walk(root, full, includes, excludes, files);
        else if (entry.isFile() && allowedNote(relative, includes, excludes))
            files.push(relative);
        if (files.length > 5000)
            throw new Error('This local MVP supports up to 5,000 vault notes. Narrow included folders.');
    }
    return files;
}
export async function syncVault() {
    const connection = one<VaultRow>('SELECT * FROM vault_connections WHERE user_id=?', OWNER);
    if (!connection)
        throw new AppError(400, 'Connect a vault using the local companion first.');
    const cutoff = new Date(Date.now() - 120000).toISOString();
    const claimed = transaction(() => {
        const lease = one<{
            value: string;
        }>('SELECT value FROM runtime_state WHERE key=\'vault_lease\'');
        if (lease && lease.value > cutoff)
            return false;
        run('INSERT INTO runtime_state VALUES(\'vault_lease\',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', now());
        return true;
    });
    if (!claimed)
        throw new AppError(409, 'A synchronization is already running.');
    run('UPDATE vault_connections SET status=\'syncing\',last_error=NULL WHERE id=?', connection.id);
    try {
        const root = await realpath(connection.root_path), includes = JSON.parse(connection.includes), excludes = JSON.parse(connection.excludes);
        const files = await walk(root, root, includes, excludes);
        const seen = new Set<string>(), activeLinks: {
            id: string;
            links: string[];
        }[] = [];
        let imported = 0, changed = 0, renamed = 0, deleted = 0, conflicts = 0;
        const refs = all<Ref>('SELECT * FROM vault_notes WHERE connection_id=?', connection.id);
        for (const relative of files) {
            const file = path.join(root, relative);
            const resolved = await realpath(file);
            if (!resolved.startsWith(root + path.sep))
                throw new Error('A note resolved outside the selected vault.');
            const stat = await lstat(resolved);
            if (stat.size > 1000000) {
                log(connection.id, 'skipped', `${relative}: larger than the 1 MB note limit.`);
                continue;
            }
            let note: ReturnType<typeof parseNote>;
            const raw = await readFile(resolved, 'utf8');
            try {
                note = parseNote(raw, relative);
            }
            catch {
                log(connection.id, 'error', `${relative}: invalid YAML frontmatter. Original file was not changed.`);
                continue;
            }
            const digest = hash(raw);
            let ref = refs.find(r => r.relative_path === relative);
            if (!ref) {
                const matches = refs.filter(r => !seen.has(r.id) && !files.includes(r.relative_path) && ((note.stableId && r.stable_id === note.stableId) || r.file_hash === digest));
                if (matches.length === 1) {
                    ref = matches[0];
                    run('UPDATE vault_notes SET relative_path=?,obsidian_uri=? WHERE id=?', relative, `obsidian://open?vault=${encodeURIComponent(connection.name)}&file=${encodeURIComponent(relative)}`, ref.id);
                    renamed++;
                }
                else if (matches.length > 1) {
                    log(connection.id, 'conflict', `${relative}: ambiguous note identity. Add a unique id in frontmatter.`);
                    conflicts++;
                    continue;
                }
            }
            if (ref) {
                seen.add(ref.id);
                if (!ref.item_id)
                    continue;
                let local;
                try {
                    local = getItem(ref.item_id);
                }
                catch {
                    continue;
                }
                if (ref.file_hash === digest && ref.status !== 'deleted') {
                    activeLinks.push({ id: local.id, links: note.links });
                    continue;
                }
                if (local.contentHash !== ref.imported_hash) {
                    run('UPDATE vault_notes SET status=\'conflict\' WHERE id=?', ref.id);
                    log(connection.id, 'conflict', `${relative}: the imported copy and source both changed. Your copy and vault file were preserved. Open the item to resolve.`);
                    conflicts++;
                    continue;
                }
                const updated = updateItem(local.id, { title: note.title, content: raw, tags: note.tags, status: local.status === 'archived' ? 'saved' : local.status }, { sync: true });
                metadata(local.id, { ...local.metadata, vaultPath: relative, vaultName: connection.name, frontmatter: note.frontmatter, wikilinks: note.links, contentBasis: 'Obsidian Markdown source (read-only)' });
                run('UPDATE vault_notes SET file_hash=?,imported_hash=?,stable_id=?,last_synced_at=?,status=\'synced\' WHERE id=?', digest, updated.contentHash, note.stableId, now(), ref.id);
                activeLinks.push({ id: local.id, links: note.links });
                changed++;
            }
            else {
                try {
                    const item = createItem({ title: note.title, type: 'note', content: raw, source: 'Obsidian', status: 'saved', tags: note.tags }, { enrich: false });
                    metadata(item.id, { vaultPath: relative, vaultName: connection.name, frontmatter: note.frontmatter, wikilinks: note.links, contentBasis: 'Obsidian Markdown source (read-only)' });
                    const refId = uuid();
                    run('INSERT INTO vault_notes VALUES(?,?,?,?,?,?,?,?,?,?)', refId, connection.id, item.id, relative, note.stableId, digest, item.contentHash, `obsidian://open?vault=${encodeURIComponent(connection.name)}&file=${encodeURIComponent(relative)}`, now(), 'synced');
                    seen.add(refId);
                    activeLinks.push({ id: item.id, links: note.links });
                    imported++;
                }
                catch (error) {
                    if (error instanceof AppError && error.code === 'DUPLICATE')
                        log(connection.id, 'skipped', `${relative}: identical content already exists.`);
                    else
                        throw error;
                }
            }
        }
        for (const ref of refs) {
            if (seen.has(ref.id) || files.includes(ref.relative_path) || ref.status === 'deleted')
                continue;
            if (ref.item_id) {
                const local = getItem(ref.item_id);
                if (local.contentHash !== ref.imported_hash) {
                    run('UPDATE vault_notes SET status=\'conflict\' WHERE id=?', ref.id);
                    log(connection.id, 'conflict', `${ref.relative_path}: source removed; locally edited copy was preserved.`);
                    conflicts++;
                    continue;
                }
                updateItem(ref.item_id, { status: 'archived' }, { sync: true });
            }
            run('UPDATE vault_notes SET status=\'deleted\',last_synced_at=? WHERE id=?', now(), ref.id);
            deleted++;
        }
        const current = all<{
            item_id: string;
            relative_path: string;
        }>('SELECT item_id,relative_path FROM vault_notes WHERE connection_id=? AND item_id IS NOT NULL AND status<>\'deleted\'', connection.id);
        for (const source of activeLinks) {
            run('DELETE FROM relationships WHERE source_id=? AND type=\'links_to\' AND origin=\'ai\'', source.id);
            for (const link of source.links) {
                const targets = current.filter(r => r.relative_path.replace(/\.md$/, '') === link || path.basename(r.relative_path, '.md') === link);
                if (targets.length === 1 && targets[0].item_id !== source.id)
                    addRelation(source.id, targets[0].item_id, 'links_to', 'ai', 1);
            }
        }
        run('UPDATE vault_connections SET status=?,last_sync=?,last_error=NULL WHERE id=?', conflicts ? 'conflicts' : 'connected', now(), connection.id);
        log(connection.id, 'sync', `${imported} imported, ${changed} updated, ${renamed} renamed, ${deleted} archived, ${conflicts} conflicts. No vault files were written.`);
        return { imported, changed, renamed, deleted, conflicts };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Synchronization failed.';
        run('UPDATE vault_connections SET status=\'error\',last_error=? WHERE id=?', 'Vault could not be read. Check that the folder is accessible and review the companion terminal.', connection.id);
        log(connection.id, 'error', message.replaceAll(connection.root_path, '[selected vault]'));
        throw new AppError(422, 'Vault sync failed. Check the connection and companion logs.');
    }
    finally {
        run('DELETE FROM runtime_state WHERE key=\'vault_lease\'');
    }
}
export async function resolveVaultConflict(itemId: string, choice: 'source' | 'local') {
    const ref = one<Ref & {
        connection_id: string;
    }>('SELECT * FROM vault_notes WHERE item_id=? AND status=\'conflict\'', itemId);
    if (!ref)
        throw new AppError(404, 'No conflict was found for this note.');
    if (choice === 'local') {
        run('UPDATE vault_notes SET item_id=NULL,status=\'detached\' WHERE id=?', ref.id);
        metadata(itemId, { ...getItem(itemId).metadata, detachedFromVault: true });
        return;
    }
    const connection = one<VaultRow>('SELECT * FROM vault_connections WHERE id=?', ref.connection_id)!;
    const file = await realpath(path.join(connection.root_path, ref.relative_path));
    if (!file.startsWith((await realpath(connection.root_path)) + path.sep))
        throw new AppError(400, 'Invalid vault source.');
    const raw = await readFile(file, 'utf8'), parsed = parseNote(raw, ref.relative_path);
    const updated = updateItem(itemId, { title: parsed.title, content: raw, tags: parsed.tags }, { sync: true });
    run('UPDATE vault_notes SET file_hash=?,imported_hash=?,status=\'synced\',last_synced_at=? WHERE id=?', hash(raw), updated.contentHash, now(), ref.id);
}
export function disconnectVault() { run('DELETE FROM vault_connections WHERE user_id=?', OWNER); }
