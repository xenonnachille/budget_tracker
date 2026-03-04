const STORAGE_KEY = "budgetEntries.v1";
const SETTINGS_KEY = "budgetSyncSettings.v1";
const DEFAULT_CATEGORIES = [
  "Еда", "Транспорт", "Жильё", "Подписки", "Здоровье", "Одежда", "Подарки", "Развлечения", "Образование", "Зарплата", "Фриланс"
];

const state = {
  entries: [],
  settings: { url: "", token: "", lastSyncAt: null },
  installPrompt: null,
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
  monthIncome: document.getElementById("monthIncome"),
  monthExpense: document.getElementById("monthExpense"),
  monthNet: document.getElementById("monthNet"),
  yearIncome: document.getElementById("yearIncome"),
  yearExpense: document.getElementById("yearExpense"),
  yearNet: document.getElementById("yearNet"),
  networkStatus: document.getElementById("networkStatus"),
  syncStatus: document.getElementById("syncStatus"),
  syncForm: document.getElementById("syncForm"),
  syncUrl: document.getElementById("syncUrl"),
  syncToken: document.getElementById("syncToken"),
  syncNowBtn: document.getElementById("syncNowBtn"),
  installBtn: document.getElementById("installBtn"),
};

function loadState() {
  state.entries = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  state.settings = {
    url: "",
    token: "",
    lastSyncAt: null,
    ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"),
  };
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

  const monthNet = monthIncome - monthExpense;
  const yearNet = yearIncome - yearExpense;

  el.balance.textContent = formatMoney(income - expense);
  el.monthIncome.textContent = formatMoney(monthIncome);
  el.monthExpense.textContent = formatMoney(monthExpense);
  el.monthNet.textContent = formatMoney(monthNet);
  el.yearIncome.textContent = formatMoney(yearIncome);
  el.yearExpense.textContent = formatMoney(yearExpense);
  el.yearNet.textContent = formatMoney(yearNet);

  el.monthNet.className = monthNet >= 0 ? "positive" : "negative";
  el.yearNet.className = yearNet >= 0 ? "positive" : "negative";
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
  el.syncUrl.value = state.settings.url || "";
  el.syncToken.value = state.settings.token || "";
  attachEvents();
  registerServiceWorker();
  renderAll();
  syncWithGoogle();
}

init();
