/* app.js — logique de l'appli, vanilla JS, aucune dépendance */

const APP_VERSION = '0.11.1';

const MOTIVATION_QUOTES = [
  "Encore une série, encore un pas.",
  "Le repos fait partie de l'entraînement.",
  "Respire. La suite arrive.",
  "Tu es plus fort·e que la dernière série.",
  "Chaque répétition compte, même celle-ci.",
  "La régularité bat l'intensité.",
  "Ton futur toi te remercie déjà.",
  "Pas besoin d'être parfait·e, juste présent·e.",
  "Le dernier rep est celui qui construit.",
  "Recharge. La prochaine série t'attend.",
  "Petit à petit, tu deviens plus solide.",
  "L'inconfort d'aujourd'hui, la force de demain.",
  "Tu es venu·e jusqu'ici, ne t'arrête pas là.",
  "Une série de plus que la dernière fois.",
  "C'est dans le dernier effort que ça se joue.",
  "Ton seul adversaire, c'est hier.",
  "Souffle. Puis retourne le prouver.",
  "La discipline choisit ce que la motivation oublie.",
];

const COLOR_PALETTE = ['#c8f14d', '#3ec6b3', '#ff6b5c', '#5b8def', '#f2a93b', '#c77dff', '#4bd07d', '#ff8fb3'];
const ICON_PALETTE = ['🏋️','🦵','🚣','💪','🏃','🤸','🧘','🔥','🎯','⚡'];

const $ = (sel, root = document) => root.querySelector(sel);
const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  templates: [],
  currentMonth: firstOfMonth(new Date()),
  calendarMode: 'month',
  selectedDayKey: null,
  editingTemplate: null,
  templateEditReturnTo: 'parametres',
  seanceDetailId: null,
  activeSession: null,
  restTimer: null,
  restTotal: 0,
  restRemaining: 0,
  lastQuoteIndex: -1,
  perfExercise: null,
  perfRange: '6m',
};

/* ===================== Utilitaires de date ===================== */
function pad2(n) { return String(n).padStart(2, '0'); }
function dateKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function mondayOf(d) {
  const r = new Date(d);
  const day = r.getDay(); // 0=dim ... 6=sam
  const diff = day === 0 ? -6 : 1 - day;
  r.setDate(r.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}
function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
function fmtWeight(w) {
  const n = Number(w);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function iconBadge(color, icon) {
  return `<span class="icon-badge" style="background:${color}">${icon || '🏋️'}</span>`;
}

async function seedDefaultTemplatesIfNeeded() {
  const seeded = await DB.getKV('seededDefaults');
  if (seeded) return;
  const defaults = [
    { id: uid(), name: 'Legs', icon: '🦵', color: '#5b8def', restBetweenSets: 90, restBetweenExercises: 120, exercises: [] },
    { id: uid(), name: 'Push', icon: '🏋️', color: '#ff6b5c', restBetweenSets: 90, restBetweenExercises: 120, exercises: [] },
    { id: uid(), name: 'Pull', icon: '🚣', color: '#4bd07d', restBetweenSets: 90, restBetweenExercises: 120, exercises: [] },
  ];
  for (const t of defaults) await DB.saveTemplate(t);
  await DB.setKV('seededDefaults', true);
}

/* ===================== Compatibilité des anciennes séances ===================== */
function normalizeTemplate(t) {
  t.color = t.color || COLOR_PALETTE[state.templates.length % COLOR_PALETTE.length];
  t.icon = t.icon || '🏋️';
  t.restBetweenSets = Number(t.restBetweenSets ?? t.restSeconds ?? 90);
  t.restBetweenExercises = Number(t.restBetweenExercises ?? 120);
  t.exercises = (t.exercises || []).map(ex => {
    if (Array.isArray(ex.sets)) return ex; // déjà au nouveau format
    // ancien format : { sets:Number, reps:Number, weight:Number }
    const count = Number(ex.sets) || 1;
    const w = Number(ex.weight) || 20;
    return { id: ex.id || uid(), name: ex.name, sets: Array.from({ length: count }, () => ({ weight: w })) };
  });
  return t;
}

/* ===================== Toast ===================== */
function toast(msg) {
  let t = $('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = `
      position:fixed; left:50%; bottom:calc(28px + env(safe-area-inset-bottom));
      transform:translateX(-50%); background:#2d323a; color:#f1f1ee;
      padding:12px 18px; border-radius:999px; font-size:14px; z-index:50;
      box-shadow:0 6px 18px rgba(0,0,0,0.4); opacity:0; transition:opacity .2s;
      max-width:80vw; text-align:center;`;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => { t.style.opacity = '0'; }, 1800);
}

/* ===================== Navigation ===================== */
function showView(id) {
  $all('.view').forEach(v => v.classList.remove('active'));
  $(`#view-${id}`).classList.add('active');
}

document.addEventListener('click', (e) => {
  const navBtn = e.target.closest('[data-nav]');
  if (navBtn) {
    const target = navBtn.dataset.nav;
    if (target === 'calendar') { renderCalendar(); }
    if (target === 'seances') { renderSeancesList(); }
    if (target === 'parametres') { renderParametresList(); renderGoogleDriveSection(); }
    if (target === 'performance') { renderPerformance(); }
    showView(target);
  }
});

/* ===================== Init ===================== */
async function init() {
  $('#app-version').textContent = APP_VERSION;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  await seedDefaultTemplatesIfNeeded();
  await loadTemplates();

  const saved = await DB.getKV('activeSession');
  if (saved) {
    state.activeSession = saved;
    showView('workout');
    renderWorkout();
  }
  renderGoogleDriveSection();
}

async function loadTemplates() {
  const raw = await DB.getAllTemplates();
  state.templates = raw.map(normalizeTemplate);
  state.templates.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

document.addEventListener('DOMContentLoaded', init);

/* ===================== SON ===================== */
// Le tick de décompte et le son de reprise sont générés (Web Audio, aucun fichier).
// Seule la fin de séance utilise un vrai fichier audio : dépose-le dans /sounds/
// à la racine du projet, à côté d'index.html, avec exactement ce nom :
//   sounds/victory.mp3  -> joué à la fin d'une séance réussie
// Format recommandé : .mp3 (le plus fiable sur iOS Safari).

let audioCtx = null;
let victoryAudio = null;

function ensureAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* audio indisponible, on ignore silencieusement */ }

  if (!victoryAudio) {
    victoryAudio = new Audio('sounds/victory.mp3');
    victoryAudio.preload = 'auto';
    // débloque la lecture du fichier sur iOS : doit être appelé pendant un geste utilisateur
    victoryAudio.play().then(() => { victoryAudio.pause(); victoryAudio.currentTime = 0; }).catch(() => {});
  }
}

function playVictoryFanfare() {
  if (!victoryAudio) return;
  try {
    victoryAudio.pause();
    victoryAudio.currentTime = 0;
    victoryAudio.play().catch(() => { /* lecture bloquée : on ignore silencieusement */ });
  } catch (e) { /* ignore */ }
}

function beep(freq, duration, when = 0, volume = 0.35) {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime + when;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}
function playTick() { beep(880, 0.09, 0, 0.3); }
function playGo() { beep(700, 0.14, 0); beep(1050, 0.22, 0.13, 0.4); }


/* ===================== CALENDRIER ===================== */
const JOURS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
const MOIS_LONG = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function renderCalendarHeads() {
  $('#cal-month-day-heads').innerHTML = JOURS.map(j => `<div class="day-head">${j}</div>`).join('');
}

$all('[data-calmode]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.calendarMode = btn.dataset.calmode;
    $all('[data-calmode]').forEach(b => b.classList.toggle('active', b === btn));
    $('#cal-month-view').style.display = state.calendarMode === 'month' ? 'block' : 'none';
    $('#cal-history-view').style.display = state.calendarMode === 'history' ? 'block' : 'none';
    state.selectedDayKey = null;
    $('#day-detail').style.display = 'none';
    renderCalendar();
  });
});

