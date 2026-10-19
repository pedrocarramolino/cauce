'use strict';

// ---------- Constantes ----------
const COLORS = ['#f07167', '#f4a261', '#e9c46a', '#8ab17d', '#2a9d8f', '#5b8def', '#9b7ede', '#e77fb3', '#8d99ae'];
const EMOJIS = ['⏰','☀️','🧠','☕','⚡','💼','📚','✏️','💻','📞','📧','🧘','🏃','🏋️','🚴','🚶','🍳','🥗','🍽️','🛒','🧹','🧺','🚿','🛏️','🌙','💊','💧','🌱','🐶','🎵','🎮','🎨','📖','🎓','🚗','✈️','🎂','❤️','👨‍👩‍👧','✅'];
const DUR_CHIPS = [15, 30, 45, 60, 90, 120];
const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const STORE = 'cauce:v1';

// ---------- Utilidades de fecha ----------
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toHHMM = m => { m = Math.max(0, Math.min(1439, Math.round(m))); return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const today = () => iso(new Date());
const fmtDur = m => m < 60 ? `${m} min` : (m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const $ = s => document.querySelector(s);
const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Estado ----------
let db = load();
let selDate = today();
let editing = null; // { task, isNew }

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* almacenamiento no disponible */ }
  return seed();
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(db)); } catch (e) { toast('No se pudo guardar'); } }

function seed() {
  return { settings: { theme: 'auto', defDur: 30, pomo: 25 }, tasks: [] };
}

// ---------- Lógica de tareas ----------
function occursOn(t, date) {
  if (!t.date) return false;
  if (t.repeat === 'none') return t.date === date;
  if (date < t.date) return false;
  const dow = parseISO(date).getDay();
  if (t.repeat === 'daily') return true;
  if (t.repeat === 'weekdays') return dow >= 1 && dow <= 5;
  if (t.repeat === 'weekly') return parseISO(t.date).getDay() === dow;
  return false;
}
const isDone = (t, date) => !!t.doneDates[date || 'inbox'];
function setDone(t, date, v) { const k = date || 'inbox'; if (v) t.doneDates[k] = true; else delete t.doneDates[k]; save(); }
const tasksOn = date => db.tasks.filter(t => occursOn(t, date));
const timed = date => tasksOn(date).filter(t => !t.allDay && t.start).sort((a, b) => toMin(a.start) - toMin(b.start));

