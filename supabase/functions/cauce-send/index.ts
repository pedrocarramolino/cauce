// Cauce · envía los avisos que ya han llegado a su hora. Lo llama pg_cron cada minuto
// con la cabecera x-cron-secret (guardada en cauce.config).
import postgres from 'npm:postgres@3.4.5';
import webpush from 'npm:web-push@3.6.7';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3 });
const STALE_MS = 10 * 60 * 1000; // avisos con más de 10 min de retraso se descartan

Deno.serve(async (req) => {
  try {
    const cfg = Object.fromEntries((await sql`select key, value from cauce.config`).map((r) => [r.key, r.value]));
    if (!cfg.cron_secret || req.headers.get('x-cron-secret') !== cfg.cron_secret) {
      return new Response('forbidden', { status: 403 });
    }
    if (!cfg.vapid_public || !cfg.vapid_private) return Response.json({ sent: 0, note: 'sin claves todavía' });
    webpush.setVapidDetails('https://cauce-rho.vercel.app', cfg.vapid_public, cfg.vapid_private);

    // Se reservan y marcan como enviados en la misma transacción para no mandarlos dos veces
    const due = await sql.begin(async (tx) => {
      const rows = await tx`
        select r.id, r.fire_at, r.title, r.body, r.tag, d.id as device_id, d.endpoint, d.p256dh, d.auth
        from cauce.reminders r join cauce.devices d on d.id = r.device_id
        where r.sent_at is null and r.fire_at <= now()
        order by r.fire_at limit 300
        for update of r skip locked`;
      if (rows.length) await tx`update cauce.reminders set sent_at = now() where id in ${tx(rows.map((r) => r.id))}`;
      return rows;
    });

    const now = Date.now();
    const fresh = due.filter((r) => now - new Date(r.fire_at).getTime() < STALE_MS);
    const gone = new Set<string>();
    const results = await Promise.allSettled(fresh.map((r) =>
      webpush.sendNotification(
        { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
        JSON.stringify({ title: r.title, body: r.body, tag: r.tag, url: '/' }),
        { TTL: 600, urgency: 'high' },
      ).catch((e) => {
        // 404/410: la suscripción ya no existe (app desinstalada o permiso retirado)
        if (e?.statusCode === 404 || e?.statusCode === 410) gone.add(r.device_id);
        throw e;
      })));
    if (gone.size) await sql`delete from cauce.devices where id in ${sql([...gone])}`;
    await sql`delete from cauce.reminders where sent_at < now() - interval '2 days'`;

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) console.error('push fallidos', failed, results.filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason?.statusCode ?? r)));
    return Response.json({ due: due.length, sent: fresh.length - failed, failed, removed: gone.size });
  } catch (e) {
    console.error(e);
    return new Response('error', { status: 500 });
  }
});