async function renderCalendar() {
  renderCalendarHeads();
  if (state.calendarMode === 'month') await renderCalendarMonth();
  else await renderCalendarHistory();
}

async function renderCalendarMonth() {
  const monthStart = state.currentMonth;
  $('#cal-month-label').textContent = `${MOIS_LONG[monthStart.getMonth()]} ${monthStart.getFullYear()}`;

  const gridStart = mondayOf(monthStart);
  const monthEndExclusive = addMonths(monthStart, 1);
  // 6 lignes de 7 jours couvrent toujours un mois complet quel que soit le décalage
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const rangeStartKey = dateKey(cells[0]);
  const rangeEndKey = dateKey(cells[cells.length - 1]);
  const planned = await DB.getPlannedForRange(rangeStartKey, rangeEndKey);
  const byDay = {};
  planned.forEach(p => { (byDay[p.date] = byDay[p.date] || []).push(p); });

  const todayKey = dateKey(new Date());
  const grid = $('#cal-month-grid');
  grid.innerHTML = cells.map(d => {
    const key = dateKey(d);
    const isToday = key === todayKey;
    const inMonth = d >= monthStart && d < monthEndExclusive;
    const entries = (byDay[key] || []).filter(p => p.done);

    if (entries.length > 0) {
      const primary = entries[0];
      const tpl = state.templates.find(t => t.id === primary.templateId);
      const color = primary.color || (tpl ? tpl.color : '#8b8f98');
      const icon = primary.icon || (tpl ? tpl.icon : '🏋️');
      const extra = entries.length > 1 ? `<span class="month-day-extra">+${entries.length - 1}</span>` : '';
      return `<button class="month-day has-activity${isToday ? ' today' : ''}" style="background:${color};" data-day="${key}">${icon}${extra}</button>`;
    }
    return `<button class="month-day${isToday ? ' today' : ''}${inMonth ? '' : ' out-month'}" data-day="${key}">${d.getDate()}</button>`;
  }).join('');

  $all('.month-day', grid).forEach(cell => {
    cell.addEventListener('click', () => {
      state.selectedDayKey = cell.dataset.day;
      renderDayDetail();
    });
  });

  if (state.selectedDayKey) renderDayDetail();
}

$('#cal-month-prev').addEventListener('click', () => { state.currentMonth = addMonths(state.currentMonth, -1); renderCalendarMonth(); });
$('#cal-month-next').addEventListener('click', () => { state.currentMonth = addMonths(state.currentMonth, 1); renderCalendarMonth(); });

