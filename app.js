// app.js
// ====== Storage ======
const STORAGE_KEY = "wt_data_v1";

const defaultPlan = {
  "Понедельник (A, 40м)": ["Присед / Жим ногами", "Жим лёжа", "Подтягивания / Верхний блок", "Разведения в стороны", "Планка"],
  "Вторник (20м)": ["Тяга горизонтальная (row)", "Жим гантелей/штанги на плечи", "Face Pull", "Пресс (скруч./колени)"],
  "Среда (B, 40м)": ["RDL (румынская тяга) / Гиперэкстензии", "Жим на наклонной", "Тяга горизонтальная (row)", "Икры", "Боковая планка"],
  "Четверг (теннис)": ["Настольный теннис (2ч)"],
  "Пятница (отдых)": ["Отдых"],
  "Суббота (C, 40м)": ["Болгарский сплит-присед / Выпады", "Подтягивания / Верхний блок (др. хват)", "Жим (др. вариант)", "Трицепс", "Бицепс"],
  "Воскресенье (опц.)": ["Z2 20м / EMOM берпи / Мобилити"]
};

// Simple recommendation map (shown under exercises)
const recs = {
  "Присед / Жим ногами": "3×5–8",
  "Жим лёжа": "3×5–8",
  "Подтягивания / Верхний блок": "3×6–10",
  "Разведения в стороны": "2×12–20",
  "Планка": "2×30–60с",

  "Тяга горизонтальная (row)": "3×8–12",
  "Жим гантелей/штанги на плечи": "3×6–10",
  "Face Pull": "2–3×12–20",
  "Пресс (скруч./колени)": "2–3×10–15",

  "RDL (румынская тяга) / Гиперэкстензии": "3×5–8 / 3×10–15",
  "Жим на наклонной": "3×6–10",
  "Икры": "2×10–15",
  "Боковая планка": "2×30–45с",

  "Болгарский сплит-присед / Выпады": "3×8–12/нога",
  "Подтягивания / Верхний блок (др. хват)": "3×6–10",
  "Жим (др. вариант)": "3×6–12",
  "Трицепс": "2×10–15",
  "Бицепс": "2×10–15",

  "Z2 20м / EMOM берпи / Мобилити": "20 мин"
};

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { plan: defaultPlan, workouts: [], exercises: buildExerciseIndex(defaultPlan) };
    const parsed = JSON.parse(raw);
    if (!parsed.plan) parsed.plan = defaultPlan;
    if (!parsed.workouts) parsed.workouts = [];
    if (!parsed.exercises) parsed.exercises = buildExerciseIndex(parsed.plan);
    return parsed;
  } catch {
    return { plan: defaultPlan, workouts: [], exercises: buildExerciseIndex(defaultPlan) };
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function buildExerciseIndex(plan) {
  const set = new Set();
  Object.values(plan).forEach(list => list.forEach(x => set.add(x)));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
}

let state = loadData();

// ====== UI Helpers ======
const $ = (id) => document.getElementById(id);

const daySelect = $("daySelect");
const dateInput = $("dateInput");
const exerciseList = $("exerciseList");
const setsPanel = $("setsPanel");
const btnAddSet = $("btnAddSet");
const btnFinish = $("btnFinish");

const historyExercise = $("historyExercise");
const metricSelect = $("metricSelect");
const rangeSelect = $("rangeSelect");
const historyTable = $("historyTable");

const btnInstall = $("btnInstall");
let deferredPrompt = null;

const dlgExercise = $("dlgExercise");
const newExerciseName = $("newExerciseName");
const newExerciseDay = $("newExerciseDay");
const btnAddExercise = $("btnAddExercise");
const btnSaveExercise = $("btnSaveExercise");

const btnExport = $("btnExport");
const importFile = $("importFile");
const btnReset = $("btnReset");

// ====== PWA install prompt (mostly Android; on iOS user uses Add to Home Screen) ======
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  btnInstall.hidden = false;
});
btnInstall?.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  btnInstall.hidden = true;
});

// ====== Register service worker ======
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}

// ====== App State ======
let selectedDay = null;
let dayPinnedByUser = false;
let selectedExercise = null;
let currentSetsDraft = []; // [{weight, reps}...]

