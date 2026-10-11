-- Access model: every device signs in anonymously, then claims a person through
-- that person's personal link. Members read; admins edit; everyone marks their own tasks.

create function current_person_id() returns uuid
language sql stable security definer set search_path = public as $$
  select d.person_id
    from person_devices d join people p on p.id = d.person_id
   where d.auth_uid = auth.uid() and p.active
$$;

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from people where id = current_person_id()), false)
$$;

create function is_member() returns boolean
language sql stable as $$ select current_person_id() is not null $$;

alter table departments        enable row level security;
alter table people             enable row level security;
alter table person_departments enable row level security;
alter table person_devices     enable row level security;
alter table events             enable row level security;
alter table event_tasks        enable row level security;
alter table invite_log         enable row level security;
alter table sync_state         enable row level security;

create policy departments_read on departments for select to authenticated using (is_member());
create policy people_read on people for select to authenticated using (is_member());
create policy person_departments_read on person_departments for select to authenticated using (is_member());

create policy events_read on events for select to authenticated
  using (is_member() and (status <> 'pending' or is_admin()));
create policy event_tasks_read on event_tasks for select to authenticated
  using (exists (select 1 from events e where e.id = event_id));   -- inherits events_read
create policy invite_log_read on invite_log for select to authenticated using (is_admin());

grant select on departments, person_departments, events, event_tasks, invite_log to authenticated;
-- link_token is a credential: never readable through the table.
grant select (id, name, role_title, email, is_admin, active, created_at) on people to authenticated;

-- ---------------------------------------------------------------- session

create function claim_link(p_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_person uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into v_person from people where link_token = p_token and active;
  if v_person is null then raise exception 'invalid link'; end if;
  insert into person_devices (auth_uid, person_id) values (auth.uid(), v_person)
    on conflict (auth_uid) do update set person_id = excluded.person_id, last_seen_at = now();
  return v_person;
end $$;

create function me() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'role_title', p.role_title, 'is_admin', p.is_admin,
    'departments', coalesce((select jsonb_agg(department_id order by department_id)
                               from person_departments where person_id = p.id), '[]'::jsonb))
    from people p where p.id = current_person_id()
$$;

create function sign_out_device() returns void
language sql security definer set search_path = public as $$
  delete from person_devices where auth_uid = auth.uid()
$$;

-- ---------------------------------------------------------------- tasks

