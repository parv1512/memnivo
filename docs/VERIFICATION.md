# Memnivo 1.0 release candidate verification

November 15, 2026 · `1.0.0-rc.1` · Windows, Node.js 24.11.1 and SQLite

The v0.9 baseline passed 36 tests before the v1.0 fixes. The tests created fresh workspaces and a disposable Obsidian vault.

| Check | Result | Evidence |
| --- | --- | --- |
| Installation and build | PASS | Clean dependency install from the lockfile, 42 automated tests, 16-call API workflow, and production build. The HTTP health endpoint reported `1.0.0-rc.1`. The server and companion also started concurrently against an empty data directory. |
| Browser and persistence | PASS | In a fresh Chrome profile at 1366 px, completed onboarding, opened Quick capture with the keyboard, verified focus and Escape, saved a note, restarted the server, asked a question, opened the cited note, attached it to a project, and completed a task. A greeting returned no sources. |
| Automatic project suggestions | PASS | In Chrome, a new project surfaced a saved website with supporting evidence, skipped an unrelated link, and updated after a new link was saved or attached. The suggestion panel also fit the 390 px layout. |
| Narrow layout | PASS | All nine destinations fit the 390 px viewport. Opened the navigation and capture dialog. No JavaScript exceptions or console errors occurred during the browser workflow. |
| Capture and public source details | PASS | Live HTTP saves fetched a public W3C page, a GitHub repository README, and YouTube oEmbed metadata. The YouTube record identified the metadata-only coverage. Regression tests covered fetch failure and recovery, edited text, obsolete responses after URL changes, canonical duplicates, and atomic capture with a follow-up. |
| Retrieval and AI | PASS | Provider-free cited retrieval, filtered Library search, honest no-match results, private-item exclusions, a blocked request with consent disabled, and actionable feedback for a controlled provider HTTP 401. A live Ollama run with Gemma 3 4B produced a cited answer and mxbai-embed-large generated a 1,024-dimensional vector. |
| Reminders | PASS | A running companion recorded an in-app reminder with Chrome closed. With the companion stopped, a later reminder waited and was recorded once after restart. Another reminder arrived while a 14-second enrichment request was still running. Automated checks cover quiet hours, budgets, recurrence, DST, snooze, completion and offsets on older records. |
| Obsidian | PASS | A disposable vault verified selection, import, unchanged files, rename, edits, conflict resolution, source deletion, a large skipped note, exclusion and disconnect. Imported copies survived exclusion and disconnect. Source files were read-only. |
| Ownership and recovery | PASS | Markdown import, portable JSON import and rollback, export, and deletion tested. A stopped workspace was copied and opened from a new data directory. The copy retained items, projects, completed tasks, notifications, and conversations. |

YouTube oEmbed timed out on an initial attempt. The release candidate retrieved metadata from the same public video through its companion on a subsequent run. Source availability still depends on the external service.

## Release checkpoint

**Ready for review.** The app uses the existing SQLite schema. See the [backup and restore steps](../README.md#back-up-and-restore-a-workspace) for the full workspace recovery procedure.

Personal usage and pilot feedback remain open. The roadmap calls for five real save → find → act journeys over about a week and a small initial group completing that workflow. The user's actual Obsidian vault and operating-system desktop notification delivery were outside these checks.

## Try the core workflow

1. Start Memnivo with `npm start` and open `http://127.0.0.1:3000`.
2. Save a note or link you expect to use for an actual task. Add a follow-up if you want to revisit it.
3. Ask a specific question about what you saved. Open the cited record and check the source details.
4. Attach the record to a project. Create a task, take the next step, and mark it complete.
