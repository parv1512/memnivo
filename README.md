# Memnivo

A local-first personal memory workspace: capture links and notes, find them through cited conversational retrieval, connect an Obsidian vault, and follow through with durable reminders.

Memnivo 1.0 RC 1 is a single-owner local workspace with SQLite persistence and a separate companion process. There is no demo data in the real workspace.

## Run on this computer

Dependencies have already been installed in `D:\Memnivo`. With Node.js 24 or newer:

```powershell
cd D:\Memnivo
npm start
```

Open **http://127.0.0.1:3000**. Keep the terminal running for the app, reminders, enrichment, and vault sync. Stop with Ctrl+C. Double-click `Launch-Memnivo.cmd` on Windows for the same launcher.

After changing source, run `npm run build` before `npm start`. `npm run dev` rebuilds once and starts the service; it does not hot-reload source edits. Restart it after editing.

For a fresh checkout on another computer:

```powershell
npm ci
npm run build
npm start
```

No PostgreSQL server, cloud account, AI subscription, or Obsidian plugin is needed for capture, local retrieval, or reminders. Node 24 currently prints an experimental SQLite API warning; database migrations and persistence are tested with the installed Node 24.11 runtime.

## First use

1. Complete the short onboarding and enter your display name.
2. Use **Quick capture** or **Ctrl+Shift+N** to save a URL or thought. Add a reason if useful. Saving and an optional follow-up are committed together. Open a saved link to see whether its source details are queued, ready, or unavailable, and retry there if needed.
3. Review new captures in **Inbox**, edit their details, add tags, or attach a project. Your changes survive refreshes and restarts.
4. Search in **Library** or ask a question in **Ask AI**. Without a provider, answers show matching saved excerpts and real source cards.
5. Create an optional task or follow-up. Mark done, snooze, or dismiss it from **Tasks & reminders**.

The real workspace starts empty. Tests use separate temporary databases and vault fixtures.

## Implemented

- Responsive application shell and nine distinct destinations, collapsible desktop navigation, light/dark/system themes, configurable product name, onboarding, keyboard shortcuts, loading/errors/empty states.
- URL and Markdown/plain-text capture; note, video, repository, article, context, document, and code types; reason, tags, sensitivity, project and optional follow-up; canonical-link deduplication.
- Persistent library with full-text and topic matching, optional semantic retrieval, grid/list views, favorites, status/type/tag/project/date filters, saved searches, sorting, incremental display, bulk keep/archive/delete, detail editing, source links and activity.
- Persistent conversations, source citations and retrieval explanations, scoped search, copy, feedback, retry, honest no-match and provider-failure responses.
- Provider-independent OpenAI-compatible/Ollama adapter, server-only credentials, explicit consent, reviewable title/summary/tag suggestions, chunk hashes, incremental embeddings and hybrid scoring.
- Lightweight projects with goals, descriptions, connected resources and task progress. Opening or saving a project automatically shows up to three suggested links from your library. Add a specific goal or description to improve the matches. Task CRUD, priorities, due dates, linked resources, and weekly calendar.
- Durable reminder schedules, daily/weekly recurrence, explicit time zones, DST handling, snooze, completion, dismissal, quiet hours, per-day limits and notification history. Completion of a saved resource resolves linked reminders and tasks.
- In-app notification delivery while the browser is closed, through the running companion. Optional desktop alerts while the app is open, after browser permission.
- Permissioned read-only Obsidian companion; folder rules, frontmatter/tags/wikilinks, incremental imports, rename detection, changed/deleted files, conflict preservation/resolution, direct `obsidian://` links and sync logs.
- Interactive, bounded knowledge graph with item/project/topic/task nodes, relationship creation/removal, filtering, search, drag, zoom, reset and keyboard neighbor focus. Explicit and derived edges look different.
- Safe public GitHub repository/README, YouTube oEmbed and website metadata extraction, with manual fallback. Text/Markdown document imports, JSON exports and item imports from a prior export.
- Local sessions, same-origin mutation checks, loopback-only binding/host checks, parameterized SQL, foreign keys, input validation, rate limits, DNS-pinned safe fetch and redirect checks, escaped content, size/type limits, data export and deletion.

## Configure AI

Copy `.env.example` to `.env.local`, then select the provider and models supported by your account:

```dotenv
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=your-key
AI_MODEL=your-chat-model
AI_EMBEDDING_MODEL=your-embedding-model
```

For local Ollama:

```dotenv
AI_PROVIDER=ollama
AI_BASE_URL=http://127.0.0.1:11434/v1
AI_MODEL=an-installed-chat-model
AI_EMBEDDING_MODEL=an-installed-embedding-model
```

