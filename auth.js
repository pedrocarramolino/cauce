'use strict';
// ---------- Cuentas y sincronización en la nube ----------
// Cuentas de Supabase (compartidas con el proyecto AulaMia). Las tareas se guardan en
// cauce.tasks a través de las funciones cauce_pull / cauce_push, que solo dejan a cada
// usuario ver y cambiar lo suyo.

const SB_URL = 'https://gudvgxzraisolcpwprlz.supabase.co';
const SB_KEY = 'sb_publishable_g8i0G_v1oOVlSqWl2s_2PA_OWBjWqAJ';
const SYNC_SETTINGS = ['theme', 'defDur', 'pomo']; // ajustes que viajan entre dispositivos
const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const sb = window.supabase?.createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'cauce-auth', flowType: 'implicit' },
});
let session = null;
const redirectUrl = () => location.origin + location.pathname;

// ---------- Pantalla de acceso ----------
const AUTH_MODES = {
  login: {
    title: 'Inicia sesión', sub: 'Accede a tus tareas desde cualquier dispositivo.',
    fields: ['email', 'password'], submit: 'Iniciar sesión', pass: 'current-password', forgot: true,
    switchText: '¿No tienes cuenta?', switchTo: 'signup', switchLabel: 'Crear cuenta',
  },
  signup: {
    title: 'Crea tu cuenta', sub: 'Gratis. Tus tareas guardadas en la nube y sincronizadas entre tu móvil y tu ordenador.',
    fields: ['name', 'email', 'password', 'password2'], submit: 'Crear cuenta', pass: 'new-password',
    switchText: '¿Ya tienes cuenta?', switchTo: 'login', switchLabel: 'Iniciar sesión',
  },
  forgot: {
    title: 'Recupera tu contraseña', sub: 'Escribe tu correo y te enviaremos un enlace para crear una nueva.',
    fields: ['email'], submit: 'Enviar enlace', back: 'login',
  },
  reset: {
    title: 'Nueva contraseña', sub: 'Elige una contraseña nueva para tu cuenta.',
    fields: ['password', 'password2'], submit: 'Guardar contraseña', pass: 'new-password', noSkip: true,
  },
};
let authMode = 'login', sentInfo = null;
const fld = name => document.querySelector(`#authForm [data-field="${name}"]`);

function openAuth(mode = 'login') {
  $('#auth').hidden = false;
  document.body.classList.add('auth-open');
  setAuthMode(mode);
}
function closeAuth() {
  $('#auth').hidden = true;
  document.body.classList.remove('auth-open');
  db.settings.authSeen = true; save();
}

function setAuthMode(mode, keepEmail = true) {
  const m = AUTH_MODES[mode];
  authMode = mode; sentInfo = null;
  $('#auth').dataset.mode = mode;
  $('#authTitle').textContent = m.title;
  $('#authSub').textContent = m.sub;
  ['name', 'email', 'password', 'password2'].forEach(f => { fld(f).hidden = !m.fields.includes(f); });
  // Cada campo se rellena con lo correcto según el caso (clave para el llavero / gestor de contraseñas)
  if (m.pass) $('#aPass').autocomplete = m.pass;
  $('#aPassLabel').textContent = mode === 'reset' ? 'Nueva contraseña' : 'Contraseña';
  $('#aPass').value = ''; $('#aPass2').value = '';
  if (!keepEmail) $('#aEmail').value = '';
  document.querySelectorAll('#authForm .pw input').forEach(i => { i.type = 'password'; });
  document.querySelectorAll('.pw-toggle').forEach(b => { b.textContent = 'Mostrar'; b.setAttribute('aria-pressed', 'false'); });
  $('#authSubmit').textContent = m.submit;
  $('#authForgot').hidden = !m.forgot;
  $('#authForm').hidden = false;
  $('#authSent').hidden = true;
  $('#authBack').hidden = !m.back;
  $('#authSkip').hidden = !!m.noSkip;
  $('#authSwitch').innerHTML = m.switchTo
    ? `${m.switchText} <button type="button" class="link" data-go="${m.switchTo}">${m.switchLabel}</button>` : '';
  showAuthError('');
  ['aEmailErr', 'aPassMsg', 'aPass2Msg'].forEach(id => { $('#' + id).textContent = ''; $('#' + id).classList.remove('bad'); });
  $('#aEmail').classList.remove('bad');
  validateAuth();
  const first = m.fields.map(f => fld(f).querySelector('input')).find(i => !i.value);
  setTimeout(() => (first || $('#authSubmit')).focus({ preventScroll: true }), 60);
}