async function renderCalendarHistory() {
  const all = await DB.getAllPlanned();
  const done = all.filter(p => p.done).sort((a, b) => b.date.localeCompare(a.date));
  const wrap = $('#cal-history-view');

  if (done.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><span class="big">🗓️</span>Aucune séance terminée pour l'instant.</div>`;
    return;
  }

  let html = '';
  let lastMonthKey = '';
  done.forEach(p => {
    const [y, m] = p.date.split('-').map(Number);
    const monthKey = `${y}-${m}`;
    if (monthKey !== lastMonthKey) {
      html += `<div class="eyebrow" style="margin:16px 0 8px;">${MOIS_LONG[m - 1]} ${y}</div>`;
      lastMonthKey = monthKey;
    }
    const tpl = state.templates.find(t => t.id === p.templateId);
    const name = p.templateName || (tpl ? tpl.name : 'Séance supprimée');
    const color = p.color || (tpl ? tpl.color : 'var(--text-muted)');
    const icon = p.icon || (tpl ? tpl.icon : '🏋️');
    const d = Number(p.date.split('-')[2]);
    html += `<div class="list-item" style="display:flex; align-items:center; justify-content:space-between;">
               <span style="display:flex; align-items:center;">${iconBadge(color, icon)}${escapeHtml(name)}</span>
               <span class="meta">${d} ${MOIS[m - 1]}</span>
             </div>`;
  });
  wrap.innerHTML = html;
}

function fmtDayDetailTitle(key) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const jourNoms = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  return `${jourNoms[date.getDay()]} ${d} ${MOIS[m - 1]}`;
}

async function renderDayDetail() {
  const panel = $('#day-detail');
  panel.style.display = 'block';
  const key = state.selectedDayKey;
  const planned = await DB.getPlannedForDate(key);

  const rows = planned.map(p => {
    const tpl = state.templates.find(t => t.id === p.templateId);
    const name = p.templateName || (tpl ? tpl.name : 'Séance supprimée');
    const color = p.color || (tpl ? tpl.color : 'var(--text-muted)');
    const icon = p.icon || (tpl ? tpl.icon : '🏋️');
    const doneTag = p.done ? ' ✓' : '';
    return `<div class="planned-row" data-planned="${p.id}">
              <span class="name">${iconBadge(color, icon)}${escapeHtml(name)}${doneTag}</span>
              <span style="display:flex; gap:8px;">
                ${tpl ? `<button class="small-btn go" data-start-planned="${p.id}">Démarrer</button>` : ''}
                <button class="small-btn danger" data-remove-planned="${p.id}">Suppr.</button>
              </span>
            </div>`;
  }).join('');

  panel.innerHTML = `
    <h2>${fmtDayDetailTitle(key)}</h2>
    ${rows || '<p style="color:var(--text-muted); font-size:14px;">Aucune séance planifiée.</p>'}
    <div class="add-session-list">
      <button class="btn ghost" id="btn-open-add-session" style="width:100%;">+ Ajouter une séance</button>
    </div>
  `;

  $('#btn-open-add-session').addEventListener('click', openAddSessionModal);

  $all('[data-start-planned]', panel).forEach(btn => {
    btn.addEventListener('click', async () => {
      const p = planned.find(pp => pp.id === btn.dataset.startPlanned);
      const tpl = state.templates.find(t => t.id === p.templateId);
      if (tpl) startWorkout(tpl, p.id);
    });
  });
  $all('[data-remove-planned]', panel).forEach(btn => {
    btn.addEventListener('click', async () => {
      await DB.deletePlanned(btn.dataset.removePlanned);
      toast('Séance retirée');
      renderDayDetail();
      renderCalendar();
    });
  });
}

function openAddSessionModal() {
  const modal = $('#modal-add-session');
  const chips = $('#modal-templates-chips');
  if (state.templates.length === 0) {
    chips.innerHTML = `<p style="color:var(--text-muted); font-size:14px;">Aucune séance créée. Va dans Réglages pour en créer une.</p>`;
  } else {
    chips.innerHTML = state.templates.map(t =>
      `<button class="chip" data-tpl="${t.id}">${iconBadge(t.color, t.icon)}${escapeHtml(t.name)}</button>`
    ).join('');
    $all('.chip', chips).forEach(chip => {
      chip.addEventListener('click', async () => {
        const tpl = state.templates.find(t => t.id === chip.dataset.tpl);
        await DB.savePlanned({ id: uid(), date: state.selectedDayKey, templateId: tpl.id, templateName: tpl.name, color: tpl.color, icon: tpl.icon });
        modal.classList.add('hidden');
        toast('Séance ajoutée');
        renderDayDetail();
        renderCalendar();
      });
    });
  }
  modal.classList.remove('hidden');
}
$('#modal-add-session-cancel').addEventListener('click', () => $('#modal-add-session').classList.add('hidden'));

/* ===================== SÉANCES (liste + détail) ===================== */
function renderSeancesList() {
  const list = $('#seances-list');
  if (state.templates.length === 0) {
    list.innerHTML = `<div class="empty-state"><span class="big">🏋️</span>Aucune séance pour l'instant.<br>Crée-en une depuis Réglages.</div>`;
    return;
  }
  list.innerHTML = state.templates.map(t => {
    const nbEx = t.exercises.length;
    const nbSets = t.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
    return `<div class="list-item" data-tpl="${t.id}">
              <div class="name">${iconBadge(t.color, t.icon)}${escapeHtml(t.name)}</div>
              <div class="meta">${nbEx} exercice${nbEx > 1 ? 's' : ''} · ${nbSets} série${nbSets > 1 ? 's' : ''} au total</div>
            </div>`;
  }).join('');
  $all('.list-item', list).forEach(item => {
    item.addEventListener('click', () => {
      state.seanceDetailId = item.dataset.tpl;
      renderSeanceDetail();
      showView('seance-detail');
    });
  });
}

