-- Cauce: cada minuto llama a la función que envía los avisos pendientes.
-- El secreto se lee de cauce.config en cada ejecución (no queda escrito en el job).
select cron.schedule(
  'cauce-enviar-push',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://gudvgxzraisolcpwprlz.supabase.co/functions/v1/cauce-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from cauce.config where key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