function showAuthError(msg) { $('#authError').textContent = msg; $('#authError').hidden = !msg; }

// Comprueba el formulario mientras se escribe; el botón solo se activa con datos válidos
function validateAuth(showEmail = false) {
  const m = AUTH_MODES[authMode];
  const email = $('#aEmail').value.trim(), pw = $('#aPass').value, pw2 = $('#aPass2').value;
  let ok = true;
  if (m.fields.includes('email')) {
    const good = EMAIL_RE.test(email);
    ok &&= good;
    if (showEmail || $('#aEmail').classList.contains('bad')) {
      $('#aEmailErr').textContent = email && !good ? 'Revisa el correo: falta algo (ej. nombre@ejemplo.com).' : '';
      $('#aEmail').classList.toggle('bad', !!email && !good);
    }
  }
  if (m.fields.includes('password')) {
    if (m.pass === 'new-password') {
      const len = pw.length >= MIN_PASSWORD;
      ok &&= len;
      $('#aPassMsg').textContent = !pw ? `Mínimo ${MIN_PASSWORD} caracteres.`
        : len ? '✓ Longitud correcta' : `Faltan ${MIN_PASSWORD - pw.length} caracteres.`;
      $('#aPassMsg').classList.toggle('good', len);
    } else {
      ok &&= pw.length > 0;
      $('#aPassMsg').textContent = '';
    }
  }
  if (m.fields.includes('password2')) {
    const same = pw2 && pw2 === pw;
    ok &&= !!same;
    $('#aPass2Msg').textContent = !pw2 ? '' : same ? '✓ Las contraseñas coinciden' : 'Las contraseñas no coinciden.';
    $('#aPass2Msg').classList.toggle('good', !!same);
    $('#aPass2').classList.toggle('bad', !!pw2 && !same);
  }
  $('#authSubmit').disabled = !ok;
  return ok;
}

// Mensajes de error de Supabase, en lenguaje claro
function authErrorText(e) {
  const code = e?.code || '', msg = (e?.message || '').toLowerCase();
  if (code === 'invalid_credentials' || msg.includes('invalid login')) return 'Correo o contraseña incorrectos.';
  if (code === 'email_not_confirmed' || msg.includes('not confirmed')) return 'Aún no has confirmado tu correo. Abre el enlace que te enviamos o pide otro.';
  if (code === 'user_already_exists' || msg.includes('already registered')) return 'Ya existe una cuenta con este correo. Inicia sesión.';
  if (code === 'weak_password' || msg.includes('password should')) return `La contraseña es demasiado débil. Usa al menos ${MIN_PASSWORD} caracteres, mezclando letras y números.`;
  if (code === 'same_password') return 'La contraseña nueva debe ser distinta de la anterior.';
  if (code === 'email_address_not_authorized' || msg.includes('not authorized')) return 'Ahora mismo no podemos enviar correos a esta dirección. Inténtalo más tarde.';
  if (code === 'signup_disabled') return 'El registro de cuentas nuevas está desactivado.';
  if (code.includes('rate_limit') || msg.includes('rate limit') || e?.status === 429) return 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.';
  if (!navigator.onLine || msg.includes('fetch')) return 'Sin conexión. Comprueba tu internet y vuelve a intentarlo.';
  return 'No se ha podido completar. Inténtalo de nuevo.';
}

