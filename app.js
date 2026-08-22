/* app.js — logique de l'appli, vanilla JS, aucune dépendance */

const APP_VERSION = '0.1.0';

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

const $ = (sel, root = document) => root.querySelector(sel);
const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  templates: [],
  currentWeekStart: mondayOf(new Date()),
  selectedDayKey: null,
  editingTemplate: null,
  templateEditReturnTo: 'parametres',
  seanceDetailId: null,
  activeSession: null,
  restTimer: null,
  restTotal: 0,
  restRemaining: 0,
  lastQuoteIndex: -1,
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
const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
function weekLabel(monday) {
  const sunday = addDays(monday, 6);
  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.getDate()} – ${sunday.getDate()} ${MOIS[monday.getMonth()]} ${monday.getFullYear()}`;
  }
  return `${monday.getDate()} ${MOIS[monday.getMonth()]} – ${sunday.getDate()} ${MOIS[sunday.getMonth()]} ${sunday.getFullYear()}`;
}
function fmtWeight(w) {
  const n = Number(w);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
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
    if (target === 'parametres') { renderParametresList(); }
    showView(target);
  }
});

/* ===================== Init ===================== */
async function init() {
  $('#app-version').textContent = APP_VERSION;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  await loadTemplates();

  const saved = await DB.getKV('activeSession');
  if (saved) {
    state.activeSession = saved;
    showView('workout');
    renderWorkout();
  }

  wireStaticEvents();
}

async function loadTemplates() {
  state.templates = await DB.getAllTemplates();
  state.templates.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

document.addEventListener('DOMContentLoaded', init);

/* ===================== CALENDRIER ===================== */
const JOURS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

function renderCalendarHeads() {
  const wrap = $('#cal-day-heads');
  wrap.innerHTML = JOURS.map(j => `<div class="day-head">${j}</div>`).join('');
}

async function renderCalendar() {
  renderCalendarHeads();
  $('#cal-week-label').textContent = weekLabel(state.currentWeekStart);

  const days = Array.from({ length: 7 }, (_, i) => addDays(state.currentWeekStart, i));
  const startKey = dateKey(days[0]);
  const endKey = dateKey(days[6]);
  const planned = await DB.getPlannedForRange(startKey, endKey);

  const countByDay = {};
  planned.forEach(p => { countByDay[p.date] = (countByDay[p.date] || 0) + 1; });

  const todayKey = dateKey(new Date());
  const grid = $('#cal-grid');
  grid.innerHTML = days.map(d => {
    const key = dateKey(d);
    const isToday = key === todayKey;
    const count = countByDay[key] || 0;
    const ticks = Array.from({ length: Math.min(count, 4) }, () => `<span class="tick"></span>`).join('');
    return `<button class="day-cell${isToday ? ' today' : ''}" data-day="${key}">
              <span class="num">${d.getDate()}</span>
              <span class="day-ticks">${ticks}</span>
            </button>`;
  }).join('');

  $all('.day-cell', grid).forEach(cell => {
    cell.addEventListener('click', () => {
      state.selectedDayKey = cell.dataset.day;
      renderDayDetail();
    });
  });

  if (state.selectedDayKey && state.selectedDayKey >= startKey && state.selectedDayKey <= endKey) {
    renderDayDetail();
  } else {
    state.selectedDayKey = null;
    $('#day-detail').style.display = 'none';
  }
}

$('#cal-prev').addEventListener('click', () => { state.currentWeekStart = addDays(state.currentWeekStart, -7); renderCalendar(); });
$('#cal-next').addEventListener('click', () => { state.currentWeekStart = addDays(state.currentWeekStart, 7); renderCalendar(); });

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
    const name = tpl ? tpl.name : 'Séance supprimée';
    const doneTag = p.done ? ' ✓' : '';
    return `<div class="planned-row" data-planned="${p.id}">
              <span class="name">${escapeHtml(name)}${doneTag}</span>
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
    chips.innerHTML = `<p style="color:var(--text-muted); font-size:14px;">Aucune séance créée. Va dans Paramètres pour en créer une.</p>`;
  } else {
    chips.innerHTML = state.templates.map(t => `<button class="chip" data-tpl="${t.id}">${escapeHtml(t.name)}</button>`).join('');
    $all('.chip', chips).forEach(chip => {
      chip.addEventListener('click', async () => {
        await DB.savePlanned({ id: uid(), date: state.selectedDayKey, templateId: chip.dataset.tpl });
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ===================== SÉANCES (liste + détail) ===================== */
function renderSeancesList() {
  const list = $('#seances-list');
  if (state.templates.length === 0) {
    list.innerHTML = `<div class="empty-state"><span class="big">🏋️</span>Aucune séance pour l'instant.<br>Crée-en une depuis Paramètres.</div>`;
    return;
  }
  list.innerHTML = state.templates.map(t => {
    const nbEx = t.exercises.length;
    return `<div class="list-item" data-tpl="${t.id}">
              <div class="name">${escapeHtml(t.name)}</div>
              <div class="meta">${nbEx} exercice${nbEx > 1 ? 's' : ''} · repos ${t.restSeconds || 90}s</div>
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
  $('#seance-detail-title').textContent = tpl.name;
  const body = $('#seance-detail-body');
  body.innerHTML = `
    <div class="list-item">
      <div class="meta" style="margin-bottom:8px;">Repos entre séries : ${tpl.restSeconds || 90}s</div>
      ${tpl.exercises.map(ex => `
        <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line);">
          <span>${escapeHtml(ex.name)}</span>
          <span class="meta">${ex.sets}×${ex.reps} · ${fmtWeight(ex.weight)}kg</span>
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
      <span class="k" style="color:var(--text);">${escapeHtml(t.name)}</span>
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
  state.editingTemplate = { id: null, name: '', restSeconds: 90, exercises: [] };
  state.templateEditReturnTo = 'parametres';
  renderTemplateEdit();
  showView('template-edit');
});

/* ===================== ÉDITION D'UN TEMPLATE ===================== */
function renderTemplateEdit() {
  const t = state.editingTemplate;
  $('#tpl-name').value = t.name || '';
  $('#tpl-rest').value = t.restSeconds || 90;
  $('#btn-delete-template').style.display = t.id ? 'block' : 'none';
  renderExercisesList();
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
      <div class="exercise-grid">
        <div class="cell"><label>Séries</label><input type="number" inputmode="numeric" data-field="sets" value="${ex.sets}"></div>
        <div class="cell"><label>Répét.</label><input type="number" inputmode="numeric" data-field="reps" value="${ex.reps}"></div>
        <div class="cell"><label>Poids kg</label><input type="number" inputmode="decimal" step="0.5" data-field="weight" value="${ex.weight}"></div>
      </div>
    </div>
  `).join('') || `<p style="color:var(--text-muted); font-size:14px; padding:6px 16px;">Aucun exercice. Ajoute-en un ci-dessous.</p>`;

  $all('.exercise-card', wrap).forEach(card => {
    const idx = Number(card.dataset.idx);
    $all('[data-field]', card).forEach(input => {
      input.addEventListener('input', () => {
        const field = input.dataset.field;
        t.exercises[idx][field] = (field === 'name') ? input.value : Number(input.value);
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
  state.editingTemplate.exercises.push({ name: 'Nouvel exercice', sets: 3, reps: 10, weight: 20 });
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
  t.restSeconds = Number($('#tpl-rest').value) || 90;
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
  const all = await DB.getPlannedForRange('0000-00-00', '9999-99-99');
  for (const p of all.filter(p => p.templateId === t.id)) await DB.deletePlanned(p.id);
  await loadTemplates();
  toast('Séance supprimée');
  renderParametresList();
  showView('parametres');
});

/* ===================== SÉANCE ACTIVE ===================== */
function startWorkout(template, plannedId) {
  state.activeSession = {
    plannedId: plannedId || null,
    templateId: template.id,
    templateName: template.name,
    restSeconds: Number(template.restSeconds) || 90,
    currentIndex: 0,
    exercises: template.exercises.map(e => ({
      name: e.name,
      reps: Number(e.reps),
      weight: Number(e.weight),
      totalSets: Number(e.sets),
      setsRemaining: Number(e.sets),
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
  const cur = s.exercises[s.currentIndex];

  $('#wk-title').textContent = s.templateName;
  $('#wk-exname').textContent = cur.name;
  $('#wk-sets-remaining').textContent = cur.setsRemaining > 0
    ? `${cur.setsRemaining} série${cur.setsRemaining > 1 ? 's' : ''} restante${cur.setsRemaining > 1 ? 's' : ''}`
    : 'Exercice terminé';
  $('#wk-reps-val').textContent = cur.reps;
  $('#wk-weight-val').textContent = fmtWeight(cur.weight);

  $('#wk-strip').innerHTML = s.exercises.map((ex, i) => {
    const cls = i === s.currentIndex ? 'current' : (i < s.currentIndex ? 'done' : '');
    return `<span class="strip-chip ${cls}">${escapeHtml(ex.name)}</span>`;
  }).join('');

  const isLast = s.currentIndex >= s.exercises.length - 1;
  if (cur.setsRemaining > 0) {
    $('#btn-serie-terminee').style.display = 'block';
    $('#btn-prochain-exercice').style.display = 'none';
  } else {
    $('#btn-serie-terminee').style.display = 'none';
    $('#btn-prochain-exercice').style.display = 'block';
    $('#btn-prochain-exercice').textContent = isLast ? 'Terminer la séance' : 'Prochain exercice';
  }
}

$all('[data-adjust]').forEach(btn => {
  btn.addEventListener('click', () => {
    const s = state.activeSession;
    if (!s) return;
    const cur = s.exercises[s.currentIndex];
    const field = btn.dataset.adjust;
    const delta = Number(btn.dataset.delta);
    if (field === 'reps') cur.reps = Math.max(1, cur.reps + delta);
    if (field === 'weight') cur.weight = Math.max(0, Math.round((cur.weight + delta) * 10) / 10);
    persistActiveSession();
    renderWorkout();
  });
});

$('#btn-serie-terminee').addEventListener('click', () => {
  const s = state.activeSession;
  const cur = s.exercises[s.currentIndex];
  cur.setsRemaining = Math.max(0, cur.setsRemaining - 1);
  persistActiveSession();
  if (cur.setsRemaining > 0) {
    startRest(s.restSeconds);
  } else {
    renderWorkout();
  }
});

$('#btn-prochain-exercice').addEventListener('click', () => {
  const s = state.activeSession;
  s.currentIndex += 1;
  if (s.currentIndex >= s.exercises.length) {
    finishWorkout();
  } else {
    persistActiveSession();
    renderWorkout();
  }
});

async function finishWorkout() {
  const s = state.activeSession;
  if (s.plannedId) {
    const list = await DB.getPlannedForRange('0000-00-00', '9999-99-99');
    const p = list.find(pp => pp.id === s.plannedId);
    if (p) { p.done = true; await DB.savePlanned(p); }
  }
  state.activeSession = null;
  await DB.deleteKV('activeSession');
  toast('Séance terminée 💪');
  showView('home');
}

$('#btn-quit-workout').addEventListener('click', async () => {
  if (!confirm('Abandonner cette séance ? Ta progression sera perdue.')) return;
  stopRestTimer();
  $('#rest-screen').style.display = 'none';
  state.activeSession = null;
  await DB.deleteKV('activeSession');
  showView('home');
});

/* ===================== ÉCRAN DE REPOS ===================== */
const RING_CIRC = 2 * Math.PI * 98;

function pickQuote() {
  let idx;
  do { idx = Math.floor(Math.random() * MOTIVATION_QUOTES.length); }
  while (idx === state.lastQuoteIndex && MOTIVATION_QUOTES.length > 1);
  state.lastQuoteIndex = idx;
  return MOTIVATION_QUOTES[idx];
}

function startRest(seconds) {
  stopRestTimer();
  state.restTotal = seconds;
  state.restRemaining = seconds;
  $('#rest-quote').textContent = pickQuote();
  $('#rest-screen').style.display = 'flex';
  updateRestUI();
  state.restTimer = setInterval(() => {
    state.restRemaining -= 1;
    if (state.restRemaining <= 0) {
      state.restRemaining = 0;
      updateRestUI();
      stopRestTimer();
      return;
    }
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

$('#btn-skip-rest').addEventListener('click', () => {
  stopRestTimer();
  $('#rest-screen').style.display = 'none';
  renderWorkout();
});
$('#btn-add-rest').addEventListener('click', () => {
  state.restRemaining += 15;
  state.restTotal = Math.max(state.restTotal, state.restRemaining);
  updateRestUI();
});

/* ===================== Divers ===================== */
function wireStaticEvents() {
  // point d'extension si besoin d'écouteurs supplémentaires après le premier rendu
}
