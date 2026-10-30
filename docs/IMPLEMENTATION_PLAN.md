# Memnivo implementation plan

## Architecture
Local-first, single-owner React application with strict TypeScript, CSS design tokens, accessible Radix dialogs, Lucide icons, React Hook Form, and a bounded interactive SVG graph. A typed Node HTTP server uses Node 24's bundled SQLite driver, parameterized SQL, versioned migrations, foreign keys, WAL, and FTS5. This avoids a native database dependency and a required cloud account. PostgreSQL/cloud sync are outside this local MVP. Bind only to 127.0.0.1; no public deployment of the local filesystem service.

**Documented technical constraint:** the executor cannot resolve the npm registry, and its offline cache lacks Next.js, React Flow, and Windows native bundler binaries. The app therefore uses a small TypeScript/CommonJS browser build script and native Node HTTP server. All UI modules are real React; this is not a static prototype. No unsupported hosted deployment is attempted. The dependency lockfile and scripts also support ordinary online installation elsewhere.

## Structure
- `src/client`: shell and route-specific React views.
- `src/components`: navigation, capture, details, views, graph, controls.
- `src/lib`: shared types, validation, URL parsing.
- `src/server`: database, storage, retrieval, AI adapters, safe metadata, auth, vault sync, reminder jobs.
- `migrations`: normalized schema, FTS, indexes, deletion behavior.
- `scripts`: companion worker, migrations, permissioned vault setup.
- `tests`: unit/integration tests using isolated databases and fixture vaults; browser workflow.

## First vertical slice
Capture a URL/note with optional intention → normalize/deduplicate → transactional SQLite persistence → real library query → detail/edit/archive/delete → restart durability. No sample records are inserted.

## Remaining milestones
1. Projects, tasks, reminders, settings and onboarding.
2. Lexical + optional provider embeddings; grounded conversation persistence and source citations. Provider errors fall back explicitly to saved excerpts. Selected snippets only leave the computer after consent; private items are excluded.
3. CLI-selected vault with folder rules, read-only incremental Markdown imports, stable frontmatter/path/content identity, rename/delete tracking and conflict preservation. Worker provides continuous polling while running.
4. Separate worker leases reminder jobs in SQLite, respects time zone/quiet hours/daily budget, records one notification per scheduled occurrence, supports snooze/completion/dismissal/recurrence. In-app notifications survive browser closure. Computer and worker must remain running.
5. Bounded interactive relationship graph, safe GitHub/YouTube metadata, Markdown/text imports, exports.

## Security and validation
Same-origin, loopback-only APIs with HttpOnly signed local sessions; no account or cloud identity claims. Zod input validation, safe fetch with DNS-pinned public IPs and revalidated redirects, file size/type caps, escaped text/Markdown, provider credentials only in environment. No arbitrary HTTP filesystem paths. Vault configuration uses explicit CLI permission. No write-back to source notes.

## Verification
TypeScript, ESLint, production build, unit/integration tests for capture, normalization, SSRF, auth, retrieval, citations, jobs, vault mutations/conflicts and deletion. End-to-end capture/reminder/chat/edit workflow and responsive QA. Real installed Obsidian and paid provider requests require user configuration and must be reported separately from fixture tests.
