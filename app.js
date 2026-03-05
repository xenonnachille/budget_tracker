const STORAGE_KEY = "budgetEntries.v1";
const SETTINGS_KEY = "budgetSyncSettings.v1";
const THEME_KEY = "budgetTheme.v1";
const DEFAULT_CATEGORIES = [
  "Еда", "Транспорт", "Жильё", "Подписки", "Здоровье", "Одежда", "Подарки", "Развлечения", "Образование", "Зарплата", "Фриланс"
];

const state = {
  entries: [],
  settings: { url: "", token: "", lastSyncAt: null },
  installPrompt: null,
  statsView: "month",
  theme: "dark",
  advancedStatsOpened: false,
};

const el = {
  form: document.getElementById("entryForm"),
  type: document.getElementById("type"),
  amount: document.getElementById("amount"),
  category: document.getElementById("category"),
  date: document.getElementById("date"),
  note: document.getElementById("note"),
  suggestions: document.getElementById("categorySuggestions"),
  table: document.getElementById("entriesTable"),
  balance: document.getElementById("balance"),
  monthViewBtn: document.getElementById("monthViewBtn"),
  yearViewBtn: document.getElementById("yearViewBtn"),
  periodStatsTable: document.getElementById("periodStatsTable"),
  periodChart: document.getElementById("periodChart"),
  chartCaption: document.getElementById("chartCaption"),
  networkStatus: document.getElementById("networkStatus"),
  syncStatus: document.getElementById("syncStatus"),
  syncForm: document.getElementById("syncForm"),
  syncUrl: document.getElementById("syncUrl"),
  syncToken: document.getElementById("syncToken"),
  syncNowBtn: document.getElementById("syncNowBtn"),
  installBtn: document.getElementById("installBtn"),
  themeSelect: document.getElementById("themeSelect"),
  toggleAdvancedStatsBtn: document.getElementById("toggleAdvancedStatsBtn"),
  advancedStats: document.getElementById("advancedStats"),
  incomeCategoryChart: document.getElementById("incomeCategoryChart"),
  expenseCategoryChart: document.getElementById("expenseCategoryChart"),
  incomeCategoryCaption: document.getElementById("incomeCategoryCaption"),
  expenseCategoryCaption: document.getElementById("expenseCategoryCaption"),
};

function loadState() {
  state.entries = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  state.settings = {
    url: "",
    token: "",
    lastSyncAt: null,
    ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"),
  };
  state.theme = localStorage.getItem(THEME_KEY) || "dark";
}

function saveTheme() {
  localStorage.setItem(THEME_KEY, state.theme);
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function formatMoney(value) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(value);
}

function uniqueCategories() {
  const source = state.entries.map((e) => e.category).concat(DEFAULT_CATEGORIES);
  const countMap = source.reduce((acc, name) => {
    const key = String(name || "").trim();
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(countMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 20);
}

function renderCategories() {
  el.suggestions.innerHTML = "";
  uniqueCategories().forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    el.suggestions.appendChild(option);
  });
}

function renderStats() {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  let income = 0;
  let expense = 0;
  let monthIncome = 0;
  let monthExpense = 0;
  let yearIncome = 0;
  let yearExpense = 0;

  state.entries.forEach((entry) => {
    const amount = Number(entry.amount) || 0;
    if (entry.type === "income") income += amount;
    else expense += amount;

    const d = new Date(entry.date);
    if (Number.isNaN(d.getTime())) return;

    if (d.getFullYear() === year) {
      if (entry.type === "income") yearIncome += amount;
      else yearExpense += amount;

      if (d.getMonth() === month) {
        if (entry.type === "income") monthIncome += amount;
        else monthExpense += amount;
      }
    }
  });

  el.balance.textContent = formatMoney(income - expense);
  const periodStats = {
    month: {
      label: "месяца",
      income: monthIncome,
      expense: monthExpense,
      net: monthIncome - monthExpense,
      byCategory: collectCategoryTotals((d) => d.getFullYear() === year && d.getMonth() === month),
    },
    year: {
      label: "года",
      income: yearIncome,
      expense: yearExpense,
      net: yearIncome - yearExpense,
      byCategory: collectCategoryTotals((d) => d.getFullYear() === year),
    },
  };

  const activePeriod = periodStats[state.statsView];
  renderPeriodTable(activePeriod);
  renderPeriodChart(activePeriod);
  renderAdvancedStats(activePeriod);
  updateStatsSwitch();
}

function collectCategoryTotals(inPeriod) {
  return state.entries.reduce((acc, entry) => {
    const d = new Date(entry.date);
    if (Number.isNaN(d.getTime()) || !inPeriod(d)) return acc;
    const category = entry.category?.trim() || "Без категории";
    const amount = Number(entry.amount) || 0;
    if (!acc[entry.type]) acc[entry.type] = {};
    acc[entry.type][category] = (acc[entry.type][category] || 0) + amount;
    return acc;
  }, { income: {}, expense: {} });
}

