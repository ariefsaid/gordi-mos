-- seed.dev-signals.sql — DEV ONLY (one-click demo + design-review dataset for Signal v1).
-- Provides dev-persona Team memberships + a representative Signal set across attentions, categories
-- and Teams (one carrying an @Person mention) so the composer, Home ambient feed, and the signals
-- archive render with real data. Mirrors the convergence sigComposer/sigCard grammar (ADR-0050).
--
-- PORTED from the v4 line onto the squashed baseline. Two adaptations:
--   * Memberships are inserted NON-primary and only where no live row exists.
--     seed.dev-processes.sql / seed.dev-cafe-opening.sql already give Dewi (hq_operations) and
--     Cahya (radiant_operations) live non-primary memberships, and both files state why primary
--     would be wrong: a primary membership re-points the persona's default context app-wide
--     (shared.default_stream, one-live-primary partial unique). This file follows that ruling —
--     the Signal read gate (mos.can_read_signal R1) needs only an ACTIVE membership.
--   * The author-gating guard is mos._guard_signals (20260805000006), which stamps edited_at and
--     appends mos.signal_revisions rows itself on any content change; signal content is
--     author-only, so each author is impersonated for their own UPDATE via request.jwt.claims —
--     the same mechanism the pgTAP suite uses (shared._claim_uuid('person_id')).
--
-- Must stay OUT of any prod seed run (it references the fictional *.dev personas).
-- Wired in supabase/config.toml [db.seed] sql_paths AFTER seed.dev-processes.sql /
-- seed.dev-cafe-opening.sql (their membership guards run first; needs seed.sql's people/teams).
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

  -- Dev-persona Team memberships: ACTIVE (non-primary — see the header), only where no live
  -- row already exists (seed.dev-processes / seed.dev-cafe-opening seed two of these).
  insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
  select v_org, m.p, m.t, false, current_date - 60
  from (values (p_dewi, t_hq), (p_cahya, t_radiant), (p_krishna, t_roastery)) as m(p, t)
  where not exists (
    select 1 from shared.team_memberships mm
    where mm.person_id = m.p and mm.team_id = m.t and mm.effective_to is null
  );

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

  -- One retracted Signal — a tombstone reviewable via the archive's "Show retracted" toggle
  -- without needing to file+retract one by hand. mos._guard_signals makes retraction
  -- author-or-signal.retract gated even for superuser seeds (shared.current_person_id() is NULL
  -- without claims), so impersonate the author for the UPDATE — same request.jwt.claims
  -- mechanism the pgTAP suite uses.
  perform set_config('request.jwt.claims',
    json_build_object('org_id', v_org, 'person_id', p_krishna, 'access_roles', json_build_array('member'))::text,
    true);
  update mos.signals
    set retracted_at = now() - interval '3 days', retract_reason = 'Filed in error — see the other report.'
    where id = sig6;

  -- One corrected Signal — carries an edited_at + a body revision row so the record drawer's
  -- "Edited" affordance + revision history are reviewable live.
  perform set_config('request.jwt.claims',
    json_build_object('org_id', v_org, 'person_id', p_dewi, 'access_roles', json_build_array('member'))::text,
    true);
  -- mos._guard_signals auto-appends the body revision row (actor = the impersonated author) and
  -- stamps edited_at itself — no manual signal_revisions insert (it would duplicate the guard's,
  -- and the table has no INSERT grant anyway).
  update mos.signals
    set body = 'HQ bar espresso volumes are down about 15% this week versus last week — corrected count.'
    where id = sig7;
  perform set_config('request.jwt.claims', null, true);

  raise notice 'seed.dev-signals: ensured 3 memberships + inserted 7 signals (1 retracted, 1 corrected) + 1 mention';
end $$;
