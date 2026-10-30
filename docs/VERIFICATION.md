# Verification

Verified on Windows with Node.js 24.11.1 and SQLite 3.50.4, October 29, 2026.

## Executed checks

- `npm run typecheck`: strict TypeScript.
- `npm run lint`: source syntax and unsafe-render checks (a focused custom check, not ESLint).
- `npm test`: **29 tests passed**, covering unit behavior, database integration, controlled AI/embedding, local filesystem vault, and server-rendered screens.
- `npm run test:e2e`: 16 API endpoint calls exercising session setup, preferences, project creation, YouTube URL capture, reason persistence, reminder creation, cited natural-language retrieval, snooze, completion, archive, export and deletion. A separate Node process reopens the database to verify restart persistence.
- `npm run build`: type-checked browser and server production artifacts. No runtime CDN dependencies. The browser bundle is approximately 2.8 MB before gzip.
- Server and companion launched successfully and reported readiness on the isolated QA port. No real user data was inserted.

Important coverage includes exact-host URL classification, URL normalization/deduplication, tag normalization, server input validation, intent prompts, quiet hours, daily budgets, one-time notification behavior, recurring schedules across DST transitions, SSRF address rejection, origin/session protection, linked task/reminder completion, SQL foreign-key integrity, incremental chunk indexing, real retrieval citations, honest no-match responses, private AI exclusions, invalid AI source rejection, metadata suggestion review, and export/deletion.

The vault fixture is an actual directory with an `.obsidian` marker and Markdown files. Tests import selected folders, preserve raw source bytes, retain unchanged chunk identity, follow a rename, process edits/deletions, preserve conflicting source/local copies, and resolve a conflict by an explicit choice. These tests use disposable fixtures in the writable project area, not the user's real notes.

Each of the nine navigation destinations renders distinct content in server-rendering tests, including meaningful empty states. A separate escaping test ensures a saved `<script>` title renders as text.

## Not verified in this environment

- Live browser UI: in-app browser attachment failed with a session-binding error; desktop browser attachment failed with `foreground window did not report a process id`. Therefore visual screenshots, real responsive overflow, pointer/keyboard interactions, browser console and live client mount are **not** marked passed.
- Loopback HTTP smoke tests from the executor: outbound socket connections, including `127.0.0.1`, were denied by the sandbox with `EACCES`. API tests call the same validated handler directly. Starting the listener is not claimed as a successful browser request.
- Paid/live AI providers, public metadata endpoints, real external API rate limits and local Ollama requests: credentials/outbound access were unavailable. Provider boundaries are tested using controlled responses.
- The user's actual Obsidian vault or an installed Obsidian app: a vault must be explicitly selected using the companion CLI. Fixture tests do not substitute for testing that particular vault.
- OS background service installation, closed-browser push, email/SMS delivery, cloud identity/sync, PDF/DOCX binary extraction and Obsidian write-back: not implemented and not claimed.

## Manual acceptance checklist

On a normal local terminal, run `npm start`, then open `http://127.0.0.1:3000`:

1. Complete onboarding; capture a YouTube link with a reason and optional follow-up.
2. Refresh, open Inbox, edit the title/notes/tags and move the item to the library.
3. Ask about the saved video; inspect the cited saved record and open its original source.
4. Snooze the reminder, mark the video completed, and confirm the reminder resolves.
5. Create a project, attach the video, and add/complete a task.
6. Connect a small test vault with include/exclude folders; change, rename and delete a source note and inspect sync status.
7. Compare light/dark modes and check desktop/tablet/mobile widths, dialog focus/Escape, capture shortcut, graph drag/focus, loading states, network failures and browser-console errors.
8. Export JSON, stop and restart the app, and confirm data remains. Use disposable test data when checking deletion.

This is a local MVP implementation with explicit limits, not a certification of production readiness or cloud security.