function renderPeriodTable(stats) {
  el.periodStatsTable.innerHTML = `
    <tr>
      <td>Доходы ${stats.label}</td>
      <td>${formatMoney(stats.income)}</td>
    </tr>
    <tr>
      <td>Расходы ${stats.label}</td>
      <td>${formatMoney(stats.expense)}</td>
    </tr>
    <tr class="net-row ${stats.net >= 0 ? "positive" : "negative"}">
      <td>Итог ${stats.label}</td>
      <td>${formatMoney(stats.net)}</td>
    </tr>
  `;
}

function renderPeriodChart(stats) {
  const canvas = el.periodChart;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const total = stats.income + stats.expense;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = 92;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0d1628";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  if (total <= 0) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = "14px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Нет данных", centerX, centerY + 4);
    el.chartCaption.textContent = "Добавьте операции, чтобы увидеть распределение.";
    return;
  }

  const incomeAngle = (stats.income / total) * Math.PI * 2;

  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.fillStyle = "#22c55e";
  ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + incomeAngle);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.fillStyle = "#ef4444";
  ctx.arc(centerX, centerY, radius, -Math.PI / 2 + incomeAngle, -Math.PI / 2 + Math.PI * 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#111a2f";
  ctx.beginPath();
  ctx.arc(centerX, centerY, 52, 0, Math.PI * 2);
  ctx.fill();

  const incomePercent = Math.round((stats.income / total) * 100);
  const expensePercent = 100 - incomePercent;
  el.chartCaption.textContent = `Доходы: ${incomePercent}% · Расходы: ${expensePercent}%`;
}

function renderCategoryChart(canvas, captionEl, categoryMap, emptyText, colorBase) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const entries = Object.entries(categoryMap)
    .map(([name, amount]) => ({ name, amount: Number(amount) || 0 }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const total = entries.reduce((sum, item) => sum + item.amount, 0);
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = 80;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (total <= 0) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = "14px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Нет данных", centerX, centerY + 4);
    captionEl.textContent = emptyText;
    return;
  }

  let start = -Math.PI / 2;
  entries.forEach((item, index) => {
    const angle = (item.amount / total) * Math.PI * 2;
    const hueShift = (index * 27) % 70;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.fillStyle = `hsl(${colorBase + hueShift}, 70%, 55%)`;
    ctx.arc(centerX, centerY, radius, start, start + angle);
    ctx.closePath();
    ctx.fill();
    start += angle;
  });

  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
  ctx.beginPath();
  ctx.arc(centerX, centerY, 42, 0, Math.PI * 2);
  ctx.fill();

  captionEl.textContent = entries
    .slice(0, 3)
    .map((item) => `${item.name}: ${Math.round((item.amount / total) * 100)}%`)
    .join(" · ");
}

function renderAdvancedStats(stats) {
  renderCategoryChart(
    el.incomeCategoryChart,
    el.incomeCategoryCaption,
    stats.byCategory.income,
    "Нет доходов по категориям в выбранном периоде.",
    130
  );
  renderCategoryChart(
    el.expenseCategoryChart,
    el.expenseCategoryCaption,
    stats.byCategory.expense,
    "Нет расходов по категориям в выбранном периоде.",
    350
  );
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  el.themeSelect.value = state.theme;
}

function toggleAdvancedStats() {
  state.advancedStatsOpened = !state.advancedStatsOpened;
  el.advancedStats.hidden = !state.advancedStatsOpened;
  el.toggleAdvancedStatsBtn.textContent = state.advancedStatsOpened ? "Скрыть" : "Подробнее";
  el.toggleAdvancedStatsBtn.setAttribute("aria-expanded", String(state.advancedStatsOpened));
}

function updateStatsSwitch() {
  const isMonth = state.statsView === "month";
  el.monthViewBtn.classList.toggle("active", isMonth);
  el.yearViewBtn.classList.toggle("active", !isMonth);
  el.monthViewBtn.setAttribute("aria-selected", String(isMonth));
  el.yearViewBtn.setAttribute("aria-selected", String(!isMonth));
}

