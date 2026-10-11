-- How many paid operations workers were hired for the event (null = none).
alter table events add column paid_staff int check (paid_staff is null or paid_staff > 0);

create or replace function events_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and (
       new.title, new.event_date, new.start_time, new.end_time, new.prep_time, new.location,
       new.guests, new.menu, new.lead, new.teardown, new.suppliers, new.notes, new.status, new.tentative, new.paid_staff
     ) is distinct from (
       old.title, old.event_date, old.start_time, old.end_time, old.prep_time, old.location,
       old.guests, old.menu, old.lead, old.teardown, old.suppliers, old.notes, old.status, old.tentative, old.paid_staff
     ) then
    new.content_updated_at := now();
  end if;
  return new;
end $$;

-- save_event also stores paid_staff (0 or empty = none).
create or replace function save_event(p_event jsonb, p_tasks jsonb default '[]'::jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p_event->>'id', '')::uuid; t jsonb; v_keep uuid[] := '{}'; v_tid uuid; i int := 0;
begin
  perform require_admin();
  if v_id is null then
    insert into events (title, event_date) values (p_event->>'title', (p_event->>'event_date')::date)
    returning id into v_id;
  end if;
  update events set
    title      = p_event->>'title',
    event_date = (p_event->>'event_date')::date,
    start_time = nullif(p_event->>'start_time', '')::time,
    end_time   = nullif(p_event->>'end_time', '')::time,
    prep_time  = nullif(p_event->>'prep_time', '')::time,
    location   = nullif(p_event->>'location', ''),
    guests     = nullif(p_event->>'guests', '')::int,
    menu       = nullif(p_event->>'menu', ''),
    requester  = nullif(p_event->>'requester', ''),
    lead       = nullif(p_event->>'lead', ''),
    teardown   = nullif(p_event->>'teardown', ''),
    suppliers  = nullif(p_event->>'suppliers', ''),
    notes      = nullif(p_event->>'notes', ''),
    category   = coalesce(nullif(p_event->>'category', ''), category),
    tentative  = coalesce((p_event->>'tentative')::boolean, false),
    paid_staff = nullif(nullif(p_event->>'paid_staff', '')::int, 0),
    monday_dirty = false
  where id = v_id;

  for t in select * from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) loop
    i := i + 1;
    v_tid := nullif(t->>'id', '')::uuid;
    if v_tid is not null and exists (select 1 from event_tasks where id = v_tid and event_id = v_id) then
      update event_tasks set department_id = t->>'department_id', description = coalesce(t->>'description', ''), sort = i
       where id = v_tid;
    else
      insert into event_tasks (event_id, department_id, description, sort)
      values (v_id, t->>'department_id', coalesce(t->>'description', ''), i) returning id into v_tid;
    end if;
    v_keep := v_keep || v_tid;
  end loop;
  delete from event_tasks where event_id = v_id and id <> all (v_keep);
  return v_id;
end $$;