function init() {
  // Populate days
  const days = Object.keys(state.plan);
  daySelect.innerHTML = days.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
  newExerciseDay.innerHTML = days.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");

  // date default today
  const today = new Date();
  dateInput.value = toISODate(today);

  // auto pick day by today's date (before user pins)
  const autoDay = mapDateToPlanDay(dateInput.value);
  if (autoDay) selectedDay = autoDay;

  selectedDay = selectedDay || days[0];
  daySelect.value = selectedDay;

  daySelect.addEventListener("change", () => {
    selectedDay = daySelect.value;
    dayPinnedByUser = true;
    selectedExercise = null;
    currentSetsDraft = [];
    renderExercises();
    renderSets();
    // keep history selection as-is unless user selects an exercise
  });

  dateInput.addEventListener("change", () => {
    if (dayPinnedByUser) return;
    const auto = mapDateToPlanDay(dateInput.value);
    if (auto && auto !== selectedDay) {
      selectedDay = auto;
      daySelect.value = selectedDay;
      selectedExercise = null;
      currentSetsDraft = [];
      renderExercises();
      renderSets();
    }
  });

  btnAddExercise.addEventListener("click", () => {
    newExerciseName.value = "";
    newExerciseDay.value = selectedDay;
    dlgExercise.showModal();
    setTimeout(() => newExerciseName.focus(), 50);
  });

  btnSaveExercise.addEventListener("click", (e) => {
    const name = newExerciseName.value.trim();
    const day = newExerciseDay.value;
    if (!name) { e.preventDefault(); return; }

    if (!state.plan[day].includes(name)) state.plan[day].push(name);
    if (!state.exercises.includes(name)) state.exercises.push(name);
    state.exercises.sort((a, b) => a.localeCompare(b, "ru"));
    saveData();

    selectedDay = day;
    daySelect.value = selectedDay;
    dayPinnedByUser = true;

    renderExercises();
    renderHistoryControls();
  });

  btnAddSet.addEventListener("click", () => {
    if (!selectedExercise) return;
    currentSetsDraft.push({ weight: "", reps: "" });
    renderSets();
  });

  btnFinish.addEventListener("click", () => finishWorkout());

  btnExport.addEventListener("click", exportData);
  importFile.addEventListener("change", importData);
  btnReset.addEventListener("click", resetData);

  // History controls
  metricSelect.addEventListener("change", renderHistory);
  rangeSelect.addEventListener("change", renderHistory);
  historyExercise.addEventListener("change", renderHistory);

  renderExercises();
  renderSets();
  renderHistoryControls();
  renderHistory(); // initial
}

function renderExercises() {
  const list = state.plan[selectedDay] || [];
  exerciseList.innerHTML = "";

  list.forEach((ex) => {
    const el = document.createElement("div");
    el.className = "item";
    const isActive = ex === selectedExercise;

    const rec = recs[ex] ? `реком.: ${recs[ex]}` : "";

    el.innerHTML = `
      <div class="item__meta">
        <div class="item__title">${escapeHtml(ex)}</div>
        <div class="item__sub">${isActive ? "выбрано" : escapeHtml(rec)}</div>
      </div>
    `;
    el.style.cursor = "pointer";

    el.addEventListener("click", () => {
      selectedExercise = ex;
      currentSetsDraft = [];
      renderExercises();
      renderSets();
      btnAddSet.disabled = false;
      btnFinish.disabled = false;

      // Also update history panel immediately to this exercise
      historyExercise.value = ex;
      renderHistory();
    });

    if (isActive) el.style.borderColor = "rgba(79,140,255,.55)";
    exerciseList.appendChild(el);
  });

  btnAddSet.disabled = !selectedExercise;
  btnFinish.disabled = !selectedExercise;
}

function renderSets() {
  setsPanel.innerHTML = "";

  if (!selectedExercise) {
    setsPanel.innerHTML = `<div class="hint">Выбери упражнение слева, потом добавляй подходы.</div>`;
    btnAddSet.disabled = true;
    btnFinish.disabled = true;
    return;
  }

  if (currentSetsDraft.length === 0) {
    setsPanel.innerHTML = `<div class="hint">Нажми “+ Подход”, чтобы начать.</div>`;
  }

  currentSetsDraft.forEach((s, idx) => {
    const row = document.createElement("div");
    row.className = "set";
    row.innerHTML = `
      <div>
        <small>Подход</small>
        <div>#${idx + 1}</div>
      </div>
      <div>
        <small>Вес</small>
        <input inputmode="decimal" placeholder="кг" value="${escapeAttr(s.weight)}" />
      </div>
      <div>
        <small>Повторы</small>
        <input inputmode="numeric" placeholder="раз" value="${escapeAttr(s.reps)}" />
      </div>
      <button title="Удалить">✕</button>
    `;

    const inputs = row.querySelectorAll("input");
    inputs[0].addEventListener("input", (e) => { currentSetsDraft[idx].weight = e.target.value; });
    inputs[1].addEventListener("input", (e) => { currentSetsDraft[idx].reps = e.target.value; });

    row.querySelector("button").addEventListener("click", () => {
      currentSetsDraft.splice(idx, 1);
      renderSets();
    });

    setsPanel.appendChild(row);
  });
}