async function submitAuth(e) {
  e.preventDefault();
  if (!validateAuth(true) || !sb) return;
  const btn = $('#authSubmit'), label = btn.textContent;
  const email = $('#aEmail').value.trim().toLowerCase(), pw = $('#aPass').value;
  btn.disabled = true; btn.textContent = 'Un momento…'; showAuthError('');
  try {
    if (authMode === 'login') {
      const { error } = await sb.auth.signInWithPassword({ email, password: pw });
      if (error) throw error;
      // onAuthStateChange se encarga del resto
    } else if (authMode === 'signup') {
      const { data, error } = await sb.auth.signUp({
        email, password: pw,
        options: { emailRedirectTo: redirectUrl(), data: { app: 'cauce', nombre: $('#aName').value.trim() || undefined } },
      });
      if (error) throw error;
      // Si el correo ya tenía cuenta, Supabase responde sin identidades (para no revelarlo a terceros)
      if (data.user && !data.user.identities?.length) {
        setAuthMode('login'); showAuthError('Ya existe una cuenta con este correo. Inicia sesión con tu contraseña.');
        return;
      }
      if (!data.session) showSent('signup', email);
    } else if (authMode === 'forgot') {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
      if (error) throw error;
      showSent('recovery', email);
    } else if (authMode === 'reset') {
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) throw error;
      closeAuth(); toast('Contraseña actualizada');
    }
  } catch (err) {
    console.warn(err);
    showAuthError(authErrorText(err));
    if (err?.code === 'email_not_confirmed') { sentInfo = { type: 'signup', email }; $('#authResend').hidden = false; }
  } finally {
    btn.textContent = label; validateAuth();
  }
}

function showSent(type, email) {
  sentInfo = { type, email };
  $('#authForm').hidden = true;
  $('#authSent').hidden = false;
  $('#authResend').hidden = false;
  $('#authTitle').textContent = 'Revisa tu correo';
  $('#authSub').textContent = '';
  $('#authSentText').innerHTML = type === 'signup'
    ? `Te hemos enviado un enlace a <b>${esc(email)}</b> para confirmar tu cuenta. Ábrelo en este dispositivo y entrarás directamente.`
    : `Si existe una cuenta con <b>${esc(email)}</b>, te llegará un enlace para crear una contraseña nueva.`;
  $('#authBack').hidden = false;
  $('#authSwitch').innerHTML = '¿No te llega? Mira en la carpeta de spam.';
}

async function resendAuthEmail() {
  if (!sentInfo || !sb) return;
  const b = $('#authResend'); b.disabled = true;
  try {
    const { error } = sentInfo.type === 'signup'
      ? await sb.auth.resend({ type: 'signup', email: sentInfo.email, options: { emailRedirectTo: redirectUrl() } })
      : await sb.auth.resetPasswordForEmail(sentInfo.email, { redirectTo: redirectUrl() });
    if (error) throw error;
    toast('Correo reenviado');
  } catch (e) { toast(authErrorText(e)); }
  setTimeout(() => { b.disabled = false; }, 30000); // evita reenvíos seguidos
}

// ---------- Cuenta en Ajustes ----------
function paintAccount() {
  const email = session?.user?.email;
  $('#accountStatus').textContent = email
    ? `${email}${db.sync?.at ? ' · sincronizado ' + new Date(db.sync.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''}`
    : 'Sin iniciar sesión · tus tareas solo están en este dispositivo';
  $('#accountBtn').textContent = email ? 'Cerrar sesión' : 'Iniciar sesión';
  $('#deleteAccountRow').hidden = !email;
}

async function signOut() {
  if (!confirm('¿Cerrar sesión? Tus tareas seguirán guardadas en tu cuenta y se quitarán de este dispositivo.')) return;
  await cloudSync(); // sube lo pendiente antes de salir
  if (pushOn()) await disablePush();
  await sb.auth.signOut();
}

