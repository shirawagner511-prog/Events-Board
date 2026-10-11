-- Copy to bootstrap-admin.sql (git-ignored), fill in, and run once in the SQL editor.
-- Creates the first admin; everyone else is added from the app (אנשים).
with p as (
  insert into people (name, role_title, email, is_admin)
  values ('שם', 'מנהלת אירועים', 'name@example.com', true)
  returning id, link_token
), d as (
  insert into person_departments (person_id, department_id) select id, 'events' from p
)
select 'https://<APP_URL>/?join=' || link_token as personal_link from p;
