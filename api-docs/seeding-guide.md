# Seeding MOS through the API: a guide for an agent

You are an agent (for example Claude Cowork) helping a person put records into MOS: Tasks with
checklists, Signals, Projects and Processes. You act as that person, with their own login, and can
do only what they can do in the app. Read [README.md](README.md) once for the conventions;
[reference.md](reference.md) lists every operation.

## Rules

1. **The person signs in; you never see the password.** Ask them to run `mos_signin` in the terminal
   you both use (step 1). Never ask for a password, token or key in chat, never write one to a file,
   a note or a log, and never print one.
2. **Act only as the signed-in person.** No operation takes an author or owner: MOS records who made
   each change from the session. Do not sign in as someone else.
3. **Look up, do not guess.** Resolve every person, Team and Business Unit by name to an id (step 2).
   If a name matches none or several, stop and ask the person which one.
4. **Show, then write.** Before a batch, tell the person what you will create (titles, owners, Team)
   and wait for a yes.
5. **When MOS says "Do this in MOS.", stop.** Tell the person; do not look for another way (step 10).

## 1. Set up and sign in

Needs `curl` and `jq`. Set the two placeholders from the person's environment, load the helper, and
have the person sign in (the password prompt hides what they type):

```sh
export MOS_API_URL='<SUPABASE_URL>'
export MOS_ANON_KEY='<ANON_KEY>'
source api-docs/mos-session.sh
mos_signin            # the person types their email and password here
```

The helper keeps the session in this shell only. Do all the steps below in the same shell. A session
lasts about an hour: on HTTP 401 run `mos_refresh` (in the main shell, not inside `$(...)`) and repeat
the call; if that fails, have the person run `mos_signin` again. `mos_signout` clears it.

`mos_call <operation> '<json>'` prints the response body and, on stderr, `HTTP <status>`.

## 2. Find out who you are and look up ids

```bash
mos_call whoami | jq '{person, access_roles, teams, authority}'
ME=$(mos_call whoami 2>/dev/null | jq -r '.person.id')
```

`teams` lists the person's Teams; `authority` says whether they can post Signals and which Work
records they may manage. Then resolve names. Each lookup must match exactly one record:

```bash
mos_call list_business_units | jq -c '.items[] | {id, name, code}'
mos_call list_teams '{"q":"HQ Operations"}' | jq -c '.items[] | {id, name, business_unit_name}'
mos_call list_people '{"q":"cahya"}' | jq -c '.items[] | {id, full_name}'

TEAM=$(mos_call list_teams '{"q":"HQ Operations"}' 2>/dev/null | mos_one_id team)
BU=$(mos_call list_business_units 2>/dev/null | jq -er '.items[] | select(.code == "retail_ops") | .id')
OWNER=$(mos_call list_people '{"q":"cahya"}' 2>/dev/null | mos_one_id person)
```

`q` is a "contains" match on name (people also match email). Lists page by 50; see Pagination in the
README if a result carries a `next_cursor`.

## 3. Create a Task with a checklist

A Task needs a Team, a responsible person and an accountable person. Its Business Unit follows the
Team. Build bodies with `jq -n --arg` so quoting is always right, and give every create an
idempotency key:

```bash
TASK_BODY=$(jq -n --arg team "$TEAM" --arg r "$OWNER" --arg a "$ME" --arg key "seed-demo-task-1" '{
  title: "Order oat milk",
  description: "Restock before the weekend.",
  team_id: $team,
  responsible_person_id: $r,
  accountable_person_id: $a,
  due_date: "2026-10-15",
  checklist: ["Check stock", "Call the supplier"],
  idempotency_key: $key
}')
TASK=$(mos_call create_task "$TASK_BODY" 2>/dev/null | jq -r '.item.id')
mos_call get_task "$(jq -n --arg id "$TASK" '{id:$id}')" | jq '{id: .item.id, status: .item.status, checklist: [.item.checklist[].label]}'
# The same call again, with the same key: no second Task.
mos_call create_task "$TASK_BODY" | jq -c '{replayed, id: .item.id}'
```

The repeated call returns the same Task with `"replayed": true` and creates nothing (step 7). A first
call's own answer is `"replayed": false`.

## 4. Edit the Task

Read it first, then send only what changes, with the `updated_at` you read:

```bash
UPDATED=$(mos_call get_task "$(jq -n --arg id "$TASK" '{id:$id}')" 2>/dev/null | jq -r '.item.updated_at')
mos_call edit_task "$(jq -n --arg id "$TASK" --arg u "$UPDATED" \
  '{id:$id, changes:{status:"In Progress"}, expected_updated_at:$u}')" \
  | jq '{status: .item.status, events: [.item.events[].event_type]}'
```

`changes` may hold `title`, `description`, `due_date`, `status`, `team_id`, `responsible_person_id`,
`accountable_person_id`, `consulted_person_ids`, `informed_person_ids`, `objective_id`,
`work_line_id`. Send `null` to clear an optional field. Checklist edits are separate operations:

```bash
ITEM=$(mos_call get_task "$(jq -n --arg id "$TASK" '{id:$id}')" 2>/dev/null | jq -r '.item.checklist[0].id')
mos_call set_checklist_item "$(jq -n --arg i "$ITEM" '{item_id:$i, is_done:true}')" | jq -c '[.item.checklist[] | {label, is_done}]'
mos_call add_checklist_item "$(jq -n --arg t "$TASK" '{task_id:$t, label:"Pay the invoice"}')" | jq -c '[.item.checklist[].label]'
```

