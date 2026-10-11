-- Run once in the Supabase SQL editor (after deploying the functions) to sync monday every 5 minutes.
-- Replace <PROJECT_REF> and <SERVICE_ROLE_KEY>. Requires the pg_cron and pg_net extensions.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('sync-monday', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-monday',
    headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  )
$$);
