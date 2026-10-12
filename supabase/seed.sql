-- Departments (from the colour legend of the weekly board). People are added from the app,
-- or for the first admin via supabase/bootstrap-admin.sql (kept out of git).
insert into departments (id, name, color, sort) values
  ('events',  'אירועים',        '#dc3b3b', 1),
  ('kitchen', 'מטבח',           '#1f9d55', 2),
  ('mk',      'MK',             '#d9921a', 3),
  ('cafe',    'קפה',            '#2f6fdb', 4),
  ('ops',     'שירה',            '#0e9aa7', 5),
  ('site',    'ניהול אתר',       '#64748b', 6)
on conflict (id) do update set name = excluded.name, color = excluded.color, sort = excluded.sort;
