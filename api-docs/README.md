# MOS integration API (v1)

A small, versioned set of operations for scripts and agents that read and change Work records in
MOS as a signed-in person. Every call runs with that person's own session, so it can do exactly
what the person can do in the app and nothing more. Archiving, deleting, permissions, Objective
settings and money are refused with "Do this in MOS.".

| File | What it is |
|---|---|
| [reference.md](reference.md) | Every operation, its parameters and errors. Generated from the database; do not edit. |
| [seeding-guide.md](seeding-guide.md) | Step-by-step guide for an agent (for example Claude Cowork) that seeds Tasks, Signals and Projects & Processes. |
| [mos-session.sh](mos-session.sh) | Shell helper: sign in with a prompt, call operations, keep the token in memory only. |

Placeholders used throughout: `<SUPABASE_URL>` is the data API base URL, `<ANON_KEY>` the project's
public anon key, `<ACCESS_TOKEN>` your session token. Get the first two from whoever runs your MOS
environment.

## Calling an operation

Each operation is a database function in the `api_v1` schema, served by the data API:

```sh
curl -sS -X POST "<SUPABASE_URL>/rest/v1/rpc/whoami" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -H "Content-Profile: api_v1" -H "Accept-Profile: api_v1" \
  -d '{}'
```

- The body is one JSON object of named parameters. `{}` for none.
- `Content-Profile: api_v1` and `Accept-Profile: api_v1` select the schema. Send both.
- Every operation returns one JSON value: an envelope described below.
- Dates are `YYYY-MM-DD`; timestamps are ISO 8601 with a time zone.

## Signing in

Sign in as yourself with your own email and password, once per session:

```sh
curl -sS -X POST "<SUPABASE_URL>/auth/v1/token?grant_type=password" \
  -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" \
  --data-binary @- <<< '{"email":"<EMAIL>","password":"<PASSWORD>"}'
```

Typing a password in a command line stores it in shell history, so prefer the helper below. The
response holds `access_token` (use it as `<ACCESS_TOKEN>`, valid about an hour) and
`refresh_token` (exchange it for a new pair with `grant_type=refresh_token`). Keep both in memory:
never in a file, a chat message or a log. [mos-session.sh](mos-session.sh) does all of this and
prompts for the password with hidden input.

## Responses

- List reads return `{ "items": [...], "next_cursor": <string|null> }`.
- Single reads and edits return `{ "item": {...} }`; creates also return `"replayed": <bool>`.
- `item` on a write is the record as the matching `get_*` returns it after the change.
- Callers must ignore fields and enum values they do not know: v1 may add them.

Record fields (a field a person cannot read is absent because the row is):

- Task: `id`, `title`, `status` (`Open`, `In Progress`, `Blocked`, `Done`), `team_id`,
  `business_unit_id`, `responsible_person_id`, `accountable_person_id`, `consulted_person_ids`,
  `informed_person_ids`, `description`, `due_date`, `objective_id`, `work_line_id`, `archived_at`,
  `completed_at`, `last_activity_at`, `created_by`, `created_at`, `updated_at`. `get_task` adds
  `checklist`, `events`, `comments` and `signal_ids`.
- Signal: `id`, `body`, `attention` (`FYI`, `Needs attention`, `Urgent`), `category`, `occurred_at`,
  `author_id`, `audience`, `owning_team_id`, `source`, `retracted_at`, `retract_reason`, `edited_at`,
  `created_at`, `updated_at`. `get_signal` adds `mentions`, `comments`, `task_ids` and
  `acknowledged_by_me`.
- Project/Process: `id`, `name`, `type` (`project`, `process`), `objective_id`, `business_unit_id`,
  `accountable_person_id`, `responsible_person_id`, `archived_at`, `created_at`, `updated_at`.

## Errors

Errors from an operation carry `{ "code", "message", "details", "hint" }`. `details` is the stable
machine code to branch on; `message` is text a person can read; `hint` names the offending input
field (empty or null when there is none). The HTTP status equals the last two digits of `code`.

| `details` | HTTP | Meaning | What to do |
|---|---|---|---|
| `invalid_input` | 400 | Unknown key, wrong type, over a length or count limit, or a value the record refuses. `hint` names the field. | Fix the input and send again. Retrying unchanged fails again. |
| `forbidden` | 403 | You are not allowed to do this in MOS. A rule's own text is passed through (for example who may be person in charge). | Do not retry. Tell the person; they may need someone else to do it. |
| `refused.*` | 403 | A refused kind of change (below). | Do not retry. Tell the person to do it in MOS. |
| `not_found` | 404 | The record does not exist or you cannot read it. The two look the same. | Check the id. Do not probe. |
| `conflict` | 409 | `expected_updated_at` no longer matches. | Read the record again, re-apply your change, send again. |
| `rate_limited` | 429 | The write budget (60 writes per rolling minute per person) is spent. | Wait about a minute, then retry. |

Errors raised before an operation runs keep the data API's own body (`code` such as `PGRST...`,
with a `message`):

| Status | When | What to do |
|---|---|---|
| 401 | The session token is missing, invalid or expired (`JWT expired`). | Refresh or sign in again. |
| 404 with a `PGRST202` code | No operation with that name and those parameter names: a typo, an unknown parameter, or a required parameter left out. | Compare with [reference.md](reference.md). |

## Refused actions

These are refused with HTTP 403; `details` is the code and `message` is the text, verbatim:

| `details` | Message |
|---|---|
| `refused.archive` | Archiving, restoring and retracting can't be done through the API or an agent. Do this in MOS. |
| `refused.delete` | Deleting can't be done through the API or an agent. Do this in MOS. |
| `refused.targets` | Objective settings and key-result targets can't be changed through the API or an agent. Do this in MOS. |
| `refused.permissions` | People, roles and access can't be changed through the API or an agent. Do this in MOS. |
| `refused.money` | Money can't be read or changed through the API or an agent yet. Do this in MOS. |

An edit whose `changes` include `archived`, `archived_at`, `retracted`, `retracted_at` or
`retract_reason` is refused as `refused.archive`; a Signal edit that changes audience, owning team
or mentions is refused as `refused.permissions`. The operation `refused_action` exists so an agent
asked for one of these can answer with the fixed refusal instead of guessing.

## Pagination

`limit` defaults to 50 and is capped at 100. `next_cursor` is opaque: pass it back as `cursor`
with the same filters to get the next page; `null` means the last page.

## Safe retries and concurrent edits

- **Idempotency keys.** Creates accept an optional `idempotency_key` (1 to 200 characters). The same
  person repeating an operation with the same key within 24 hours gets the first result back with
  `"replayed": true` and nothing new is created. Use a key that is stable for one intended record
  (for example `seed-<batch>-<row>`) and never reuse it for a different record.
- **`expected_updated_at`.** Edits accept the `updated_at` you read; if the record has changed since,
  the edit is a `conflict` and changes nothing.
- **Write budget.** Each person may make 60 writes per rolling minute across the API and agents.
  Reads do not count; a rejected write does not count.

## Versioning

The contract of v1 is each operation's name, parameter names and types, and the returned fields.
Allowed inside v1: new operations, new optional parameters, new returned fields, new enum values.
Anything else ships as `api_v2` beside `api_v1`.

## Not in v1 yet

Objective reads and write-ups, record history, comments, Signal acknowledgement, starting or
closing a process run, and Café and money records. Operations for these are added later.