function finishWorkout() {
  const date = dateInput.value || toISODate(new Date());

  const sets = currentSetsDraft
    .map(s => ({
      weight: parseFloat(String(s.weight).replace(",", ".")),
      reps: parseInt(String(s.reps), 10)
    }))
    .filter(s => Number.isFinite(s.weight) && Number.isFinite(s.reps) && s.reps > 0);

  if (!selectedExercise) return;
  if (sets.length === 0) {
    alert("Добавь хотя бы один подход (вес + повторы).");
    return;
  }

  state.workouts.push({
    date,
    day: selectedDay,
    exercise: selectedExercise,
    sets
  });

  saveData();

  currentSetsDraft = [];
  renderSets();
  renderHistoryControls();

  // After saving, keep history on this exercise and refresh
  if (historyExercise.value !== selectedExercise) historyExercise.value = selectedExercise;
  renderHistory();
}

function renderHistoryControls() {
  const exs = state.exercises && state.exercises.length ? state.exercises : buildExerciseIndex(state.plan);
  const current = historyExercise.value || exs[0] || "";

  historyExercise.innerHTML = exs.map(x => `<option value="${escapeAttr(x)}">${escapeHtml(x)}</option>`).join("");

  if (exs.includes(current)) historyExercise.value = current;

  // If user already selected an exercise today, align history selector
  if (selectedExercise && exs.includes(selectedExercise)) {
    historyExercise.value = selectedExercise;
  }
}

function renderHistory() {
  const ex = historyExercise.value;
  if (!ex) return;

  const metric = metricSelect.value;
  const daysRange = parseInt(rangeSelect.value, 10);
  const cutoff = daysRange === 9999 ? null : new Date(Date.now() - daysRange * 24 * 60 * 60 * 1000);

  const rows = state.workouts
    .filter(w => w.exercise === ex)
    .filter(w => !cutoff || new Date(w.date) >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Build daily points (one per saved "exercise per day" entry)
  const points = rows.map(w => {
    const topW = Math.max(...w.sets.map(s => s.weight));
    const vol = w.sets.reduce((acc, s) => acc + (s.weight * s.reps), 0);
    const repsTotal = w.sets.reduce((acc, s) => acc + s.reps, 0);
    return {
      date: w.date,
      topWeight: topW,
      volume: vol,
      repsTotal,
      setsCount: w.sets.length
    };
  });

  renderHistoryTable(points, metric);
}

function renderHistoryTable(points, metric) {
  const title = metric === "topWeight" ? "Топ вес" : "Объём";
  const fmt = (p) => metric === "topWeight"
    ? `${round1(p.topWeight)} кг`
    : `${Math.round(p.volume)} кг×повт`;

  // last workout summary
  const last = points.length ? points[points.length - 1] : null;
  const lastLine = last
    ? `Последний раз: <b>${escapeHtml(last.date)}</b> — ${escapeHtml(fmt(last))} (подходов: ${last.setsCount}, повторов: ${last.repsTotal})`
    : `Нет записей по этому упражнению пока.`;

  const html = `
    <div class="hint" style="margin: 6px 0 10px;">${lastLine}</div>
    <table>
      <thead><tr><th>Дата</th><th>${escapeHtml(title)}</th></tr></thead>
      <tbody>
        ${points.slice().reverse().map(p => `<tr><td>${escapeHtml(p.date)}</td><td>${escapeHtml(fmt(p))}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
  historyTable.innerHTML = `<div class="table">${html}</div>`;
}

// ====== Export/Import/Reset ======
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `workout-tracker-backup-${toISODate(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importData(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(reader.result);
      if (!incoming || typeof incoming !== "object") throw new Error("bad");
      state = incoming;
      if (!state.plan) state.plan = defaultPlan;
      if (!state.workouts) state.workouts = [];
      if (!state.exercises) state.exercises = buildExerciseIndex(state.plan);
      saveData();
      init();
      alert("Импорт выполнен.");
    } catch {
      alert("Не получилось импортировать файл. Проверь, что это backup .json из приложения.");
    } finally {
      importFile.value = "";
    }
  };
  reader.readAsText(file);
}

function resetData() {
  if (!confirm("Точно сбросить все данные? Это удалит историю тренировок.")) return;
  state = { plan: defaultPlan, workouts: [], exercises: buildExerciseIndex(defaultPlan) };
  saveData();
  init();
}

// ====== Utils ======
function toISODate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function round1(n) { return Math.round(n * 10) / 10; }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }

function mapDateToPlanDay(isoDate) {
  const d = new Date(isoDate + "T12:00:00");
  const dow = d.getDay(); // 0=Sun ... 6=Sat

  const keys = Object.keys(state.plan);
  const findKeyStartsWith = (prefix) => keys.find(k => k.startsWith(prefix)) || null;

  if (dow === 1) return findKeyStartsWith("Понедельник");
  if (dow === 2) return findKeyStartsWith("Вторник");
  if (dow === 3) return findKeyStartsWith("Среда");
  if (dow === 4) return findKeyStartsWith("Четверг");
  if (dow === 5) return findKeyStartsWith("Пятница");
  if (dow === 6) return findKeyStartsWith("Суббота");
  return findKeyStartsWith("Воскресенье");
}

// ====== Boot ======
init();