async function deleteAccount() {
  if (!confirm('¿Eliminar tu cuenta de Cauce? Se borrarán todas tus tareas de la nube y de este dispositivo. No se puede deshacer.')) return;
  try {
    if (pushOn()) await disablePush();
    const { data, error } = await sb.rpc('cauce_delete_account');
    if (error) throw error;
    await sb.auth.signOut({ scope: 'local' });
    toast(data?.account_deleted ? 'Cuenta eliminada' : 'Datos de Cauce eliminados (tu cuenta sigue activa en AulaMia)');
  } catch (e) {
    console.warn(e); toast('No se pudo eliminar la cuenta. Inténtalo de nuevo.');
  }
}

// Al cerrar sesión las tareas se quitan del dispositivo (siguen en la nube)
function clearLocalData() {
  db.tasks = [];
  db.sync = null;
  persist(); render(); paintAccount();
}
function persist() { try { localStorage.setItem(STORE, JSON.stringify(db)); } catch (e) { /* sin almacenamiento */ } }

// ---------- Sincronización ----------
// Cada tarea guarda una «firma» del último estado sincronizado. Si cambia, la tarea se sube
// con la hora actual; si llega del servidor algo más reciente, gana lo del servidor.
const taskSig = t => { const { updatedAt, ...rest } = t; return JSON.stringify(rest); };
const settingsPick = () => Object.fromEntries(SYNC_SETTINGS.map(k => [k, db.settings[k]]));
let syncing = false, syncAgain = false, cloudT;

async function cloudSync() {
  if (!session || !sb || !navigator.onLine) return;
  if (syncing) { syncAgain = true; return; }
  syncing = true;
  try {
    const meta = db.sync ||= { cursor: null, sigs: {}, settingsSig: null, settingsAt: 0 };
    const now = Date.now();
    // 1) Cambios locales desde la última vez
    const dirty = new Map();
    for (const t of db.tasks) if (meta.sigs[t.id] !== taskSig(t)) { t.updatedAt = now; dirty.set(t.id, t); }
    const ids = new Set(db.tasks.map(t => t.id));
    const deleted = new Set(Object.keys(meta.sigs).filter(id => !ids.has(id)));
    const sSig = JSON.stringify(settingsPick());
    let settingsDirty = meta.settingsSig !== null && meta.settingsSig !== sSig;
    if (settingsDirty) meta.settingsAt = now;

    // 2) Cambios del servidor
    const { data: pull, error } = await sb.rpc('cauce_pull', { since: meta.cursor });
    if (error) throw error;
    let changed = false;
    for (const r of pull.tasks) {
      const i = db.tasks.findIndex(t => t.id === r.id);
      const localAt = deleted.has(r.id) ? now : i >= 0 ? (db.tasks[i].updatedAt || 0) : -1;
      if (r.updated_at <= localAt) continue; // lo de aquí es más reciente
      dirty.delete(r.id); deleted.delete(r.id);
      if (r.deleted) { if (i >= 0) { db.tasks.splice(i, 1); changed = true; } }
      else {
        const t = { ...r.data, updatedAt: r.updated_at };
        if (i >= 0) db.tasks[i] = t; else db.tasks.push(t);
        changed = true;
      }
    }
    if (pull.settings && pull.settings.updated_at > meta.settingsAt && !settingsDirty) {
      Object.assign(db.settings, pull.settings.data);
      meta.settingsAt = pull.settings.updated_at;
      applyTheme(); changed = true;
    }
    if (meta.settingsSig === null && !pull.settings) settingsDirty = true, meta.settingsAt = now; // primera vez

    // 3) Subir lo local
    const up = [
      ...[...dirty.values()].map(t => { const { updatedAt, ...data } = t; return { id: t.id, data, updated_at: t.updatedAt }; }),
      ...[...deleted].map(id => ({ id, deleted: true, updated_at: now })),
    ];
    if (up.length || settingsDirty) {
      const { error: e2 } = await sb.rpc('cauce_push', {
        tasks: up, settings: settingsDirty ? { data: settingsPick(), updated_at: meta.settingsAt } : null,
      });
      if (e2) throw e2;
    }

    // 4) Recordar el estado sincronizado
    meta.sigs = Object.fromEntries(db.tasks.map(t => [t.id, taskSig(t)]));
    meta.settingsSig = JSON.stringify(settingsPick());
    meta.cursor = pull.now;
    meta.at = Date.now();
    persist();
    if (changed) { render(); if (typeof scheduleSync === 'function') scheduleSync(); }
  } catch (e) {
    console.warn('Sincronización fallida', e);
  } finally {
    syncing = false;
    paintAccount();
    if (syncAgain) { syncAgain = false; scheduleCloudSync(300); }
  }
}
function scheduleCloudSync(ms = 1500) { if (!session) return; clearTimeout(cloudT); cloudT = setTimeout(cloudSync, ms); }