// ---------- Tema ----------
function applyTheme() {
  const th = db.settings.theme;
  if (th === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', th);
}

// ---------- Render: semana ----------
function renderWeek() {
  const d = parseISO(selDate);
  $('#monthLabel').innerHTML = `${MONTHS[d.getMonth()]} <em>${d.getFullYear()}</em>`;
  const offset = (d.getDay() + 6) % 7; // lunes primero
  const monday = addDays(selDate, -offset);
  const t = today();
  let html = '';
  for (let i = 0; i < 7; i++) {
    const ds = addDays(monday, i);
    const dd = parseISO(ds);
    const colors = [...new Set(tasksOn(ds).map(x => x.color))].slice(0, 4);
    html += `<button class="day${ds === t ? ' today' : ''}${ds === selDate ? ' sel' : ''}" data-date="${ds}">
      <span class="dow">${DOW[dd.getDay()]}</span><span class="num">${dd.getDate()}</span>
      <span class="dots">${colors.map(c => `<i style="background:${c}"></i>`).join('')}</span></button>`;
  }
  $('#week').innerHTML = html;
}

// ---------- Render: todo el día ----------
function renderAllDay() {
  const list = tasksOn(selDate).filter(t => t.allDay);
  $('#allday').innerHTML = list.map(t => `
    <button class="ad${isDone(t, selDate) ? ' done' : ''}" data-id="${t.id}">
      <span class="bubble" style="background:${t.color}33">${t.emoji}</span>
      <span>${esc(t.title)}</span>
    </button>`).join('');
}

// ---------- Render: línea de tiempo ----------
function pillHeight(dur) { return Math.max(52, Math.min(220, 52 + (dur - 15) * 1.1)); }

function renderTimeline() {
  const list = timed(selDate);
  const tl = $('#timeline');
  const isToday = selDate === today();
  const n = nowMin();
  if (!list.length) {
    tl.innerHTML = `<div class="empty"><b>🌤️</b>Nada planificado para este día.<br>Pulsa <strong>+</strong> para añadir una tarea.</div>`;
    renderReplan();
    return;
  }
  let html = '';
  let nowPlaced = !isToday;
  const nowLine = () => `<div class="nowline"><span class="dot"></span><span class="lbl">Ahora · ${toHHMM(n)}</span></div>`;
  list.forEach((t, i) => {
    const s = toMin(t.start), e = s + t.dur;
    if (i > 0) {
      const prevEnd = toMin(list[i - 1].start) + list[i - 1].dur;
      const free = s - prevEnd;
      if (!nowPlaced && n < s && n >= prevEnd) { html += nowLine(); nowPlaced = true; }
      if (free >= 15) html += `<div class="gap"><div class="rail"></div><div class="gap-txt">⏳ ${fmtDur(free)} libres</div></div>`;
      else if (free < 0) html += `<div class="gap"><div class="rail"></div><div class="gap-txt">⚠️ Se solapa ${fmtDur(-free)}</div></div>`;
    } else if (!nowPlaced && n < s) { html += nowLine(); nowPlaced = true; }
    const done = isDone(t, selDate);
    const current = isToday && n >= s && n < e;
    if (current) nowPlaced = true;
    const h = pillHeight(t.dur);
    const prog = current ? ((n - s) / t.dur) * 100 : 0;
    const meta = [
      t.notes && '📝',
      t.subtasks.length && `☑︎ ${t.subtasks.filter(x => x.d).length}/${t.subtasks.length}`,
      t.repeat !== 'none' && '🔁',
    ].filter(Boolean).join(' · ');
    html += `<div class="item${done ? ' done' : ''}${current ? ' now' : ''}" data-id="${t.id}">
      <div class="rail"><div class="pill" style="background:${t.color};height:${h}px">${current ? `<span class="prog" style="height:${prog}%"></span>` : ''}${t.emoji}</div></div>
      <div class="body"><span class="time">${t.start} – ${toHHMM(e)} (${fmtDur(t.dur)})</span><span class="title">${esc(t.title)}</span>${meta ? `<span class="meta">${meta}</span>` : ''}</div>
      <button class="check${done ? ' on' : ''}" style="${done ? `background:${t.color};border-color:${t.color}` : `color:${t.color}`}" aria-label="Completar">${done ? '✓' : ''}</button>
    </div>`;
  });
  if (!nowPlaced) html += nowLine();
  tl.innerHTML = html;
  renderReplan();
}

function overdue() {
  if (selDate !== today()) return [];
  const n = nowMin();
  return timed(selDate).filter(t => t.repeat === 'none' && !isDone(t, selDate) && toMin(t.start) + t.dur <= n);
}
function renderReplan() {
  const o = overdue();
  $('#replan').hidden = !o.length;
  if (o.length) $('#replanText').textContent = `${o.length} tarea${o.length > 1 ? 's' : ''} pendiente${o.length > 1 ? 's' : ''} del pasado`;
}
function replan() {
  const o = overdue();
  const from = Math.ceil(nowMin() / 5) * 5;
  const others = timed(selDate).filter(t => !o.includes(t) && toMin(t.start) + t.dur > from);
  for (const t of o) {
    // Primer hueco libre desde ahora en el que quepa la tarea
    let cursor = from;
    others.sort((a, b) => toMin(a.start) - toMin(b.start));
    for (const b of others) {
      const bs = toMin(b.start), be = bs + b.dur;
      if (cursor < be && cursor + t.dur > bs) cursor = be;
    }
    if (cursor + t.dur > 1440) { t.date = null; t.start = null; continue; } // no cabe hoy → bandeja
    t.start = toHHMM(cursor);
    others.push(t);
  }
  save(); render(); toast('Tareas replanificadas');
}

// ---------- Render: bandeja ----------
function renderInbox() {
  const list = db.tasks.filter(t => !t.date);
  const ul = $('#inboxList');
  if (!list.length) { ul.innerHTML = `<div class="empty"><b>📭</b>La bandeja está vacía.</div>`; return; }
  ul.innerHTML = list.map(t => `
    <li data-id="${t.id}">
      <span class="ib-emoji" style="background:${t.color}33">${t.emoji}</span>
      <span class="ib-title">${esc(t.title)}<small>${fmtDur(t.dur || db.settings.defDur)}${t.subtasks.length ? ` · ${t.subtasks.length} subtareas` : ''}</small></span>
      <button class="ib-act" data-act="today">→ Hoy</button>
    </li>`).join('');
}

function render() {
  renderWeek(); renderAllDay(); renderTimeline(); renderInbox();
}

// ---------- Hoja de edición ----------
function nextFreeStart(date) {
  const list = timed(date);
  let c = date === today() ? Math.ceil(nowMin() / 15) * 15 : 9 * 60;
  for (const t of list) { const s = toMin(t.start), e = s + t.dur; if (c < e && c + 15 > s) c = e; }
  return toHHMM(Math.min(c, 23 * 60 + 45));
}

function openSheet(task, isNew = false) {
  editing = { task: structuredClone(task), isNew, orig: task };
  const t = editing.task;
  $('#fTitle').value = t.title;
  $('#fDate').value = t.date || selDate;
  $('#fInbox').checked = !t.date;
  $('#fAllDay').checked = t.allDay;
  $('#fStart').value = t.start || nextFreeStart(t.date || selDate);
  $('#fDur').value = t.dur || db.settings.defDur;
  $('#fRepeat').value = t.repeat;
  $('#fNotes').value = t.notes;
  $('#fDelete').hidden = isNew;
  $('#fFocus').hidden = isNew;
  $('#emojiGrid').hidden = true;
  paintSheet();
  $('#sheet').hidden = $('#sheetBg').hidden = false;
  if (isNew) setTimeout(() => $('#fTitle').focus(), 50);
}
function paintSheet() {
  const t = editing.task;
  const b = $('#fEmojiBtn'); b.textContent = t.emoji; b.style.background = t.color + '33';
  $('#colors').innerHTML = COLORS.map(c => `<button type="button" data-c="${c}" class="${c === t.color ? 'on' : ''}" style="background:${c};color:${c}"></button>`).join('');
  const dur = Number($('#fDur').value);
  $('#durChips').innerHTML = DUR_CHIPS.map(d => `<button type="button" data-d="${d}" class="${d === dur ? 'on' : ''}">${fmtDur(d)}</button>`).join('');
  $('#fSubs').innerHTML = t.subtasks.map(s => `<li data-sid="${s.id}" class="${s.d ? 'd' : ''}"><input type="checkbox" ${s.d ? 'checked' : ''}><span>${esc(s.t)}</span><button type="button" aria-label="Quitar">×</button></li>`).join('');
  const inbox = $('#fInbox').checked, allDay = $('#fAllDay').checked;
  $('#fDate').disabled = inbox;
  $('#fAllDay').disabled = inbox;
  $('#fRepeat').disabled = inbox;
  $('#timeBlock').style.display = allDay && !inbox ? 'none' : '';
  $('#fStart').disabled = inbox;
}
function closeSheet() { $('#sheet').hidden = $('#sheetBg').hidden = true; editing = null; }

function submitSheet(e) {
  e.preventDefault();
  const t = editing.task;
  t.title = $('#fTitle').value.trim() || 'Sin título';
  const inbox = $('#fInbox').checked;
  t.date = inbox ? null : ($('#fDate').value || selDate);
  t.allDay = !inbox && $('#fAllDay').checked;
  t.start = inbox || t.allDay ? null : ($('#fStart').value || '09:00');
  t.dur = Math.max(1, Number($('#fDur').value) || db.settings.defDur);
  t.repeat = inbox ? 'none' : $('#fRepeat').value;
  t.notes = $('#fNotes').value;
  if (editing.isNew) db.tasks.push(t);
  else db.tasks[db.tasks.indexOf(editing.orig)] = t;
  save();
  if (t.date) selDate = occursOn(t, selDate) ? selDate : t.date;
  closeSheet(); render();
}

function newTask(extra = {}) {
  return { id: uid(), title: '', emoji: '✅', color: COLORS[db.tasks.length % COLORS.length], date: selDate, start: null,
    dur: db.settings.defDur, allDay: false, repeat: 'none', notes: '', subtasks: [], doneDates: {}, ...extra };
}

// ---------- Arrastrar para mover la hora ----------
function enableDrag() {
  let st = null;
  $('#timeline').addEventListener('pointerdown', e => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    const item = pill.closest('.item');
    const t = db.tasks.find(x => x.id === item.dataset.id);
    st = { item, t, y: e.clientY, start: toMin(t.start), moved: false, timer: setTimeout(() => { st && (st.armed = true, item.classList.add('dragging'), navigator.vibrate?.(10)); }, 220) };
    pill.setPointerCapture(e.pointerId);
  });
  $('#timeline').addEventListener('pointermove', e => {
    if (!st) return;
    const dy = e.clientY - st.y;
    if (!st.armed) { if (Math.abs(dy) > 8) { clearTimeout(st.timer); st = null; } return; }
    e.preventDefault();
    const m = Math.round((st.start + (dy / 4)) / 5) * 5; // 4px ≈ 1 min, pasos de 5 min
    const clamped = Math.max(0, Math.min(1440 - st.t.dur, m));
    st.moved = true; st.newStart = clamped;
    st.item.style.transform = `translateY(${dy}px)`;
    st.item.querySelector('.time').textContent = `${toHHMM(clamped)} – ${toHHMM(clamped + st.t.dur)} (${fmtDur(st.t.dur)})`;
  });
  const end = () => {
    if (!st) return;
    clearTimeout(st.timer);
    const s = st; st = null;
    if (s.armed && s.moved) { s.t.start = toHHMM(s.newStart); save(); render(); }
    else if (s.armed) { s.item.classList.remove('dragging'); }
    else openSheet(s.t);
  };
  $('#timeline').addEventListener('pointerup', end);
  $('#timeline').addEventListener('pointercancel', () => { if (st) { clearTimeout(st.timer); st = null; render(); } });
}