## 5. Post a Signal and link it to a Task

A Signal is an org-wide observation posted as the person. `attention` is `FYI` (default),
`Needs attention` or `Urgent`. `link_task_ids` links Tasks in the same call:

```bash
SIGNAL_BODY=$(jq -n --arg t "$TASK" --arg key "seed-demo-signal-1" '{
  body: "Oat milk is running low at the bar.",
  attention: "Needs attention",
  link_task_ids: [$t],
  idempotency_key: $key
}')
SIGNAL=$(mos_call create_signal "$SIGNAL_BODY" 2>/dev/null | jq -r '.item.id')
mos_call get_signal "$(jq -n --arg id "$SIGNAL" '{id:$id}')" | jq '{body: .item.body, attention: .item.attention, task_ids: .item.task_ids}'
```

To link an existing Signal to another Task, use `link_signal_task` (linking twice is success). Only the
author can edit a Signal's content (`body`, `occurred_at`, `category`, `attention`):

```bash
mos_call link_signal_task "$(jq -n --arg s "$SIGNAL" --arg t "$TASK" '{signal_id:$s, task_id:$t}')" | jq '.item.task_ids'
mos_call edit_signal "$(jq -n --arg id "$SIGNAL" '{id:$id, changes:{body:"Oat milk is nearly out at the bar."}}')" | jq '.item.body'
```

## 6. Create and edit a Project or Process

Creating one needs authority over that Business Unit's definitions; `whoami` shows it under
`authority.work`. `type` is `project` or `process` and cannot be changed later:

```bash
PP=$(mos_call create_project_process "$(jq -n --arg bu "$BU" --arg key "seed-demo-project-1" \
  '{name:"Bar reopening", type:"project", business_unit_id:$bu, idempotency_key:$key}')" 2>/dev/null | jq -r '.item.id')
mos_call get_project_process "$(jq -n --arg id "$PP" '{id:$id}')" | jq '.item | {name, type, business_unit_id}'
mos_call edit_project_process "$(jq -n --arg id "$PP" --arg me "$ME" \
  '{id:$id, changes:{name:"Bar reopening (October)", accountable_person_id:$me}}')" | jq '.item | {name, accountable_person_id}'
```

Read back what you made with the list operations (`list_tasks`, `list_signals`,
`list_projects_processes`) and their filters, for example `{"linked_task_id": "<uuid>"}` on
`list_signals`.

## 7. Retries and idempotency keys

Networks fail after a write may already have landed. For a create, repeat the same call with the
same `idempotency_key`: you get the first record back with `"replayed": true`, never a duplicate.

- Make the key stable per intended record: `seed-<batch>-<row number>`. Keys are scoped to the person
  and the operation, and last 24 hours.
- Never reuse a key for a different record: the first record comes back and the new content is
  ignored.
- Edits have no key. Retry an edit only after reading the record again; use `expected_updated_at` so
  a stale retry is a `conflict` instead of an overwrite.

```bash
mos_call create_signal "$SIGNAL_BODY" | jq '{replayed, id: .item.id}'
```

## 8. Handle every error by its `details` code

Branch on `details` (see the README table for the full list):

| `details` | Do |
|---|---|
| `invalid_input` | Read `message` and `hint` (the field), fix the input, send again. Do not retry unchanged. |
| `forbidden` | Stop. The person may not do this in MOS. Report the `message`. |
| `refused.*` | Stop. Say "Do this in MOS." and which action. |
| `not_found` | The id is wrong or not visible to this person. Re-run the lookup; do not probe other ids. |
| `conflict` | Read the record again, re-apply your change, send once more. |
| `rate_limited` | Wait about 30 to 60 seconds, then continue from the record that was refused. |
| HTTP 401 | `mos_refresh`, then repeat; if that fails, ask the person to `mos_signin`. |
| HTTP 404, `PGRST202` | Wrong operation or parameter name, or a required parameter missing. Check [reference.md](reference.md). |

## 9. Pace your writes

Each person may make 60 writes per rolling minute across the API and agents; a burst past that is
`rate_limited` until the window frees, and a rejected write is not counted. For a batch, send about one
write per second, and on `rate_limited` wait 30 to 60 seconds and resume. Creating a Task with a
checklist is one write; each checklist edit is another.

## 10. What is refused

Archiving, restoring, retracting, deleting, changing an Objective's settings or a key-result target,
changing permissions (a Signal's audience, owning team or mentions, people or roles) and anything about
money are refused with the fixed text "... Do this in MOS.". If the person asks for one of these, call
`refused_action` (it never reads a record) and pass the message on:

```bash
mos_call refused_action '{"action":"delete"}' | jq -c '{details, message}'
mos_call edit_task "$(jq -n --arg id "$TASK" '{id:$id, changes:{archived:true}}')" | jq -c '{details, message}'
```

Both return HTTP 403 with `details` set to a `refused.*` code.

## Before you report done

- Every record you created has an id you can read back with its `get_*` operation.
- You created nothing twice: replays printed `"replayed": true`.
- You did not store the session anywhere: `mos_signout` when finished.
- You told the person which requests were refused or forbidden, in the words MOS gave.