// ---------- Arranque ----------
function bindAuth() {
  if (!sb) { $('#accountStatus').textContent = 'No disponible sin conexión'; $('#accountBtn').disabled = true; return; }
  $('#authForm').onsubmit = submitAuth;
  $('#authForm').addEventListener('input', () => { validateAuth(); showAuthError(''); });
  $('#aEmail').addEventListener('blur', () => validateAuth(true)); // el correo se revisa al salir del campo
  $('#authSwitch').onclick = e => { const b = e.target.closest('[data-go]'); if (b) setAuthMode(b.dataset.go); };
  $('#authForgot').onclick = () => setAuthMode('forgot');
  $('#authBack').onclick = () => setAuthMode(AUTH_MODES[authMode].back || 'login');
  $('#authSkip').onclick = closeAuth;
  $('#authResend').onclick = resendAuthEmail;
  document.querySelectorAll('.pw-toggle').forEach(b => b.onclick = () => {
    const i = $('#' + b.dataset.target), show = i.type === 'password';
    i.type = show ? 'text' : 'password';
    b.textContent = show ? 'Ocultar' : 'Mostrar';
    b.setAttribute('aria-pressed', String(show));
    i.focus({ preventScroll: true });
  });
  $('#accountBtn').onclick = () => session ? signOut() : openAuth('login');
  $('#deleteAccountBtn').onclick = deleteAccount;

  sb.auth.onAuthStateChange((event, s) => {
    const was = session?.user?.id;
    session = s;
    paintAccount();
    if (event === 'PASSWORD_RECOVERY') { openAuth('reset'); return; }
    if (s && !was) {
      // Recién entrado: se cierra la pantalla y se juntan las tareas de aquí con las de la nube
      if (!$('#auth').hidden && authMode !== 'reset') { closeAuth(); toast(`Hola${s.user.user_metadata?.nombre ? ', ' + s.user.user_metadata.nombre : ''} 👋`); }
      setTimeout(cloudSync, 0);
    }
    if (event === 'SIGNED_OUT' && was) clearLocalData();
  });

  // Primera vez que se abre la app: pantalla de iniciar sesión (con enlace a crear cuenta; se puede saltar)
  sb.auth.getSession().then(({ data }) => {
    session = data.session;
    paintAccount();
    const fromEmail = /type=(signup|recovery|magiclink)|access_token|error_description/.test(location.hash);
    if (!session && !db.settings.authSeen && !fromEmail) openAuth('login');
    if (location.hash.includes('error_description')) {
      const p = new URLSearchParams(location.hash.slice(1));
      openAuth('login');
      showAuthError(p.get('error_code') === 'otp_expired' ? 'El enlace ha caducado o ya se usó. Pide otro.' : 'El enlace no es válido. Pide otro.');
      history.replaceState(null, '', location.pathname);
    }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleCloudSync(200); });
  addEventListener('online', () => scheduleCloudSync(200));
  setInterval(() => { if (!document.hidden) cloudSync(); }, 30000);
}
