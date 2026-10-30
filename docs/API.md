# Local API contract

All API routes return JSON. Error shape: `{ "error": { "code": "...", "message": "...", "detail": {} } }` (detail optional). The HTTP adapter bounds JSON request bodies at 1.1 MB. Inputs are validated with Zod and IDs use UUIDs.

The server binds only to loopback, rejects non-loopback Host headers, and refuses cross-site requests. Mutations require a matching Origin. All routes except health/session require the signed HttpOnly `memnivo_session` cookie. This identifies the one local workspace, not a client-supplied account ID. There is no cloud tenant API.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Process health and app version |
| POST | `/api/session` | Same-origin local session establishment |
| GET | `/api/snapshot` | Current bounded workspace state, preferences, provider status and worker heartbeat |
| GET | `/api/items` | Query items; parameters `q`, `type`, `status`, `tag`, `project`, `from`, `to`, `archived`, `limit` (max 100), `offset` |
| POST | `/api/items` | Validated capture; duplicate conflict returns existing item ID |
| GET | `/api/items/:id` | Item, source/vault reference, activity and enrichment-job state |
| PATCH | `/api/items/:id` | Partial saved-item edit, including tags and project assignment |
| DELETE | `/api/items/:id` | Delete item and its dependent index/source/reminder records |
| POST | `/api/projects` | Create project |
| PATCH, DELETE | `/api/projects/:id` | Update/delete project; linked items/tasks survive deletion |
| POST | `/api/tasks` | Create task |
| PATCH, DELETE | `/api/tasks/:id` | Edit/complete/delete task |
| POST | `/api/reminders` | Schedule explicit follow-up, linked to item/task if desired |
| PATCH | `/api/reminders/:id` | `{action: snooze|complete|dismiss|reschedule, until?: ISO instant}` |
| DELETE | `/api/reminders/:id` | Remove schedule and notification history |
| PATCH | `/api/notifications[/:id]` | Mark one/all local notifications read |
| POST | `/api/chat` | `{question, conversationId?, scope: all|project|item, scopeId?}` → persisted messages/citations |
| GET, DELETE | `/api/conversations/:id` | Fetch/delete conversation |
| PATCH | `/api/feedback/:messageId` | `{value: -1|0|1}` |
| POST | `/api/relationships` | Explicit validated link between saved items |
| DELETE | `/api/relationships/:id` | Remove a link |
| PUT | `/api/preferences` | Validate/persist the complete preference object |
| POST | `/api/provider-test` | Test configured provider after consent; contains no saved content |
| POST | `/api/enrich/:itemId` | Queue supported metadata / AI suggestion extraction |
| POST | `/api/suggestions/:itemId` | `{action: apply|dismiss}` review of suggested metadata |
| POST | `/api/reindex` | Rebuild local chunks and queue missing embeddings |
| POST | `/api/vault` | Run sync for the CLI-authorized vault |
| PATCH | `/api/vault` | Update relative include/exclude rules; cannot select arbitrary root paths |
| PATCH | `/api/vault/:itemId` | Resolve conflict `{choice: source|local}` |
| DELETE | `/api/vault` | Disconnect without changing source files |
| POST, DELETE | `/api/saved-searches[/:id]` | Save/remove query text |
| POST | `/api/import` | `{filename, content}`; `.md`, `.txt`, or Memnivo `.json`; 1 MB text cap |
| GET | `/api/export` | Portable JSON without secrets or absolute vault roots |
| DELETE | `/api/data` | Explicit confirmation string `DELETE ALL MY DATA`; clears the local workspace |

Mutations have an in-process limit of 180/minute, chat 12/minute, provider tests 5/minute, session bootstrap 60/minute. These are local application protections, not a distributed production rate limiter.

`src/lib/types.ts` is the response model and `src/lib/validation.ts` defines core input models. Snapshot list limits and retrieval behavior are documented in README. Worker jobs, notifications, and conversations all use the same real SQLite database.