Start/install models separately in Ollama. Restart Memnivo after changing environment values. Open **Settings → AI providers**, enable consent, save preferences, and test the connection. Use **Memory & retrieval → Re-index** to queue embeddings for existing items. Leave `AI_EMBEDDING_MODEL` blank to use lexical retrieval with generated answers only.

### Project suggestions

Project suggestions combine keyword matches with saved-link embeddings when a local Ollama connection and an embedding model are configured. Use **Settings → Memory & retrieval → Re-index** for older links, then reopen the project after indexing finishes. When Ollama is unavailable, project suggestions use keywords and relevant attachment history.

Attaching a link records the project goal and the link as a useful example. Similar projects can give that link more weight. **Not relevant** hides a suggestion for the current project goal. This history is stored in the local database.

With consent enabled, selected non-private source snippets and the current question can be sent to the provider. Casual greetings and unfinished-work questions run locally. Enrichment sends up to 18,000 characters per item; embedding sends bounded chunks. Private items are excluded from those requests. A vault connection alone does not enable provider access. Conversation history is kept locally and is not automatically sent to the provider. Treat the provider's retention policy as a separate choice.

## Connect a real Obsidian vault

A browser does not receive arbitrary filesystem access. The companion requires an explicit local command from the project folder:

```powershell
npm run vault -- connect "C:\Users\you\Documents\YourVault" --include Notes,Projects --exclude Private,Journal
npm run vault -- status
npm run vault -- sync
```

The selected directory must have an `.obsidian` directory. Folder rules use vault-relative names, not full paths. Omit `--include` to index all eligible Markdown; `Private` is excluded by default. Hidden directories, symlinks and non-Markdown files are skipped. Each note is limited to 250,000 characters and 1 MB on disk; scanning is capped at 5,000 notes.

The worker synchronizes every minute while Memnivo runs. **Obsidian vault** shows actual state, errors, counters, rules, and a manual sync action. Wikilinks and attachment references remain raw Markdown; attachments themselves are not copied. Imported content is displayed as escaped text, not executable HTML.

Stable frontmatter `id` or `uid` values help identify notes across simultaneous edits and renames. Unchanged-content hashes provide a fallback. Ambiguous renames are reported. Source deletion archives the corresponding unedited imported copy; an independently edited copy is preserved as a conflict. If source and local content both change, open the item and choose **Use vault version** or **Keep my copy & detach**. Neither option writes a source file. Locally deleting/detaching an imported item suppresses reimport of that tracked source.

Changing folder exclusions stops future reads of those files. Earlier copies remain available in Memnivo. Disconnecting also keeps imported copies. Delete those copies in the library if you want to remove them. Connect another vault after disconnecting:

```powershell
npm run vault -- disconnect
```

## Background behavior

`npm start` launches the server and companion as separate child processes. Schedules and notification history live in SQLite, not frontend timers. The worker claims enrichment jobs with durable leases/retries and atomically records each reminder occurrence once. It recovers stale enrichment jobs after interruption. Ignored one-time reminders do not repeatedly notify.

The browser can close while the companion continues to record in-app reminders. This computer must remain on, and the companion must remain running. After downtime, due schedules are processed when the worker resumes, subject to quiet hours and daily limits. There is no service installed at OS startup, email/SMS delivery, closed-browser push, or wake-from-sleep guarantee. The worker status appears in the footer.

Recurring schedules preserve their wall-clock time across DST; nonexistent spring-forward times roll ahead with the gap. Quiet hours and budgets follow the workspace time zone. Date/time inputs are shown in the device time zone and stored as absolute UTC instants with the configured reminder zone.

## Data and security

`MEMNIVO_DATA_DIR` defaults to `.data` and contains `memnivo.sqlite`, WAL files and a session-signing key. Never commit or share this folder. Use the JSON export in **Settings → Privacy & data** for portable saved information. To back up the entire local workspace, stop the app and back up the whole data directory. Keep provider credentials separately in `.env.local`.

This is a local single-owner application, not a public SaaS authentication system. It binds to `127.0.0.1`; do not put it behind a public proxy or remove host/origin checks. Anyone with access to your unlocked operating-system account can access the workspace. The database is not encrypted at rest; use your operating system's disk protection. Raw vault root paths and secrets are not returned by API exports. Generic production errors avoid displaying stack traces or secret provider responses.

**Delete all my data** clears the database records, checkpoints the WAL, and compacts the database. Original vault/source files and `.env.local` are untouched. Deleting one item removes its chunks, source citations and linked reminders; independent conversation text can still refer to past discussions until the conversation is deleted. SQLite logical deletion is not a forensic erasure guarantee for SSDs, filesystem snapshots, or external backups.

## Back up and restore a workspace