function renderSeanceDetail() {
  const tpl = state.templates.find(t => t.id === state.seanceDetailId);
  if (!tpl) { showView('seances'); return; }
  $('#seance-detail-title').innerHTML = `${iconBadge(tpl.color, tpl.icon)}${escapeHtml(tpl.name)}`;
  const body = $('#seance-detail-body');
  body.innerHTML = `
    <div class="list-item">
      <div class="meta" style="margin-bottom:10px;">Repos séries ${tpl.restBetweenSets}s · Repos exercices ${tpl.restBetweenExercises}s</div>
      ${tpl.exercises.map(ex => `
        <div style="padding:10px 0; border-bottom:1px solid var(--line);">
          <div style="font-weight:700; margin-bottom:6px;">${escapeHtml(ex.name)}</div>
          ${ex.sets.map((s, i) => `
            <div style="display:flex; justify-content:space-between; padding:3px 0; font-size:14px;">
              <span class="meta">Série ${i + 1}</span>
              <span>${fmtWeight(s.weight)} kg</span>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  `;
}

$('#seance-detail-back').addEventListener('click', () => { renderSeancesList(); showView('seances'); });
$('#btn-demarrer-seance').addEventListener('click', () => {
  const tpl = state.templates.find(t => t.id === state.seanceDetailId);
  if (tpl) startWorkout(tpl, null);
});
$('#btn-modifier-seance').addEventListener('click', () => {
  const tpl = state.templates.find(t => t.id === state.seanceDetailId);
  if (!tpl) return;
  state.editingTemplate = JSON.parse(JSON.stringify(tpl));
  state.templateEditReturnTo = 'seance-detail';
  renderTemplateEdit();
  showView('template-edit');
});

/* ===================== PARAMÈTRES : liste des templates ===================== */
function renderParametresList() {
  const wrap = $('#param-templates-list');
  if (state.templates.length === 0) {
    wrap.innerHTML = `<p style="color:var(--text-muted); font-size:14px;">Aucune séance pour l'instant.</p>`;
    return;
  }
  wrap.innerHTML = state.templates.map(t => `
    <div class="settings-row" data-tpl="${t.id}" style="cursor:pointer;">
      <span class="k" style="color:var(--text); display:flex; align-items:center;">${iconBadge(t.color, t.icon)}${escapeHtml(t.name)}</span>
      <span class="v" style="color:var(--text-muted);">›</span>
    </div>
  `).join('');
  $all('[data-tpl]', wrap).forEach(row => {
    row.addEventListener('click', () => {
      const tpl = state.templates.find(t => t.id === row.dataset.tpl);
      state.editingTemplate = JSON.parse(JSON.stringify(tpl));
      state.templateEditReturnTo = 'parametres';
      renderTemplateEdit();
      showView('template-edit');
    });
  });
}

$('#btn-new-template').addEventListener('click', () => {
  state.editingTemplate = {
    id: null,
    name: '',
    color: COLOR_PALETTE[state.templates.length % COLOR_PALETTE.length],
    icon: ICON_PALETTE[state.templates.length % ICON_PALETTE.length],
    restBetweenSets: 90,
    restBetweenExercises: 120,
    exercises: [],
  };
  state.templateEditReturnTo = 'parametres';
  renderTemplateEdit();
  showView('template-edit');
});

/* ===================== ÉDITION D'UN TEMPLATE ===================== */
function renderTemplateEdit() {
  const t = state.editingTemplate;
  $('#tpl-name').value = t.name || '';
  $('#tpl-color').value = t.color || '#c8f14d';
  $('#tpl-rest-sets').value = t.restBetweenSets || 90;
  $('#tpl-rest-exercises').value = t.restBetweenExercises || 120;
  $('#btn-delete-template').style.display = t.id ? 'block' : 'none';
  renderIconPicker();
  renderExercisesList();
}

function renderIconPicker() {
  const t = state.editingTemplate;
  const wrap = $('#tpl-icon-picker');
  wrap.innerHTML = ICON_PALETTE.map(ic =>
    `<button type="button" class="${ic === t.icon ? 'selected' : ''}" data-icon="${ic}">${ic}</button>`
  ).join('');
  $all('button', wrap).forEach(btn => {
    btn.addEventListener('click', () => {
      t.icon = btn.dataset.icon;
      renderIconPicker();
    });
  });
}

function renderExercisesList() {
  const wrap = $('#tpl-exercises-list');
  const t = state.editingTemplate;
  wrap.innerHTML = t.exercises.map((ex, i) => `
    <div class="exercise-card" data-idx="${i}">
      <div class="row-top">
        <input class="ex-name" data-field="name" value="${escapeHtml(ex.name)}" placeholder="Nom de l'exercice">
        <button class="remove-ex" data-remove="${i}">×</button>
      </div>
      <div class="ex-sets-count">
        <label>Nombre de séries</label>
        <input type="number" min="1" data-field="count" value="${ex.sets.length}">
      </div>
      <div class="set-weight-rows">
        ${ex.sets.map((s, si) => `
          <div class="set-weight-row">
            <span class="lbl">Série ${si + 1}</span>
            <div class="weight-stepper">
              <button type="button" data-w-minus="${si}">−</button>
              <input type="number" inputmode="decimal" step="0.5" data-set-idx="${si}" value="${s.weight}">
              <button type="button" data-w-plus="${si}">+</button>
              <span class="unit">kg</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('') || `<p style="color:var(--text-muted); font-size:14px; padding:6px 16px;">Aucun exercice. Ajoute-en un ci-dessous.</p>`;

  $all('.exercise-card', wrap).forEach(card => {
    const idx = Number(card.dataset.idx);
    const ex = t.exercises[idx];

    $(`[data-field="name"]`, card).addEventListener('input', (e) => { ex.name = e.target.value; });

    $(`[data-field="count"]`, card).addEventListener('change', (e) => {
      let n = Math.max(1, Number(e.target.value) || 1);
      const lastWeight = ex.sets.length ? ex.sets[ex.sets.length - 1].weight : 20;
      while (ex.sets.length < n) ex.sets.push({ weight: lastWeight });
      ex.sets.length = n;
      renderExercisesList();
    });

    $all('[data-set-idx]', card).forEach(input => {
      input.addEventListener('input', () => {
        ex.sets[Number(input.dataset.setIdx)].weight = Number(input.value) || 0;
      });
    });
    $all('[data-w-minus]', card).forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.wMinus);
        ex.sets[i].weight = Math.max(0, Number(ex.sets[i].weight) - 1);
        renderExercisesList();
      });
    });
    $all('[data-w-plus]', card).forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.wPlus);
        ex.sets[i].weight = Number(ex.sets[i].weight) + 1;
        renderExercisesList();
      });
    });
  });

  $all('[data-remove]', wrap).forEach(btn => {
    btn.addEventListener('click', () => {
      t.exercises.splice(Number(btn.dataset.remove), 1);
      renderExercisesList();
    });
  });
}

