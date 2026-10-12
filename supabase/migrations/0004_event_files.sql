-- Files attached to an event (an extended menu, a quote, a floor plan).
-- The file itself lives in the private Storage bucket "event-files" under <event_id>/<file id>.<ext>.
create table event_files (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  name        text not null,            -- original file name, shown to people
  path        text not null unique,     -- storage object key
  size        bigint not null default 0,
  mime        text,
  uploaded_by uuid references people(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index event_files_event_idx on event_files (event_id);

alter table event_files enable row level security;
create policy event_files_read on event_files for select to authenticated
  using (is_member() and exists (select 1 from events e where e.id = event_id));   -- inherits events_read
create policy event_files_insert on event_files for insert to authenticated with check (is_admin());
create policy event_files_delete on event_files for delete to authenticated using (is_admin());
grant select, insert, delete on event_files to authenticated;

alter table event_files alter column uploaded_by set default current_person_id();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table event_files;
  end if;
end $$;

-- Storage bucket + policies (only where Supabase Storage exists; skipped on a plain local Postgres).
do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('event-files', 'event-files', false)
      on conflict (id) do nothing;
    execute $p$create policy event_files_obj_read on storage.objects for select to authenticated
      using (bucket_id = 'event-files' and is_member() and exists (
        select 1 from events e where e.id::text = (storage.foldername(name))[1]))$p$;
    execute $p$create policy event_files_obj_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'event-files' and is_admin())$p$;
    execute $p$create policy event_files_obj_delete on storage.objects for delete to authenticated
      using (bucket_id = 'event-files' and is_admin())$p$;
  end if;
end $$;
