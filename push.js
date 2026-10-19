'use strict';
// ---------- Notificaciones push ----------
// El servidor (Supabase, funciones cauce-sync y cauce-send) guarda los próximos avisos
// de este dispositivo y los envía a su hora aunque la app esté cerrada.

const PUSH_API = 'https://gudvgxzraisolcpwprlz.supabase.co/functions/v1/cauce-sync';
const REMIND_OPTS = { b60: -60, b15: -15, b5: -5, start: 0, end: 'end' };
const REMIND_ORDER = ['start', 'b5', 'b15', 'b60', 'end'];
const REMIND_LABEL = { start: 'al empezar', b5: '5 min antes', b15: '15 min antes', b60: '1 h antes', end: 'al terminar' };
const PUSH_DAYS = 14; // días por delante que se programan
const ALL_DAY_HOUR = '09:00'; // las tareas de todo el día avisan a esta hora

const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const pushOn = () => !!db.settings.push && pushSupported() && Notification.permission === 'granted';

function deviceId() {
  if (!db.settings.deviceId) { db.settings.deviceId = crypto.randomUUID(); save(); }
  return db.settings.deviceId;
}

function b64ToBytes(b64) {
  const s = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

async function getSubscription(create) {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub && create) {
    const { publicKey } = await (await fetch(PUSH_API)).json();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  }
  return sub;
}

// Avisos de los próximos días, ya en hora absoluta
function buildReminders() {
  const out = [];
  const now = Date.now();
  for (let i = 0; i < PUSH_DAYS; i++) {
    const date = addDays(today(), i);
    for (const t of tasksOn(date)) {
      if (!t.remind?.length || isDone(t, date)) continue;
      const startMin = toMin(t.allDay ? ALL_DAY_HOUR : t.start || ALL_DAY_HOUR);
      const endMin = startMin + (t.allDay ? 0 : t.dur || 0);
      const range = t.allDay ? 'Todo el día' : `${toHHMM(startMin)} – ${toHHMM(endMin)}`;
      for (const r of t.remind) {
        const off = REMIND_OPTS[r];
        if (off === undefined || (r === 'end' && t.allDay)) continue;
        const at = parseISO(date);
        at.setMinutes(off === 'end' ? endMin : startMin + off);
        if (+at <= now) continue;
        const body = r === 'end' ? `Termina ahora · ${range}`
          : r === 'start' ? (t.allDay ? 'Hoy · todo el día' : `Empieza ahora · ${range}`)
          : `Empieza en ${REMIND_LABEL[r].replace(' antes', '')} · ${range}`;
        out.push({ at: at.toISOString(), title: t.title, body, tag: `${t.id}-${date}-${r}` });
      }
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at)).slice(0, 500);
}

async function callPush(action, extra = {}) {
  const sub = await getSubscription(true); // si se perdió la suscripción, se renueva sin preguntar
  const res = await fetch(PUSH_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, device_id: deviceId(), subscription: sub.toJSON(), ...extra }),
  });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

// Envía al servidor la lista completa de próximos avisos (sustituye a la anterior)
async function syncReminders() {
  if (!pushOn()) return;
  try {
    return await callPush('sync', { reminders: buildReminders() });
  } catch (e) {
    console.warn('No se pudieron sincronizar los avisos', e);
  }
}
let syncT;
function scheduleSync() { clearTimeout(syncT); syncT = setTimeout(syncReminders, 1500); }

async function enablePush() {
  if (isIOS() && !isStandalone()) {
    toast('En iPhone: Compartir → «Añadir a pantalla de inicio» y abre Cauce desde allí');
    return false;
  }
  if (!pushSupported()) { toast('Este navegador no admite notificaciones'); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Permiso de notificaciones denegado'); paintPush(); return false; }
  try {
    await getSubscription(true);
    db.settings.push = true; save();
    await syncReminders();
    toast('🔔 Notificaciones activadas');
    return true;
  } catch (e) {
    console.warn(e); toast('No se pudieron activar las notificaciones');
    return false;
  } finally { paintPush(); }
}

async function disablePush() {
  db.settings.push = false; save();
  try {
    const sub = await getSubscription(false);
    await sub?.unsubscribe();
    await fetch(PUSH_API, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'unsubscribe', device_id: deviceId() }) });
  } catch (e) { console.warn(e); }
  paintPush(); toast('Notificaciones desactivadas');
}

async function testPush() {
  // Aviso para «ya»: el servidor lo envía en su próxima pasada (menos de un minuto)
  try {
    clearTimeout(syncT);
    await syncReminders(); // asegura que el dispositivo está registrado en el servidor
    await callPush('test');
    toast('Aviso de prueba en camino (menos de 1 min)');
  } catch (e) {
    console.warn(e); toast('No se pudo enviar la prueba');
  }
}

function paintPush() {
  const on = pushOn();
  const status = !pushSupported() && !(isIOS() && !isStandalone()) ? 'No disponible en este navegador'
    : isIOS() && !isStandalone() ? 'Añade la app a la pantalla de inicio'
    : 'Notification' in window && Notification.permission === 'denied' ? 'Bloqueadas en los ajustes del sistema'
    : on ? 'Activadas' : 'Desactivadas';
  $('#pushStatus').textContent = status;
  $('#pushToggle').textContent = on ? 'Desactivar' : 'Activar';
  $('#pushTest').hidden = !on;
  if (editing) paintSheet();
}

function bindPush() {
  $('#pushToggle').onclick = () => pushOn() ? disablePush() : enablePush();
  $('#pushTest').onclick = testPush;
  $('#remindEnable').onclick = enablePush;
  paintPush();
  syncReminders(); // al abrir la app se renuevan los avisos de los próximos días
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncReminders(); });
}