$('#btn-add-exercise').addEventListener('click', () => {
  state.editingTemplate.exercises.push({
    id: uid(),
    name: 'Nouvel exercice',
    sets: [{ weight: 20 }, { weight: 20 }, { weight: 20 }],
  });
  renderExercisesList();
});

$('#template-edit-back').addEventListener('click', () => backFromTemplateEdit());
function backFromTemplateEdit() {
  if (state.templateEditReturnTo === 'seance-detail') { renderSeanceDetail(); showView('seance-detail'); }
  else { renderParametresList(); showView('parametres'); }
}

$('#btn-save-template').addEventListener('click', async () => {
  const t = state.editingTemplate;
  t.name = $('#tpl-name').value.trim() || 'Séance sans nom';
  t.color = $('#tpl-color').value || '#c8f14d';
  t.restBetweenSets = Number($('#tpl-rest-sets').value) || 90;
  t.restBetweenExercises = Number($('#tpl-rest-exercises').value) || 120;
  if (!t.id) t.id = uid();
  await DB.saveTemplate(t);
  await loadTemplates();
  toast('Séance enregistrée');
  backFromTemplateEdit();
});

$('#btn-delete-template').addEventListener('click', async () => {
  const t = state.editingTemplate;
  if (!t.id) return;
  if (!confirm(`Supprimer « ${t.name} » ?`)) return;
  await DB.deleteTemplate(t.id);
  const all = await DB.getAllPlanned();
  for (const p of all.filter(p => p.templateId === t.id)) await DB.deletePlanned(p.id);
  await loadTemplates();
  toast('Séance supprimée');
  renderParametresList();
  showView('parametres');
});

/* ===================== SÉANCE ACTIVE ===================== */
function startWorkout(template, plannedId) {
  ensureAudio();
  state.activeSession = {
    plannedId: plannedId || null,
    templateId: template.id,
    templateName: template.name,
    color: template.color,
    icon: template.icon,
    restBetweenSets: Number(template.restBetweenSets) || 90,
    restBetweenExercises: Number(template.restBetweenExercises) || 120,
    currentExerciseIndex: 0,
    currentSetIndex: 0,
    exercises: template.exercises.map(ex => ({
      name: ex.name,
      sets: ex.sets.map(s => ({ weight: Number(s.weight), done: false })),
    })),
  };
  persistActiveSession();
  showView('workout');
  renderWorkout();
}

function persistActiveSession() {
  if (state.activeSession) DB.setKV('activeSession', state.activeSession);
}

function renderWorkout() {
  const s = state.activeSession;
  if (!s) { showView('home'); return; }
  const cur = s.exercises[s.currentExerciseIndex];
  const curSet = cur.sets[s.currentSetIndex];
  const remaining = cur.sets.length - s.currentSetIndex;

  $('#wk-title').textContent = s.templateName;
  $('#wk-exname').textContent = cur.name;
  $('#wk-sets-remaining').textContent = `Série ${s.currentSetIndex + 1} / ${cur.sets.length}`;
  $('#wk-weight-display').textContent = `${fmtWeight(curSet.weight)} kg`;

  $('#wk-strip').innerHTML = s.exercises.map((ex, i) => {
    const cls = i === s.currentExerciseIndex ? 'current' : (i < s.currentExerciseIndex ? 'done' : '');
    return `<span class="strip-chip ${cls}">${escapeHtml(ex.name)}</span>`;
  }).join('');

  $('#sets-banner').innerHTML = cur.sets.map((st, i) => {
    const cls = i === s.currentSetIndex ? 'current' : (st.done ? 'done' : '');
    return `<div class="set-row-chip ${cls}">
              <span class="n">Série ${i + 1}</span>
              <span class="w">${fmtWeight(st.weight)} kg</span>
            </div>`;
  }).join('');
}

