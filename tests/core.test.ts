import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, normalizeTags, normalizeUrl, intentFrom, cosine, inQuietHours, nextOccurrence } from '../src/lib/core';
import { itemInput, reminderInput } from '../src/lib/validation';
import { publicAddress, assertOrigin, validSession, issueSession } from '../src/server/security';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.MEMNIVO_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'memnivo-core-'));
test('URL classification is based on exact hosts and supported sources', () => { assert.equal(classify('https://github.com/openai/openai-python'), 'repository'); assert.equal(classify('https://youtu.be/abc123'), 'video'); assert.equal(classify('https://youtube.com.attacker.example/watch?v=x'), 'article'); assert.equal(classify('https://example.com/file.pdf'), 'document'); assert.equal(classify('```python\nprint(1)\n```'), 'code'); assert.equal(classify('A useful thought'), 'note'); });
test('URLs drop tracking but preserve identity and reject credentials', () => { assert.equal(normalizeUrl('https://Example.com/post/?utm_source=chat&b=2#a'), 'https://example.com/post?b=2'); assert.equal(normalizeUrl('javascript:alert(1)'), null); assert.equal(normalizeUrl('https://user:pass@example.com'), null); assert.equal(normalizeUrl('not a url'), null); });
test('tags normalize and deduplicate consistently', () => assert.deepEqual(normalizeTags([' #AI ', 'ai', 'Machine Learning', '', 'RAG']), ['ai', 'machine-learning', 'rag']));
test('intent detection suggests without treating every link as a task', () => { assert.ok(intentFrom('I need to watch this video')); assert.ok(intentFrom('read this tomorrow')); assert.equal(intentFrom('interesting article about databases'), null); });
test('validation rejects unsupported types, oversized tags and invalid zones', () => { assert.equal(itemInput.safeParse({ title: '', type: 'alien' }).success, false); assert.equal(itemInput.safeParse({ title: 'Valid', type: 'note', tags: ['x'.repeat(61)] }).success, false); assert.equal(reminderInput.safeParse({ title: 'Watch', dueAt: new Date().toISOString(), timezone: 'Not/AZone' }).success, false); });
test('quiet hours wrap midnight in an explicit timezone', () => { assert.equal(inQuietHours(new Date('2026-10-29T03:00:00Z'), 'America/New_York', '22:00', '08:00'), true); assert.equal(inQuietHours(new Date('2026-10-29T16:00:00Z'), 'America/New_York', '22:00', '08:00'), false); assert.equal(inQuietHours(new Date(), 'UTC', '00:00', '00:00'), false); });
test('daily recurrence retains wall time across US DST', () => { assert.equal(nextOccurrence('2026-10-31T13:00:00.000Z', 'daily', 'America/New_York'), '2026-11-01T14:00:00.000Z'); });
test('a recurrence in the spring DST gap rolls forward to the next valid hour', () => { assert.equal(nextOccurrence('2027-03-13T07:30:00.000Z', 'daily', 'America/New_York'), '2027-03-14T07:30:00.000Z'); });
test('cosine rejects incompatible vectors and measures matching meaning vectors', () => { assert.equal(cosine([1, 0], [1, 0]), 1); assert.equal(cosine([1, 0], [0, 1]), 0); assert.equal(cosine([1], [1, 0]), 0); });
test('SSRF checks reject private, loopback, reserved and mapped addresses', () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '172.16.2.4', '192.168.1.1', '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1'])
        assert.equal(publicAddress(ip), false, ip);
    assert.equal(publicAddress('8.8.8.8'), true);
    assert.equal(publicAddress('2606:4700:4700::1111'), true);
});
test('authorization rejects foreign host and CSRF origins; signed sessions detect tampering', () => { assert.throws(() => assertOrigin(new Request('http://127.0.0.1:3000/api/items', { method: 'POST', headers: { host: 'evil.example', origin: 'http://evil.example' } }))); assert.throws(() => assertOrigin(new Request('http://127.0.0.1:3000/api/items', { method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'https://evil.example' } }))); assertOrigin(new Request('http://127.0.0.1:3000/api/items', { method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } })); const session = issueSession(); assert.ok(validSession(session)); assert.equal(validSession(session + 'x'), false); assert.equal(validSession(undefined), false); });
