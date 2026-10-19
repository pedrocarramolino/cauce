// Cauce · recibe la suscripción push de un dispositivo y sus próximos avisos.
//   GET  → { publicKey }  clave VAPID pública (se genera la primera vez)
//   POST { action: 'sync', device_id, subscription, reminders: [{ at, title, body, tag }] }
//   POST { action: 'test', device_id, subscription }  añade un aviso de prueba inmediato
//   POST { action: 'unsubscribe', device_id }
import postgres from 'npm:postgres@3.4.5';
import webpush from 'npm:web-push@3.6.7';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3 });
const ORIGIN_OK = /^(https:\/\/cauce[-a-z0-9]*\.vercel\.app|http:\/\/localhost:\d+)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REMINDERS = 500;
const MAX_AHEAD_MS = 35 * 24 * 3600 * 1000;

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGIN_OK.test(origin) ? origin : 'https://cauce-rho.vercel.app',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin',
  };
}
const json = (req: Request, data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

async function publicKey(): Promise<string> {
  const [row] = await sql`select value from cauce.config where key = 'vapid_public'`;
  if (row) return row.value;
  // Primera vez: se generan las claves aquí para que la privada no salga nunca del servidor
  const keys = webpush.generateVAPIDKeys();
  await sql`insert into cauce.config (key, value) values
    ('vapid_public', ${keys.publicKey}), ('vapid_private', ${keys.privateKey})
    on conflict (key) do nothing`;
  const [again] = await sql`select value from cauce.config where key = 'vapid_public'`;
  return again.value;
}

const str = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
  try {
    if (req.method === 'GET') return json(req, { publicKey: await publicKey() });
    if (req.method !== 'POST') return json(req, { error: 'method' }, 405);

    const body = await req.json();
    const deviceId = String(body.device_id ?? '');
    if (!UUID.test(deviceId)) return json(req, { error: 'device_id' }, 400);

    if (body.action === 'unsubscribe') {
      await sql`delete from cauce.devices where id = ${deviceId}`;
      return json(req, { ok: true });
    }

    const sub = body.subscription ?? {};
    const endpoint = str(sub.endpoint, 1000), p256dh = str(sub.keys?.p256dh, 200), auth = str(sub.keys?.auth, 100);
    if (!endpoint.startsWith('https://') || !p256dh || !auth) return json(req, { error: 'subscription' }, 400);

    if (body.action === 'test') {
      // Aviso de prueba: se añade sin tocar los demás avisos del dispositivo
      const [dev] = await sql`select id from cauce.devices where id = ${deviceId} and endpoint = ${endpoint}`;
      if (!dev) return json(req, { error: 'device' }, 404);
      await sql`insert into cauce.reminders (device_id, fire_at, title, body, tag)
        values (${deviceId}, now(), 'Cauce', '🔔 Las notificaciones funcionan', 'prueba')`;
      return json(req, { ok: true });
    }

    const now = Date.now();
    const reminders = (Array.isArray(body.reminders) ? body.reminders : [])
      .slice(0, MAX_REMINDERS)
      .map((r: Record<string, unknown>) => ({
        fire_at: new Date(String(r.at)),
        title: str(r.title, 120) || 'Cauce',
        body: str(r.body, 240),
        tag: str(r.tag, 120),
      }))
      .filter((r: { fire_at: Date }) => !isNaN(+r.fire_at) && +r.fire_at > now - 60_000 && +r.fire_at < now + MAX_AHEAD_MS);

    await sql.begin(async (tx) => {
      // Si el endpoint ya estaba con otro id (reinstalación), se reasigna a este dispositivo
      await tx`delete from cauce.devices where endpoint = ${endpoint} and id <> ${deviceId}`;
      await tx`insert into cauce.devices (id, endpoint, p256dh, auth)
        values (${deviceId}, ${endpoint}, ${p256dh}, ${auth})
        on conflict (id) do update set endpoint = excluded.endpoint, p256dh = excluded.p256dh,
          auth = excluded.auth, last_seen = now()`;
      await tx`delete from cauce.reminders where device_id = ${deviceId} and sent_at is null and tag <> 'prueba'`;
      if (reminders.length) {
        await tx`insert into cauce.reminders ${tx(reminders.map((r: Record<string, unknown>) => ({ ...r, device_id: deviceId })),
          'device_id', 'fire_at', 'title', 'body', 'tag')}`;
      }
    });
    return json(req, { ok: true, scheduled: reminders.length });
  } catch (e) {
    console.error(e);
    return json(req, { error: 'server' }, 500);
  }
});