Use **Settings → Privacy & data → Export my data** for portable JSON. **Library → Import** can bring the saved items back from that export. The item importer clears project assignments and skips duplicates. It does not restore projects, tasks, reminders, conversations, settings, or vault connections.

To back up everything in the local workspace, stop both the app and companion with Ctrl+C and wait for them to exit. Close any separate worker or vault sync command. Then copy the entire data folder, including any SQLite WAL files and the session key, to a new backup directory. Substitute your own data directory if you configured `MEMNIVO_DATA_DIR`.

```powershell
$backup = Join-Path $env:USERPROFILE ("Memnivo-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
Copy-Item -LiteralPath .data -Destination $backup -Recurse -ErrorAction Stop
```

To check or restore the backup, copy it to a fresh directory and launch Memnivo with that copy. The current data directory and backup remain available. Run these commands from the Memnivo folder after stopping the app and companion.

```powershell
$restored = Join-Path $env:USERPROFILE ("Memnivo-restored-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
Copy-Item -LiteralPath $backup -Destination $restored -Recurse -ErrorAction Stop
$env:MEMNIVO_DATA_DIR = $restored
npm start
```

Set `$backup` to the absolute path of your backup if you opened a new terminal. Open the workspace and check your project, reminders, and a cited answer. To return to the default `.data` workspace, stop the restored instance and open a fresh terminal without the override. Keep your `.env.local` credentials and original Obsidian vault backed up separately. A restored vault connection still points to the original folder path on disk.

## Architecture and layout

The original preferred Next.js stack could not be installed: the build environment could not resolve npm, and the offline cache lacked Next.js and Windows native bundler binaries. The delivered app therefore uses React 19, strict TypeScript, Radix UI dialogs, Lucide icons, React Hook Form, Zod, a native Node HTTP API and SQLite FTS5. A portable TypeScript build assembles browser CommonJS modules without native tooling. Dependencies are pinned and locked. There is no runtime CDN dependency.

The typed SQL storage layer and numbered migrations avoid an additional ORM/native-driver dependency. WAL, foreign keys, unique constraints, FTS triggers and content hashes provide the foundation for future migration to PostgreSQL. CSS tokens implement the requested visual system without requiring a Tailwind build binary. The graph uses a small bounded SVG renderer because React Flow was unavailable in the cache. These are documented technical choices, not claims that the requested libraries were installed.

```text
src/client/       React shell, views, dialogs, design system
src/lib/          Shared types, classification, validation, time utilities
src/server/       HTTP/API, persistence, retrieval, AI, safe fetch, vault, reminders
migrations/       Versioned normalized SQLite schema and FTS indexes
scripts/          Build, launcher, companion, migrations, vault CLI, checks
tests/            Unit, integration and server-rendering tests
docs/             Implementation plan, API reference, verification/limitations
```

## Checks

```powershell
npm run check       # strict TypeScript + source safety/syntax checks + automated tests
npm run test:e2e    # complete API workflow and a separate-process persistence check
npm run build       # type-checked production assets and server build
```

`lint` is a focused syntax/unsafe-render check, not ESLint. `test:e2e` invokes the API handler with real Request objects and SQLite; it is not a browser/HTTP socket test. Automated fixtures never use the real workspace. The delivered build passed these checks; see `docs/VERIFICATION.md` for precise results and limits.

## Current limits

- Live Ollama, webpage extraction, GitHub README extraction, and YouTube metadata were tested with public or disposable examples. Network errors can still prevent an individual source from being fetched.
- Desktop Chrome verified the core save → find → act journey. All nine destinations were also tested at 390 px. Release signoff still depends on real use and pilot feedback.
- Vault sync was tested against real Markdown files in an isolated vault fixture, including change, rename, deletion and conflict handling. Your own vault and an installed Obsidian application must still be connected and verified by you.
- No cloud account, multi-device sync, Obsidian write-back, browser extension, automatic video transcripts, PDF/DOCX binary extraction, or executable code ingestion. Document references and UTF-8 Markdown/text imports work. YouTube descriptions/summaries explicitly distinguish metadata from transcript content.
- Local library snapshots/retrieval cover the latest 1,000 items; search uses up to 10,000 stored vector chunks. Exports include all saved items. Graph rendering is capped at 120 visible nodes. This is intended for a coherent local MVP, not a large hosted organization.
- Projects have goals, descriptions, attached notes/resources and tasks; dedicated milestone entities, enterprise project management, and saved filter configurations beyond query text are deferred.
- The JSON import restores saved items with project assignments cleared; it does not restore the entire workspace relational history. The full JSON export retains projects, tasks, conversations and relationships for portability.

Branding is configurable; no legal availability claim is made for the name or any domain.
