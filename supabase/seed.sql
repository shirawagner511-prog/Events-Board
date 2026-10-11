-- Departments (from the colour legend of the weekly board). People are added from the app,
-- or for the first admin via supabase/bootstrap-admin.sql (kept out of git).
insert into departments (id, name, color, sort) values
  ('events',  'אירועים',        '#8b5cf6', 1),
  ('kitchen', 'מטבח',           '#ef4444', 2),
  ('mk',      'מטבחונים (MK)',  '#0ea5e9', 3),
  ('cafe',    'קפה ובר בריאות', '#f59e0b', 4),
  ('ops',     'אופרציה',         '#10b981', 5),
  ('site',    'ניהול אתר',       '#64748b', 6)
on conflict (id) do update set name = excluded.name, color = excluded.color, sort = excluded.sort;