$('#btn-serie-terminee').addEventListener('click', () => {
  ensureAudio();
  const s = state.activeSession;
  if (!s) return;
  const cur = s.exercises[s.currentExerciseIndex];
  cur.sets[s.currentSetIndex].done = true;

  if (s.currentSetIndex + 1 < cur.sets.length) {
    s.currentSetIndex += 1;
    persistActiveSession();
    const remainingSets = cur.sets.slice(s.currentSetIndex).map((st, i) => ({
      label: `Série ${s.currentSetIndex + 1 + i}`,
      weight: st.weight,
    }));
    startRest(s.restBetweenSets, {
      kind: 'sets',
      title: 'Séries restantes',
      sets: remainingSets,
    });
  } else if (s.currentExerciseIndex + 1 < s.exercises.length) {
    s.currentExerciseIndex += 1;
    s.currentSetIndex = 0;
    persistActiveSession();
    const nextEx = s.exercises[s.currentExerciseIndex];
    startRest(s.restBetweenExercises, {
      kind: 'exercises',
      title: `Ensuite : ${nextEx.name}`,
      sets: nextEx.sets.map((st, i) => ({ label: `Série ${i + 1}`, weight: st.weight })),
    });
  } else {
    finishWorkout();
  }
});

async function finishWorkout() {
  const s = state.activeSession;
  const today = dateKey(new Date());
  if (s.plannedId) {
    const list = await DB.getAllPlanned();
    const p = list.find(pp => pp.id === s.plannedId);
    if (p) { p.done = true; p.color = s.color; p.icon = s.icon; p.templateName = s.templateName; await DB.savePlanned(p); }
  } else {
    await DB.savePlanned({ id: uid(), date: today, templateId: s.templateId, templateName: s.templateName, color: s.color, icon: s.icon, done: true });
  }
  for (const ex of s.exercises) {
    const weights = ex.sets.map(st => Number(st.weight));
    await DB.saveExerciseLog({
      id: uid(),
      date: today,
      exerciseName: ex.name,
      weights,
      maxWeight: Math.max(...weights),
    });
  }
  state.activeSession = null;
  await DB.deleteKV('activeSession');
  ensureAudio();
  playVictoryFanfare();
  toast('Séance terminée 💪');
  showView('home');
}

async function quitWorkout() {
  if (!confirm('Abandonner cette séance ? Ta progression sera perdue.')) return;
  stopRestTimer();
  $('#rest-screen').style.display = 'none';
  state.activeSession = null;
  await DB.deleteKV('activeSession');
  showView('home');
}
$('#btn-quit-workout').addEventListener('click', quitWorkout);
$('#btn-quit-workout-rest').addEventListener('click', quitWorkout);
$('#btn-skip-rest').addEventListener('click', () => {
  stopRestTimer();
  $('#rest-screen').style.display = 'none';
  renderWorkout();
});

/* ===================== ÉCRAN DE REPOS (automatique, avec sons) ===================== */
const RING_CIRC = 2 * Math.PI * 98;

function pickQuote() {
  let idx;
  do { idx = Math.floor(Math.random() * MOTIVATION_QUOTES.length); }
  while (idx === state.lastQuoteIndex && MOTIVATION_QUOTES.length > 1);
  state.lastQuoteIndex = idx;
  return MOTIVATION_QUOTES[idx];
}

function startRest(seconds, preview) {
  stopRestTimer();
  state.restTotal = seconds;
  state.restRemaining = seconds;
  $('#rest-eyebrow-label').textContent = preview.kind === 'exercises' ? 'REPOS AVANT LE PROCHAIN EXERCICE' : 'RÉCUPÉRATION ENTRE SÉRIES';

  const setsHtml = preview.sets.map((s, i) => `<div class="row${i === 0 ? ' is-next' : ''}"><span class="n">${escapeHtml(s.label)}</span><span>${fmtWeight(s.weight)} kg</span></div>`).join('');
  $('#rest-next').innerHTML = `<div class="next-title">${escapeHtml(preview.title)}</div><div class="rest-next-sets">${setsHtml}</div>`;

  $('#rest-quote').textContent = pickQuote();
  $('#rest-screen').style.display = 'flex';
  updateRestUI();

  state.restTimer = setInterval(() => {
    state.restRemaining -= 1;
    if (state.restRemaining <= 0) {
      state.restRemaining = 0;
      updateRestUI();
      playGo();
      stopRestTimer();
      setTimeout(() => {
        $('#rest-screen').style.display = 'none';
        renderWorkout();
      }, 550);
      return;
    }
    if (state.restRemaining <= 5) playTick();
    updateRestUI();
  }, 1000);
}

function updateRestUI() {
  $('#rest-time').textContent = state.restRemaining;
  const ring = $('#rest-ring-fg');
  ring.style.strokeDasharray = `${RING_CIRC}`;
  const ratio = state.restTotal > 0 ? state.restRemaining / state.restTotal : 0;
  ring.style.strokeDashoffset = `${RING_CIRC * (1 - ratio)}`;
}

function stopRestTimer() {
  if (state.restTimer) { clearInterval(state.restTimer); state.restTimer = null; }
}

/* ===================== PERFORMANCE ===================== */
$all('[data-range]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.perfRange = btn.dataset.range;
    $all('[data-range]').forEach(b => b.classList.toggle('active', b === btn));
    drawPerformanceChart();
  });
});

$('#perf-exercise-select').addEventListener('change', (e) => {
  state.perfExercise = e.target.value || null;
  drawPerformanceChart();
});