function renderTable() {
  el.table.innerHTML = "";
  const rows = [...state.entries].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 30);
  rows.forEach((entry) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${entry.date}</td>
      <td class="tag-${entry.type}">${entry.type === "income" ? "Доход" : "Расход"}</td>
      <td>${entry.category}</td>
      <td>${formatMoney(entry.amount)}</td>
      <td>${entry.synced ? "✅" : "⏳"}</td>
    `;
    el.table.appendChild(tr);
  });
}

function updateNetworkStatus() {
  el.networkStatus.textContent = navigator.onLine ? "Онлайн" : "Оффлайн";
}

function updateSyncStatus(message) {
  if (message) el.syncStatus.textContent = message;
  else if (!state.settings.url) el.syncStatus.textContent = "Не настроена";
  else if (!navigator.onLine) el.syncStatus.textContent = "Ожидание сети";
  else el.syncStatus.textContent = "Готова";
}

function renderAll() {
  renderCategories();
  renderStats();
  renderTable();
  updateNetworkStatus();
  updateSyncStatus();
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function syncWithGoogle() {
  if (!state.settings.url) {
    updateSyncStatus("URL не задан");
    return;
  }
  if (!navigator.onLine) {
    updateSyncStatus("Оффлайн — отложено");
    return;
  }

  updateSyncStatus("Синхронизация…");

  let endpoint;
  try {
    endpoint = new URL(state.settings.url);
  } catch (error) {
    console.error(error);
    updateSyncStatus("Некорректный URL синхронизации");
    return;
  }

  if (state.settings.token) endpoint.searchParams.set("token", state.settings.token);

  try {
    endpoint.searchParams.set("action", "pull");
    const pullResp = await fetch(endpoint.toString(), { method: "GET" });
    if (pullResp.ok) {
      const pullData = await safeJson(pullResp);
      mergeRemoteEntries(Array.isArray(pullData.entries) ? pullData.entries : []);
    }

    const unsynced = state.entries.filter((entry) => !entry.synced);
    if (unsynced.length) {
      endpoint.searchParams.set("action", "push");
      const pushResp = await fetch(endpoint.toString(), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ entries: unsynced }),
      });
      if (!pushResp.ok) throw new Error(`Push failed: ${pushResp.status}`);
      const result = await safeJson(pushResp);
      const syncedIds = new Set((result.syncedIds || unsynced.map((e) => e.id)).map(String));
      state.entries = state.entries.map((entry) => (syncedIds.has(String(entry.id)) ? { ...entry, synced: true } : entry));
      saveEntries();
    }

    state.settings.lastSyncAt = new Date().toISOString();
    saveSettings();
    updateSyncStatus(`OK: ${new Date().toLocaleTimeString("ru-RU")}`);
    renderAll();
  } catch (error) {
    console.error(error);
    updateSyncStatus("Ошибка синхронизации");
  }
}


async function safeJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("Invalid JSON from sync endpoint", text);
    throw new Error("Invalid JSON response");
  }
}

function mergeRemoteEntries(remoteEntries) {
  const localById = new Map(state.entries.map((e) => [String(e.id), e]));
  remoteEntries.forEach((remote) => {
    if (!remote || !remote.id) return;
    const key = String(remote.id);
    const existing = localById.get(key);
    if (!existing || new Date(remote.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
      localById.set(key, { ...remote, amount: Number(remote.amount), synced: true });
    }
  });
  state.entries = [...localById.values()];
  saveEntries();
}

function attachEvents() {
  el.date.valueAsDate = new Date();

  el.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const entry = {
      id: makeId(),
      type: el.type.value,
      amount: Number(el.amount.value),
      category: el.category.value.trim(),
      date: el.date.value,
      note: el.note.value.trim(),
      updatedAt: new Date().toISOString(),
      synced: false,
    };

    if (!entry.category || !entry.amount || !entry.date) return;

    state.entries.push(entry);
    saveEntries();
    el.form.reset();
    el.date.valueAsDate = new Date();
    renderAll();
    syncWithGoogle();
  });

  el.syncForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.settings.url = el.syncUrl.value.trim();
    state.settings.token = el.syncToken.value;
    saveSettings();
    updateSyncStatus("Настройки сохранены");
    syncWithGoogle();
  });

  el.syncNowBtn.addEventListener("click", () => syncWithGoogle());
  
  el.themeSelect.addEventListener("change", () => {
    state.theme = el.themeSelect.value;
    saveTheme();
    applyTheme();
  });

  el.toggleAdvancedStatsBtn.addEventListener("click", () => {
    toggleAdvancedStats();
  });

  el.monthViewBtn.addEventListener("click", () => {
    state.statsView = "month";
    renderStats();
  });

  el.yearViewBtn.addEventListener("click", () => {
    state.statsView = "year";
    renderStats();
  });

  window.addEventListener("online", () => {
    updateNetworkStatus();
    syncWithGoogle();
  });

  window.addEventListener("offline", () => {
    updateNetworkStatus();
    updateSyncStatus("Оффлайн — отложено");
  });

  setInterval(() => {
    if (navigator.onLine && state.settings.url) syncWithGoogle();
  }, 60000);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    el.installBtn.hidden = false;
  });

  el.installBtn.addEventListener("click", async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    el.installBtn.hidden = true;
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(console.error);
  }
}

function init() {
  loadState();
  applyTheme();
  el.syncUrl.value = state.settings.url || "";
  el.syncToken.value = state.settings.token || "";
  attachEvents();
  registerServiceWorker();
  renderAll();
  syncWithGoogle();
}

init();