create function mark_task(p_task uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := current_person_id(); v_dept text;
begin
  if v_me is null then raise exception 'not a member'; end if;
  select department_id into v_dept from event_tasks where id = p_task;
  if v_dept is null then raise exception 'task not found'; end if;
  if not is_admin() and not exists (
       select 1 from person_departments where person_id = v_me and department_id = v_dept) then
    raise exception 'not your department';
  end if;
  if p_action = 'seen' then
    update event_tasks set seen_at = now(), seen_by = v_me where id = p_task;
  elsif p_action = 'done' then
    update event_tasks set done_at = now(), done_by = v_me,
                           seen_at = coalesce(seen_at, now()), seen_by = coalesce(seen_by, v_me)
     where id = p_task;
  elsif p_action = 'undo' then
    update event_tasks set done_at = null, done_by = null where id = p_task;
  else
    raise exception 'unknown action %', p_action;
  end if;
end $$;

-- ---------------------------------------------------------------- events (admin)

create function require_admin() returns void
language plpgsql stable as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
end $$;

-- Upserts an event and replaces its task list in one go. Tasks that keep their id keep
-- their seen/done marks; a task whose text changed shows up as "updated" to its department.
create function save_event(p_event jsonb, p_tasks jsonb default '[]'::jsonb) returns uuid
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

create function set_event_status(p_event uuid, p_status event_status) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  update events set status = p_status,
                    published_at = case when p_status = 'published' then coalesce(published_at, now()) else published_at end
   where id = p_event;
end $$;

create function delete_event(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  delete from events where id = p_event and status = 'pending';
  if not found then raise exception 'only pending events can be deleted; cancel published ones'; end if;
end $$;

-- ---------------------------------------------------------------- people (admin)

create function admin_people() returns table (
  id uuid, name text, role_title text, email text, is_admin boolean, active boolean,
  link_token uuid, departments text[], devices int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return query
    select p.id, p.name, p.role_title, p.email, p.is_admin, p.active, p.link_token,
           coalesce(array(select department_id from person_departments where person_id = p.id order by 1), '{}'),
           (select count(*)::int from person_devices where person_id = p.id)
      from people p order by p.name;
end $$;

create function admin_save_person(
  p_id uuid, p_name text, p_role_title text, p_email text, p_is_admin boolean, p_departments text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id;
begin
  perform require_admin();
  if v_id = current_person_id() and not p_is_admin then
    raise exception 'cannot remove your own admin rights';
  end if;
  if v_id is null then
    insert into people (name, role_title, email, is_admin)
    values (p_name, nullif(p_role_title, ''), nullif(p_email, ''), p_is_admin) returning id into v_id;
  else
    update people set name = p_name, role_title = nullif(p_role_title, ''), email = nullif(p_email, ''),
                      is_admin = p_is_admin where id = v_id;
  end if;
  delete from person_departments where person_id = v_id;
  insert into person_departments (person_id, department_id) select v_id, unnest(coalesce(p_departments, '{}'));
  return v_id;
end $$;

-- New link + sign out every device of that person (lost phone, person left).
create function admin_reset_link(p_person uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_token uuid := gen_random_uuid();
begin
  perform require_admin();
  update people set link_token = v_token where id = p_person;
  delete from person_devices where person_id = p_person;
  return v_token;
end $$;

create function admin_set_active(p_person uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  if p_person = current_person_id() then raise exception 'cannot deactivate yourself'; end if;
  update people set active = p_active where id = p_person;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- Live updates.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table events, event_tasks, monday_requests;
  end if;
end $$;

-- ---------------------------------------------------------------- monday requests (admin)

alter table monday_requests enable row level security;
create policy monday_requests_read on monday_requests for select to authenticated using (is_admin());
grant select on monday_requests to authenticated;

-- Link a form to an existing event: fill only what the event is still missing.
create function admin_link_request(p_item text, p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f jsonb;
begin
  perform require_admin();
  select fields into f from monday_requests where item_id = p_item;
  if f is null then raise exception 'request not found'; end if;
  update events set
    monday_item_id = p_item,
    start_time = coalesce(start_time, nullif(f->>'start_time', '')::time),
    location   = coalesce(location,   nullif(f->>'location', '')),
    guests     = coalesce(guests,     nullif(f->>'guests', '')::int),
    menu       = coalesce(menu,       nullif(f->>'menu', '')),
    requester  = coalesce(requester,  nullif(f->>'requester', '')),
    notes      = coalesce(notes,      nullif(f->>'notes', '')),
    source     = 'monday', monday_dirty = false
  where id = p_event;
  if not found then raise exception 'event not found'; end if;
  update monday_requests set status = 'linked', event_id = p_event where item_id = p_item;
end $$;

-- Turn a form into a new draft event.
create function admin_create_from_request(p_item text) returns uuid
language plpgsql security definer set search_path = public as $$
declare f jsonb; v_id uuid;
begin
  perform require_admin();
  select fields into f from monday_requests where item_id = p_item;
  if f is null then raise exception 'request not found'; end if;
  insert into events (title, event_date, start_time, location, guests, menu, requester, notes, source, monday_item_id)
  values (coalesce(nullif(f->>'title', ''), 'אירוע'), (f->>'event_date')::date,
          nullif(f->>'start_time', '')::time, nullif(f->>'location', ''), nullif(f->>'guests', '')::int,
          nullif(f->>'menu', ''), nullif(f->>'requester', ''), nullif(f->>'notes', ''), 'monday', p_item)
  returning id into v_id;
  update monday_requests set status = 'linked', event_id = v_id where item_id = p_item;
  return v_id;
end $$;

create function admin_dismiss_request(p_item text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  update monday_requests set status = 'dismissed' where item_id = p_item;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
