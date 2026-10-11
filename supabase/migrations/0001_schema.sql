-- Core schema: departments, people, events and the per-department tasks of each event.

create extension if not exists pgcrypto;

create table departments (
  id    text primary key,
  name  text not null,
  color text not null,
  sort  int  not null default 0
);

create table people (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  role_title  text,
  email       text,
  is_admin    boolean not null default false,
  active      boolean not null default true,
  link_token  uuid not null default gen_random_uuid() unique,
  created_at  timestamptz not null default now()
);

create table person_departments (
  person_id     uuid not null references people(id) on delete cascade,
  department_id text not null references departments(id) on delete cascade,
  primary key (person_id, department_id)
);

-- A device (anonymous Supabase auth session) bound to a person through their personal link.
create table person_devices (
  auth_uid     uuid primary key,
  person_id    uuid not null references people(id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create type event_status as enum ('pending', 'published', 'cancelled');

create table events (
  id                 uuid primary key default gen_random_uuid(),
  status             event_status not null default 'pending',
  tentative          boolean not null default false,          -- "אירוע לא סגור"
  category           text not null default 'events'
                     check (category in ('events', 'kitchen', 'welfare', 'cafe')),
  title              text not null,
  event_date         date not null,
  start_time         time,
  end_time           time,
  prep_time          time,                                    -- שעת יציאה / תחילת היערכות
  location           text,
  guests             int check (guests is null or guests >= 0),
  menu               text,
  requester          text,                                    -- מזמין
  lead               text,                                    -- מי מוציא
  teardown           text,                                    -- מי מקפל
  suppliers          text,                                    -- ספקי חוץ
  notes              text,
  source             text not null default 'manual' check (source in ('manual', 'monday')),
  monday_item_id     text unique,                             -- the official form, once linked
  monday_dirty       boolean not null default false,          -- the linked form changed since last save
  content_updated_at timestamptz not null default now(),
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index events_date_idx on events (event_date);

create table event_tasks (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references events(id) on delete cascade,
  department_id      text not null references departments(id),
  description        text not null default '',
  sort               int  not null default 0,
  seen_at            timestamptz,
  seen_by            uuid references people(id) on delete set null,
  done_at            timestamptz,
  done_by            uuid references people(id) on delete set null,
  content_updated_at timestamptz not null default now(),
  created_at         timestamptz not null default now()
);
create index event_tasks_event_idx on event_tasks (event_id);

-- What calendar invite each person last received for each event (for update / cancel).
create table invite_log (
  event_id    uuid not null references events(id) on delete cascade,
  person_id   uuid not null references people(id) on delete cascade,
  email       text not null,
  sequence    int  not null default 0,
  fingerprint text,
  state       text not null check (state in ('sent', 'cancelled')),
  updated_at  timestamptz not null default now(),
  primary key (event_id, person_id)
);

-- Official monday form submissions. Events are often agreed on WhatsApp/mail and entered by hand
-- first; the form arrives later (sometimes after the event), so each request is either linked to
-- an existing event or turned into a new one.
create extension if not exists pg_trgm;

create table monday_requests (
  item_id            text primary key,
  fields             jsonb not null,          -- normalised: title, event_date, start_time, guests, location, menu, requester, notes
  payload            jsonb,                   -- raw monday item, for reference
  status             text not null default 'new' check (status in ('new', 'linked', 'dismissed')),
  event_id           uuid references events(id) on delete set null,
  suggested_event_id uuid references events(id) on delete set null,
  received_at        timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table sync_state (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);

-- Bump content_updated_at only when something a worker cares about changed,
-- so "עודכן מאז שראית" is meaningful.
create function events_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and (
       new.title, new.event_date, new.start_time, new.end_time, new.prep_time, new.location,
       new.guests, new.menu, new.lead, new.teardown, new.suppliers, new.notes, new.status, new.tentative
     ) is distinct from (
       old.title, old.event_date, old.start_time, old.end_time, old.prep_time, old.location,
       old.guests, old.menu, old.lead, old.teardown, old.suppliers, old.notes, old.status, old.tentative
     ) then
    new.content_updated_at := now();
  end if;
  return new;
end $$;
create trigger events_touch before update on events for each row execute function events_touch();

create function event_tasks_touch() returns trigger language plpgsql as $$
begin
  if new.description is distinct from old.description or new.department_id is distinct from old.department_id then
    new.content_updated_at := now();
  end if;
  return new;
end $$;
create trigger event_tasks_touch before update on event_tasks for each row execute function event_tasks_touch();

-- Best existing event for a form: same date, then closest title / start time.
create function suggest_event_for(p_fields jsonb) returns uuid language sql stable as $$
  select e.id from events e
   where e.event_date = (p_fields->>'event_date')::date
     and e.monday_item_id is null and e.status <> 'cancelled'
   order by similarity(e.title, coalesce(p_fields->>'title', '')) desc,
            abs(extract(epoch from (coalesce(e.start_time, '12:00') -
                coalesce(nullif(p_fields->>'start_time', '')::time, '12:00')))) asc
   limit 1
$$;

create function monday_requests_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'new' then
    new.suggested_event_id := suggest_event_for(new.fields);
  end if;
  -- The form was edited after being linked: flag the event so the admin reviews it.
  if tg_op = 'UPDATE' and new.event_id is not null and new.fields is distinct from old.fields then
    update events set monday_dirty = true where id = new.event_id;
  end if;
  return new;
end $$;
create trigger monday_requests_touch before insert or update on monday_requests
  for each row execute function monday_requests_touch();