async function renderPerformance() {
  const logs = await DB.getAllExerciseLogs();
  const names = [...new Set(logs.map(l => l.exerciseName))].sort((a, b) => a.localeCompare(b));
  const select = $('#perf-exercise-select');

  if (names.length === 0) {
    select.innerHTML = `<option value="">Aucun exercice enregistré</option>`;
    state.perfExercise = null;
    $('#perf-canvas').style.display = 'none';
    $('#perf-empty').style.display = 'block';
    return;
  }

  if (!state.perfExercise || !names.includes(state.perfExercise)) state.perfExercise = names[0];
  select.innerHTML = names.map(n => `<option value="${escapeHtml(n)}" ${n === state.perfExercise ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('');

  await drawPerformanceChart();
}

function rangeCutoffDate(range) {
  const now = new Date();
  if (range === 'all') return null;
  const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[range] || 6;
  return addMonths(now, -months);
}

async function drawPerformanceChart() {
  const canvas = $('#perf-canvas');
  if (!state.perfExercise) {
    canvas.style.display = 'none';
    $('#perf-empty').style.display = 'block';
    return;
  }
  const logs = await DB.getExerciseLogsByName(state.perfExercise);
  const cutoff = rangeCutoffDate(state.perfRange);
  const cutoffKey = cutoff ? dateKey(cutoff) : null;
  const points = logs
    .filter(l => !cutoffKey || l.date >= cutoffKey)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length === 0) {
    canvas.style.display = 'none';
    $('#perf-empty').style.display = 'block';
    return;
  }
  canvas.style.display = 'block';
  $('#perf-empty').style.display = 'none';

  drawLineChart(canvas, points.map(p => ({ date: p.date, value: p.maxWeight })));
}

function drawLineChart(canvas, points) {
  const ctx = canvas.getContext('2d');
  const cssWidth = canvas.clientWidth || 320;
  const cssHeight = canvas.clientHeight || 280;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const padL = 40, padR = 16, padT = 20, padB = 28;
  const w = cssWidth - padL - padR;
  const h = cssHeight - padT - padB;

  const values = points.map(p => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 5; max += 5; }
  const pad = (max - min) * 0.12;
  min = Math.max(0, min - pad);
  max = max + pad;

  const xFor = (i) => padL + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const yFor = (v) => padT + h - ((v - min) / (max - min)) * h;

  // grille horizontale + labels Y
  ctx.strokeStyle = '#363c45';
  ctx.fillStyle = '#8b8f98';
  ctx.font = '11px -apple-system, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const v = min + ((max - min) * i) / steps;
    const y = yFor(v);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + w, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(v), padL - 8, y);
  }

  // ligne de progression
  ctx.strokeStyle = '#c8f14d';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = xFor(i), y = yFor(p.value);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // points
  ctx.fillStyle = '#c8f14d';
  points.forEach((p, i) => {
    const x = xFor(i), y = yFor(p.value);
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // labels X (premier, milieu, dernier)
  ctx.fillStyle = '#8b8f98';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const shortDate = (key) => { const [, m, d] = key.split('-'); return `${d}/${m}`; };
  const idxs = points.length > 1 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : [0];
  [...new Set(idxs)].forEach(i => {
    ctx.fillText(shortDate(points[i].date), xFor(i), padT + h + 8);
  });
}

/* ===================== GOOGLE DRIVE (sauvegarde) ===================== */
// Flux OAuth 100% côté client (Google Identity Services), sans backend.
// Scope drive.file : l'appli ne voit que les fichiers qu'elle crée elle-même.
const GOOGLE_CLIENT_ID = '276324048061-j1muj0cnmohv1ljuh33m5ich2ga3ar44.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const BACKUP_FILENAME = 'sporti-sportou-backup.json';

let gTokenClient = null;
let gAccessToken = null;
let gTokenExpiry = 0;
let gScriptLoading = null;

function loadGoogleScript() {
  if (window.google && window.google.accounts) return Promise.resolve();
  if (gScriptLoading) return gScriptLoading;
  gScriptLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Chargement de Google Identity Services impossible'));
    document.head.appendChild(s);
  });
  return gScriptLoading;
}

async function connectGoogleDrive() {
  try {
    await loadGoogleScript();
  } catch (e) {
    toast('Connexion impossible (vérifie ta connexion internet)');
    return;
  }
  if (!gTokenClient) {
    gTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: async (resp) => {
        if (resp.error) { toast('Connexion refusée'); return; }
        gAccessToken = resp.access_token;
        gTokenExpiry = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
        await DB.setKV('googleConnected', true);
        toast('Connecté à Google Drive');
        renderGoogleDriveSection();
        scheduleGoogleTokenRefresh();
      },
    });
  }
  // si déjà connecté au moins une fois, on retente d'abord silencieusement
  // (sans repasser par l'écran de consentement) avant de forcer l'affichage
  const everConnected = await DB.getKV('googleConnected');
  gTokenClient.requestAccessToken({ prompt: everConnected ? '' : 'consent' });
}

// retente un jeton un peu avant son expiration, tant que l'appli reste ouverte,
// pour éviter à l'utilisateur de se reconnecter manuellement en cours de session
let gRefreshTimer = null;
function scheduleGoogleTokenRefresh() {
  if (gRefreshTimer) clearTimeout(gRefreshTimer);
  const delay = Math.max(gTokenExpiry - Date.now() - 5 * 60 * 1000, 30 * 1000);
  gRefreshTimer = setTimeout(async () => {
    try {
      await ensureGoogleToken();
      renderGoogleDriveSection();
      scheduleGoogleTokenRefresh();
    } catch (e) { /* silencieux : l'utilisateur devra taper sur "Se reconnecter" */ }
  }, delay);
}

function ensureGoogleToken() {
  return new Promise((resolve, reject) => {
    if (gAccessToken && Date.now() < gTokenExpiry - 60000) { resolve(gAccessToken); return; }
    if (!gTokenClient) { reject(new Error('not-connected')); return; }
    const prevCallback = gTokenClient.callback;
    gTokenClient.callback = (resp) => {
      gTokenClient.callback = prevCallback;
      if (resp.error) { reject(new Error(resp.error)); return; }
      gAccessToken = resp.access_token;
      gTokenExpiry = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
      resolve(gAccessToken);
    };
    gTokenClient.requestAccessToken({ prompt: '' });
  });
}

async function buildBackupPayload() {
  const [templates, planned, logs] = await Promise.all([
    DB.getAllTemplates(),
    DB.getAllPlanned(),
    DB.getAllExerciseLogs(),
  ]);
  return {
    app: 'Sporti-Sportou',
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    templates,
    planned,
    exerciseLogs: logs,
  };
}

async function driveFindFileId(token) {
  const q = encodeURIComponent(`name='${BACKUP_FILENAME}' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('drive-list-failed');
  const data = await res.json();
  return (data.files && data.files.length) ? data.files[0].id : null;
}

async function driveExport() {
  try {
    const token = await ensureGoogleToken();
    const payload = JSON.stringify(await buildBackupPayload(), null, 2);

    let fileId = await DB.getKV('googleBackupFileId');
    if (!fileId) fileId = await driveFindFileId(token);

    if (fileId) {
      const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: payload,
      });
      if (!res.ok) throw new Error('drive-update-failed');
    } else {
      const boundary = 'sporti_sportou_boundary';
      const metadata = { name: BACKUP_FILENAME, mimeType: 'application/json' };
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${payload}\r\n--${boundary}--`;
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      });
      if (!res.ok) throw new Error('drive-create-failed');
      const data = await res.json();
      fileId = data.id;
    }

    await DB.setKV('googleBackupFileId', fileId);
    await DB.setKV('googleLastExport', new Date().toISOString());
    toast('Sauvegardé sur Google Drive');
    renderGoogleDriveSection();
  } catch (e) {
    toast('Échec de l\'export Google Drive');
  }
}

async function openDriveImportPicker() {
  try {
    const token = await ensureGoogleToken();
    const q = encodeURIComponent("mimeType='application/json' and trashed=false");
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('drive-list-failed');
    const data = await res.json();
    renderDriveImportModal(data.files || []);
  } catch (e) {
    toast('Impossible de récupérer la liste des sauvegardes Drive');
  }
}

function renderDriveImportModal(files) {
  const modal = $('#modal-drive-import');
  const list = $('#drive-import-list');

  if (files.length === 0) {
    list.innerHTML = `<p style="color:var(--text-muted); font-size:14px;">Aucune sauvegarde trouvée sur ce compte Drive.</p>`;
  } else {
    list.innerHTML = files.map(f => {
      const d = new Date(f.modifiedTime);
      const dateStr = `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
      return `<div class="list-item" data-file="${f.id}" style="cursor:pointer;">
                <div class="name">${escapeHtml(f.name)}</div>
                <div class="meta">Modifié le ${dateStr}</div>
              </div>`;
    }).join('');
    $all('[data-file]', list).forEach(row => {
      row.addEventListener('click', () => {
        modal.classList.add('hidden');
        driveImportFromFile(row.dataset.file);
      });
    });
  }
  modal.classList.remove('hidden');
}
$('#modal-drive-import-cancel').addEventListener('click', () => $('#modal-drive-import').classList.add('hidden'));