// ---------- Enfoque / Pomodoro ----------
const focus = { task: null, total: 0, left: 0, running: false, iv: null, mode: 'task' };
function openFocus(t) {
  focus.task = t; setFocusMode(t.dur ? 'task' : 'pomo');
  $('#focusEmoji').textContent = t.emoji; $('#focusTitle').textContent = t.title;
  $('#focus').hidden = false;
}
function setFocusMode(mode) {
  stopFocus();
  focus.mode = mode;
  const mins = mode === 'task' ? (focus.task.dur || 25) : mode === 'pomo' ? db.settings.pomo : 5;
  focus.total = focus.left = mins * 60;
  document.querySelectorAll('.focus-modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  paintFocus();
}
function paintFocus() {
  $('#focusTime').textContent = `${pad(Math.floor(focus.left / 60))}:${pad(focus.left % 60)}`;
  $('#ringFg').style.strokeDashoffset = 326.7 * (1 - focus.left / focus.total);
  $('#focusToggle').textContent = focus.running ? 'Pausar' : (focus.left < focus.total ? 'Reanudar' : 'Empezar');
  document.title = focus.running ? `${$('#focusTime').textContent} · ${focus.task.title}` : 'Cauce · Agenda del día';
}
function startFocus() {
  focus.running = true;
  const endAt = Date.now() + focus.left * 1000;
  focus.iv = setInterval(() => {
    focus.left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
    if (!focus.left) { stopFocus(); navigator.vibrate?.([200, 100, 200]); toast('⏰ ¡Tiempo!'); beep(); }
    paintFocus();
  }, 250);
  paintFocus();
}
function stopFocus() { focus.running = false; clearInterval(focus.iv); }
function beep() {
  try {
    const ac = new AudioContext(), o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination); o.frequency.value = 880; g.gain.value = .15;
    o.start(); o.stop(ac.currentTime + .4);
  } catch (e) { /* sin audio */ }
}

