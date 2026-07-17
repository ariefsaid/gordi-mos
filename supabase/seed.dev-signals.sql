-- seed.dev-signals.sql — DEV ONLY (one-click demo + design-review dataset for Signal v1).
-- Provides dev-persona Team memberships + a representative Signal set across attentions, categories
-- and Teams (one carrying an @Person mention) so the composer, Home ambient feed, and /work/signals
-- archive render with real data. Mirrors the convergence sigComposer/sigCard grammar (ADR-0050).
--
-- Must stay OUT of any prod seed run (it references the fictional *.dev personas).
-- Wired in supabase/config.toml [db.seed] sql_paths AFTER seed.dev-tasks.sql (needs people/BUs/Teams).
-- Idempotent: skips entirely if mos.signals already has rows.
do $$
declare
  v_org uuid;
  p_dewi uuid; p_cahya uuid; p_krishna uuid;
  t_hq uuid; t_radiant uuid; t_roastery uuid;
  sig1 uuid := 'd1000000-0000-0000-0000-000000000001';
  sig2 uuid := 'd1000000-0000-0000-0000-000000000002';
  sig3 uuid := 'd1000000-0000-0000-0000-000000000003';
  sig4 uuid := 'd1000000-0000-0000-0000-000000000004';
  sig5 uuid := 'd1000000-0000-0000-0000-000000000005';
  sig6 uuid := 'd1000000-0000-0000-0000-000000000006';
  sig7 uuid := 'd1000000-0000-0000-0000-000000000007';
begin
  if exists (select 1 from mos.signals limit 1) then
    raise notice 'seed.dev-signals: mos.signals not empty — skipping';
    return;
  end if;

  select org_id into v_org from shared.people where email = 'dewi.dev@example.test';
  select id into p_dewi    from shared.people where email = 'dewi.dev@example.test';
  select id into p_cahya   from shared.people where email = 'cahya.dev@example.test';
  select id into p_krishna from shared.people where email = 'krishna.dev@example.test';

  select id into t_hq       from shared.teams where org_id = v_org and code = 'hq_operations';
  select id into t_radiant  from shared.teams where org_id = v_org and code = 'radiant_operations';
  select id into t_roastery from shared.teams where org_id = v_org and code = 'roastery_team';

  -- Dev-persona Team memberships (primary Team = composer default owning Team).
  insert into shared.team_memberships (org_id, person_id, team_id, is_primary) values
    (v_org, p_dewi,    t_hq,       true),
    (v_org, p_cahya,   t_radiant,  true),
    (v_org, p_krishna, t_roastery, true);

  insert into mos.signals
    (id, org_id, author_id, owning_team_id, occurred_at, body, attention, category)
  values
    (sig1, v_org, p_dewi, t_hq, now() - interval '30 minutes',
       'Grinder 2 at HQ bar is throwing inconsistent doses — pulled it for a burr check. @Cahya heads up for the morning rush.',
       'Urgent', 'Equipment/facility'),
    (sig2, v_org, p_cahya, t_radiant, now() - interval '3 hours',
       'Oat milk delivery short by 6 cartons this week; vendor says catch-up ships Thursday.',
       'Needs attention', 'Supply/vendor'),
    (sig3, v_org, p_krishna, t_roastery, now() - interval '1 day',
       'Brazil single-origin roast came out a touch light — adjusting the profile for the next batch.',
       'FYI', 'Quality'),
    (sig4, v_org, p_dewi, t_hq, now() - interval '2 days',
       'Front-of-house floor felt calm and well-staffed through the lunch peak today. Nice work team.',
       'FYI', null),
    (sig5, v_org, p_cahya, t_radiant, now() - interval '5 hours',
       'Regular wholesale customer asked about a standing weekly bean order — worth a follow-up.',
       'Needs attention', 'Customer'),
    (sig6, v_org, p_krishna, t_roastery, now() - interval '4 days',
       'Duplicate of the freezer-alarm report above — filed twice by mistake.',
       'FYI', null),
    (sig7, v_org, p_dewi, t_hq, now() - interval '6 hours',
       'HQ bar espresso volumes are down about 10% this week versus last week.',
       'Needs attention', 'Quality');

  -- One @Person mention (grant + fan-out audit): sig1 mentions Cahya.
  insert into mos.signal_mentions (org_id, signal_id, mention_kind, target_person_id) values
    (v_org, sig1, 'person', p_cahya);

  -- One retracted Signal (design-review step-4 IMPORTANT-6) — a tombstone reviewable via the
  -- /work/signals "Show retracted" toggle without needing to file+retract one by hand.
  update mos.signals
    set retracted_at = now() - interval '3 days', retract_reason = 'Filed in error — see the other report.'
    where id = sig6;

  -- One corrected Signal (design-review step-4) — carries an edited_at + a body revision row so
  -- the record drawer's "Edited" affordance + revision history are reviewable live.
  update mos.signals
    set body = 'HQ bar espresso volumes are down about 15% this week versus last week — corrected count.',
        edited_at = now() - interval '2 hours'
    where id = sig7;
  insert into mos.signal_revisions (org_id, signal_id, actor_id, field, old_value, new_value, created_at) values
    (v_org, sig7, p_dewi, 'body',
       'HQ bar espresso volumes are down about 10% this week versus last week.',
       'HQ bar espresso volumes are down about 15% this week versus last week — corrected count.',
       now() - interval '2 hours');

  raise notice 'seed.dev-signals: inserted 3 memberships + 7 signals (1 retracted, 1 corrected) + 1 mention';
end $$;
