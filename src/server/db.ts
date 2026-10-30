import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import type { Preferences } from '../lib/types';
export const OWNER = 'local-owner';
export const now = () => new Date().toISOString();
export const uuid = () => randomUUID();
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function dataDirectory(): string { return path.resolve(process.env.MEMNIVO_DATA_DIR || '.data'); }
const globalDB = globalThis as unknown as {
    memnivoDB?: DatabaseSync;
    memnivoDBPath?: string;
};
export function database(): DatabaseSync {
    const dir = dataDirectory();
    const target = path.join(dir, 'memnivo.sqlite');
    if (globalDB.memnivoDB && globalDB.memnivoDBPath === target)
        return globalDB.memnivoDB;
    mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(target);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;');
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    for (const file of readdirSync(path.resolve('migrations')).filter(f => /^\d+.*\.sql$/.test(f)).sort()) {
        const version = Number(file.split('_')[0]);
        if (!db.prepare('SELECT version FROM schema_migrations WHERE version=?').get(version)) {
            db.exec('BEGIN IMMEDIATE');
            try {
                db.exec(readFileSync(path.join('migrations', file), 'utf8'));
                db.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(version, now());
                db.exec('COMMIT');
            }
            catch (error) {
                db.exec('ROLLBACK');
                throw error;
            }
        }
    }
    db.prepare('INSERT OR IGNORE INTO users(id,display_name,preferences,created_at,updated_at) VALUES(?,?,?,?,?)').run(OWNER, 'You', JSON.stringify(defaultPreferences()), now(), now());
    globalDB.memnivoDB = db;
    globalDB.memnivoDBPath = target;
    return db;
}
export function defaultPreferences(): Preferences { return { displayName: 'You', appName: process.env.MEMNIVO_APP_NAME || 'Memnivo', theme: 'dark', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', onboarded: false, aiConsent: false, aiSuggestions: true, maxReminders: 5, snoozeMinutes: 60, quietStart: '22:00', quietEnd: '08:00', desktopNotifications: false, dailyReview: true }; }
export function all<T>(sql: string, ...params: SQLInputValue[]): T[] { return database().prepare(sql).all(...params) as unknown as T[]; }
export function one<T>(sql: string, ...params: SQLInputValue[]): T | undefined { return database().prepare(sql).get(...params) as unknown as T | undefined; }
export function run(sql: string, ...params: SQLInputValue[]) { return database().prepare(sql).run(...params); }
export function transaction<T>(fn: () => T): T {
    const db = database();
    if (db.isTransaction)
        return fn();
    db.exec('BEGIN IMMEDIATE');
    try {
        const result = fn();
        db.exec('COMMIT');
        return result;
    }
    catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}
export function preferences(): Preferences {
    const row = one<{
        preferences: string;
    }>('SELECT preferences FROM users WHERE id=?', OWNER);
    return { ...defaultPreferences(), ...JSON.parse(row?.preferences || '{}') };
}
export function setPreferences(p: Preferences) { run('UPDATE users SET display_name=?,preferences=?,updated_at=? WHERE id=?', p.displayName, JSON.stringify(p), now(), OWNER); return p; }
export function activity(itemId: string | null, action: string) { run('INSERT INTO activities VALUES(?,?,?,?,?)', uuid(), OWNER, itemId, action, now()); }