// ---------- Toast ----------
let toastT;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = esc(msg) + (action ? ` <button>${esc(action.label)}</button>` : '');
  if (action) el.querySelector('button').onclick = () => { action.fn(); el.hidden = true; };
  el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 3500);
}

// ---------- Navegación ----------
function showView(v) {
  document.querySelectorAll('.view').forEach(x => x.classList.toggle('active', x.id === 'view-' + v));
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.view === v));
  window.scrollTo(0, 0);
}

// ---------- Eventos ----------
function bind() {
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => showView(b.dataset.view));
  $('#fab').onclick = () => openSheet(newTask(), true);
  $('#week').onclick = e => { const b = e.target.closest('.day'); if (b) { selDate = b.dataset.date; render(); } };
  $('#prevWeek').onclick = () => { selDate = addDays(selDate, -7); render(); };
  $('#nextWeek').onclick = () => { selDate = addDays(selDate, 7); render(); };
  $('#monthLabel').onclick = () => { selDate = today(); render(); };

  // Deslizar la semana
  let sx = null;
  $('#week').addEventListener('touchstart', e => sx = e.touches[0].clientX, { passive: true });
  $('#week').addEventListener('touchend', e => {
    if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 50) { selDate = addDays(selDate, dx < 0 ? 7 : -7); render(); }
  });

  $('#timeline').addEventListener('click', e => {
    const item = e.target.closest('.item'); if (!item) return;
    const t = db.tasks.find(x => x.id === item.dataset.id);
    if (e.target.closest('.check')) {
      const v = !isDone(t, selDate); setDone(t, selDate, v); render();
      if (v) toast(`✓ ${t.title}`, { label: 'Deshacer', fn: () => { setDone(t, selDate, false); render(); } });
    } else if (e.target.closest('.body')) openSheet(t);
  });
  $('#allday').onclick = e => {
    const b = e.target.closest('.ad'); if (!b) return;
    const t = db.tasks.find(x => x.id === b.dataset.id);
    if (e.target.closest('.bubble')) { setDone(t, selDate, !isDone(t, selDate)); render(); } else openSheet(t);
  };
  $('#replanBtn').onclick = replan;

  // Bandeja
  $('#quickAdd').onsubmit = e => {
    e.preventDefault();
    const v = $('#quickInput').value.trim(); if (!v) return;
    db.tasks.push(newTask({ title: v, date: null })); save(); renderInbox();
    $('#quickInput').value = '';
  };
  $('#inboxList').onclick = e => {
    const li = e.target.closest('li'); if (!li) return;
    const t = db.tasks.find(x => x.id === li.dataset.id);
    if (e.target.closest('[data-act=today]')) {
      t.date = today(); t.start = nextFreeStart(t.date); t.dur ||= db.settings.defDur;
      save(); render(); toast(`Planificada hoy a las ${t.start}`);
    } else openSheet(t);
  };

  // Hoja
  $('#sheetBg').onclick = closeSheet;
  $('#sheet').onsubmit = submitSheet;
  $('#fEmojiBtn').onclick = () => {
    const g = $('#emojiGrid');
    if (!g.innerHTML) g.innerHTML = EMOJIS.map(x => `<button type="button">${x}</button>`).join('');
    g.hidden = !g.hidden;
  };
  $('#emojiGrid').onclick = e => { const b = e.target.closest('button'); if (b) { editing.task.emoji = b.textContent; $('#emojiGrid').hidden = true; paintSheet(); } };
  $('#colors').onclick = e => { const b = e.target.closest('button'); if (b) { editing.task.color = b.dataset.c; paintSheet(); } };
  $('#durChips').onclick = e => { const b = e.target.closest('button'); if (b) { $('#fDur').value = b.dataset.d; paintSheet(); } };
  $('#fDur').oninput = paintSheet;
  $('#fAllDay').onchange = paintSheet;
  $('#fInbox').onchange = paintSheet;
  $('#fSubNew').onkeydown = e => {
    if (e.key !== 'Enter') return; e.preventDefault();
    const v = e.target.value.trim(); if (!v) return;
    editing.task.subtasks.push({ id: uid(), t: v, d: false }); e.target.value = ''; paintSheet();
  };
  $('#fSubs').onclick = e => {
    const li = e.target.closest('li'); if (!li) return;
    const subs = editing.task.subtasks, i = subs.findIndex(s => s.id === li.dataset.sid);
    if (e.target.matches('input')) subs[i].d = e.target.checked;
    else if (e.target.matches('button')) subs.splice(i, 1);
    paintSheet();
  };
  $('#fDelete').onclick = () => {
    const t = editing.orig, idx = db.tasks.indexOf(t);
    db.tasks.splice(idx, 1); save(); closeSheet(); render();
    toast('Tarea eliminada', { label: 'Deshacer', fn: () => { db.tasks.splice(idx, 0, t); save(); render(); } });
  };
  $('#fFocus').onclick = () => { const t = editing.orig; closeSheet(); openFocus(t); };

  // Enfoque
  $('#focusClose').onclick = () => { stopFocus(); $('#focus').hidden = true; document.title = 'Cauce · Agenda del día'; };
  $('#focusToggle').onclick = () => { focus.running ? (stopFocus(), paintFocus()) : startFocus(); };
  document.querySelector('.focus-modes').onclick = e => { const b = e.target.closest('button'); if (b) setFocusMode(b.dataset.mode); };
  $('#focusDone').onclick = () => {
    setDone(focus.task, focus.task.date ? selDate : null, true); stopFocus();
    $('#focus').hidden = true; render(); toast(`✓ ${focus.task.title}`);
  };

  // Ajustes
  $('#themeSel').value = db.settings.theme;
  $('#durSel').value = db.settings.defDur;
  $('#pomoSel').value = db.settings.pomo;
  $('#themeSel').onchange = e => { db.settings.theme = e.target.value; save(); applyTheme(); };
  $('#durSel').onchange = e => { db.settings.defDur = Number(e.target.value); save(); };
  $('#pomoSel').onchange = e => { db.settings.pomo = Math.max(5, Number(e.target.value) || 25); save(); };
  $('#exportBtn').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
    a.download = `cauce-${today()}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  $('#importBtn').onclick = () => $('#importFile').click();
  $('#importFile').onchange = async e => {
    try {
      const data = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(data.tasks)) throw 0;
      db = data; save(); applyTheme(); render(); toast('Datos importados');
    } catch { toast('Archivo no válido'); }
    e.target.value = '';
  };
  $('#wipeBtn').onclick = () => {
    if (!confirm('¿Borrar todas las tareas? No se puede deshacer.')) return;
    db = { settings: db.settings, tasks: [] }; save(); render();
  };

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!$('#sheet').hidden) closeSheet(); else if (!$('#focus').hidden) $('#focusClose').click(); }
  });
}

// ---------- Inicio ----------
applyTheme();
bind();
enableDrag();
render();
// Refresca la línea "ahora" cada minuto y al volver a la app
setInterval(() => { if (!editing) renderTimeline(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !editing) render(); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