async function driveImportFromFile(fileId) {
  if (!confirm('Importer va remplacer tes séances, ton calendrier et ton historique actuels par cette sauvegarde. Continuer ?')) return;
  try {
    const token = await ensureGoogleToken();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('drive-download-failed');
    const data = await res.json();

    await DB.restoreFromBackup(data);
    await DB.setKV('googleBackupFileId', fileId);
    await loadTemplates();
    toast('Import terminé');
    renderParametresList();
  } catch (e) {
    toast('Échec de l\'import Google Drive');
  }
}

function disconnectGoogleDrive() {
  if (gAccessToken && window.google && google.accounts) {
    google.accounts.oauth2.revoke(gAccessToken, () => {});
  }
  gAccessToken = null;
  gTokenExpiry = 0;
  DB.deleteKV('googleConnected');
  toast('Déconnecté de Google Drive');
  renderGoogleDriveSection();
}

async function renderGoogleDriveSection() {
  const everConnected = await DB.getKV('googleConnected');
  const lastExport = await DB.getKV('googleLastExport');
  const isLive = !!gAccessToken;

  $('#btn-google-connect').style.display = isLive ? 'none' : 'block';
  $('#btn-google-connect').textContent = everConnected ? 'Se reconnecter à Google Drive' : 'Connecter à Google Drive';
  $('#drive-actions').style.display = isLive ? 'flex' : 'none';
  $('#btn-drive-disconnect').style.display = isLive ? 'block' : 'none';
  $('#drive-status-text').textContent = isLive ? 'Connecté' : (everConnected ? 'Session expirée' : 'Non connecté');

  const lastExportEl = $('#drive-last-export');
  if (lastExport) {
    const d = new Date(lastExport);
    lastExportEl.textContent = `Dernière sauvegarde : ${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    lastExportEl.style.display = 'block';
  } else {
    lastExportEl.style.display = 'none';
  }
}

$('#btn-google-connect').addEventListener('click', connectGoogleDrive);
$('#btn-drive-export').addEventListener('click', driveExport);
$('#btn-drive-import').addEventListener('click', openDriveImportPicker);
$('#btn-drive-disconnect').addEventListener('click', disconnectGoogleDrive);
