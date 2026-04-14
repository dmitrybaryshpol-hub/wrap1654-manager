const tg = window.Telegram?.WebApp || null;

const API_URL = "https://hbciwqgfccdfnzrhiops.supabase.co/functions/v1/smart-handler";

const state = {
  user: null,
  currentTab: "dashboard",
  calendarView: "day",
  calendarAnchor: new Date(),
  fxRate: 0,
  fxUpdatedAt: null,

  orders: [],
  clients: [],
  inventory: [],
  inventoryMovementsByItem: {},
  inventoryFilters: {
    search: "",
    category: "all",
    brand: "all",
    lowOnly: false,
  },

  editingOrderId: null,
  orderServices: [],
};

function getAppRoot() {
  return document.getElementById("appRoot");
}

function setStartupSplash(message, isError = false) {
  const splashText = document.getElementById("startupSplashText");
  if (splashText) splashText.textContent = String(message || "");
  document.body.classList.toggle("startup-failed", Boolean(isError));
}

function keepAppHidden() {
  const appRoot = getAppRoot();
  if (appRoot) appRoot.setAttribute("aria-hidden", "true");
  document.body.classList.add("app-booting");
}

function revealApp() {
  const appRoot = getAppRoot();
  if (appRoot) appRoot.setAttribute("aria-hidden", "false");
  document.body.classList.remove("startup-failed");
  document.body.classList.remove("app-booting");
}

function afterNextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const FILM_CATEGORIES = ["vinyl", "ppf", "tint"];
const PRODUCT_CATEGORIES = ["aroma_selective", "gyeon", "srb", "consumables", "chemicals", "tools", "accessories", "other"];
const PRODUCT_CATEGORY_LABELS = {
  aroma_selective: "Aroma selective",
  gyeon: "Gyeon",
  srb: "SRB",
  consumables: "Расходники",
  chemicals: "Химия",
  tools: "Инструменты",
  accessories: "Аксессуары",
  other: "Другое",
};
const LEGACY_FILM_MARKERS = new Set(["film"]);
const LEGACY_PRODUCT_MARKERS = new Set(["product"]);

function normalizeInventoryCategory(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (FILM_CATEGORIES.includes(normalized)) return normalized;
  if (PRODUCT_CATEGORIES.includes(normalized)) return normalized;
  if (LEGACY_FILM_MARKERS.has(normalized)) return "vinyl";
  if (LEGACY_PRODUCT_MARKERS.has(normalized)) return "other";
  return "";
}

function inventoryCategoryGroup(category = "") {
  const normalized = normalizeInventoryCategory(category);
  if (FILM_CATEGORIES.includes(normalized)) return "film";
  if (PRODUCT_CATEGORIES.includes(normalized)) return "product";
  return "product";
}

function defaultCategoryByType(type = "product") {
  return type === "film" ? FILM_CATEGORIES[0] : PRODUCT_CATEGORIES[0];
}

function getInventoryCategoryLabel(category = "") {
  const normalized = normalizeInventoryCategory(category);
  const key = normalized || String(category || "").trim();
  return PRODUCT_CATEGORY_LABELS[key] || key || "Без категории";
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("uk-UA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function currencySymbol(cur) {
  const code = String(cur || "").toUpperCase();
  if (code === "UAH") return "₴";
  if (code === "EUR") return "€";
  return "$";
}

function safeAlert(text) {
  if (tg?.showAlert) tg.showAlert(String(text));
  else alert(String(text));
}

function safeConfirm(text) {
  return new Promise((resolve) => {
    if (tg?.showConfirm) {
      tg.showConfirm(String(text), (ok) => resolve(Boolean(ok)));
      return;
    }
    resolve(confirm(String(text)));
  });
}

function renderBlockedScreen(title, text = "Открой приложение внутри Telegram") {
  keepAppHidden();
  setStartupSplash(text, true);

  const appRoot = getAppRoot();
  if (!appRoot) return;

  appRoot.innerHTML = `
    <div style="
      min-height:100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      background:#0b1120;
      color:#fff;
      font-family:Arial,sans-serif;
      padding:24px;
      text-align:center;
    ">
      <div>
        <h2 style="margin:0 0 10px 0;">${escapeHtml(title)}</h2>
        <p style="margin:0; opacity:.8;">${escapeHtml(text)}</p>
      </div>
    </div>
  `;
}

async function api(action, data = {}) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      initData: tg?.initData || "",
      ...data,
    }),
  });

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error("Invalid API response");
  }

  if (!res.ok || json?.ok === false) {
    console.error("API error:", json);
    throw new Error(json?.error || "API error");
  }

  return json;
}

async function loadClientsToState() {
  try {
    const res = await api("get_clients");
    state.clients = Array.isArray(res.items) ? res.items : [];
  } catch (e) {
    console.error("LOAD CLIENTS ERROR:", e);
    state.clients = [];
  }
}

function renderClientOptions(selectedId = "") {
  const select = document.getElementById("client_id");
  if (!select) return;

  const clients = state.clients || [];

  select.innerHTML = `
    <option value="">Выберите клиента</option>
    ${clients.map((client) => `
      <option value="${client.id}" ${String(client.id) === String(selectedId) ? "selected" : ""}>
        ${escapeHtml(client.full_name || "Без имени")}
        ${client.phone ? " — " + escapeHtml(client.phone) : ""}
      </option>
    `).join("")}
  `;
}

function syncSelectedClientToOrderForm() {
  const select = document.getElementById("client_id");
  const nameInput = document.getElementById("client_name");
  if (!select || !nameInput) return;

  const client = (state.clients || []).find(c => String(c.id) === String(select.value));
  if (!client) return;

  nameInput.value = client.full_name || "";
}

function card(html, extra = "") {
  return `
    <div style="
      background:linear-gradient(180deg, rgba(24,28,45,.9) 0%, rgba(16,20,34,.95) 100%);
      border:1px solid rgba(167,139,250,.16);
      border-radius:18px;
      padding:14px;
      margin-bottom:12px;
      box-shadow:0 10px 24px rgba(2,6,23,.38), inset 0 1px 0 rgba(255,255,255,.03);
      ${extra}
    ">
      ${html}
    </div>
  `;
}

function btn(text, onclick, extra = "", variant = "primary") {
  const variantClass = variant === "secondary"
    ? "ui-btn-secondary"
    : variant === "danger"
      ? "ui-btn-danger"
      : "ui-btn-primary";
  return `
    <button onclick="${onclick}" class="ui-btn ${variantClass}" style="${extra}">${text}</button>
  `;
}

function renderToneBadge(label, tone = {}) {
  return `
    <span class="ui-status-badge" style="
      background:${tone.bg || "rgba(148,163,184,.15)"};
      color:${tone.color || "#e2e8f0"};
      border-color:${tone.border || "rgba(148,163,184,.35)"};
    ">${escapeHtml(label || "—")}</span>
  `;
}

function renderStatusBadge(status = "") {
  const visual = statusVisual(status);
  return renderToneBadge(visual.label, { bg: visual.bg, color: visual.color, border: visual.border });
}

function renderEmptyState({ icon = "ℹ️", title = "Пока пусто", description = "" } = {}) {
  return `
    <div class="ui-empty-state">
      <div class="ui-empty-icon">${escapeHtml(icon)}</div>
      <div class="ui-empty-title">${escapeHtml(title)}</div>
      ${description ? `<div class="ui-empty-description">${escapeHtml(description)}</div>` : ""}
    </div>
  `;
}

function orderLabel(order) {
  return escapeHtml(
    order?.order_number || (order?.id ? `Заказ ${String(order.id).slice(0, 8)}` : "Заказ")
  );
}

const SERVICES_MARKER = "[services]";

function normalizeServiceName(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function parseServicesFromNote(note = "") {
  const source = String(note || "");
  const lines = source.split("\n");
  const markerIndex = lines.findIndex((line) => line.trim().toLowerCase() === SERVICES_MARKER);

  if (markerIndex === -1) {
    return { services: [], cleanNote: source.trim() };
  }

  const bodyLines = lines.slice(markerIndex + 1);
  const services = bodyLines
    .map((line) => line.replace(/^[-•*]\s*/, ""))
    .map(normalizeServiceName)
    .filter(Boolean);

  const cleanNote = lines.slice(0, markerIndex).join("\n").trim();
  return { services, cleanNote };
}

function composeNoteWithServices(note = "", services = []) {
  const cleanNote = String(note || "").trim();
  const normalizedServices = (services || [])
    .map(normalizeServiceName)
    .filter(Boolean);

  if (!normalizedServices.length) return cleanNote || null;

  const servicesBlock = [
    SERVICES_MARKER,
    ...normalizedServices.map((service) => `- ${service}`),
  ].join("\n");

  return cleanNote ? `${cleanNote}\n\n${servicesBlock}` : servicesBlock;
}

function collectServiceSuggestions() {
  const all = new Set();
  (state.orders || []).forEach((order) => {
    const parsed = parseServicesFromNote(order?.note || "");
    parsed.services.forEach((service) => all.add(service));
  });
  return Array.from(all).sort((a, b) => a.localeCompare(b, "uk"));
}

async function ensureOrdersLoadedForSuggestions() {
  if ((state.orders || []).length) return;
  try {
    const res = await api("get_orders");
    state.orders = Array.isArray(res.items) ? res.items : [];
  } catch (e) {
    console.warn("Could not pre-load orders for service suggestions:", e?.message || e);
  }
}

function renderServicesList() {
  const listRoot = document.getElementById("services_list");
  if (!listRoot) return;

  const services = Array.isArray(state.orderServices) ? state.orderServices : [];
  if (!services.length) {
    listRoot.innerHTML = `<div style="opacity:.72; font-size:13px; padding:10px 12px; border-radius:12px; border:1px dashed rgba(167,139,250,.34); color:#a5b4d4;">Добавьте хотя бы одну услугу</div>`;
    return;
  }

  listRoot.innerHTML = services.map((service, index) => `
    <div style="
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      padding:9px 11px;
      border:1px solid rgba(167,139,250,.2);
      border-radius:12px;
      margin-bottom:8px;
      background:rgba(15,20,36,.78);
    ">
      <div style="font-size:14px;">${escapeHtml(service)}</div>
      <button
        onclick="removeOrderService(${index})"
        style="padding:6px 8px; border-radius:8px; border:1px solid rgba(239,68,68,.35); background:rgba(239,68,68,.15); color:#fecaca;"
      >Удалить</button>
    </div>
  `).join("");
}

function addOrderService() {
  const input = document.getElementById("service_input");
  if (!input) return;

  const value = normalizeServiceName(input.value);
  if (!value) return;

  const hasSame = (state.orderServices || []).some((s) => s.toLowerCase() === value.toLowerCase());
  if (!hasSame) {
    state.orderServices = [...(state.orderServices || []), value];
    renderServicesList();
  }
  input.value = "";
}

function removeOrderService(index) {
  state.orderServices = (state.orderServices || []).filter((_, i) => i !== Number(index));
  renderServicesList();
}

function bindServicesEditor(initialServices = []) {
  state.orderServices = Array.isArray(initialServices)
    ? initialServices.map(normalizeServiceName).filter(Boolean)
    : [];

  renderServicesList();

  const input = document.getElementById("service_input");
  const addBtn = document.getElementById("service_add_btn");

  if (addBtn) addBtn.addEventListener("click", addOrderService);
  if (input) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addOrderService();
      }
    });
  }
}

function renderLayout() {
  const appRoot = getAppRoot();
  if (!appRoot) return;

  appRoot.innerHTML = `
    <style>
      :root{
        --app-bg:#060913;
        --surface-1:#141a2d;
        --surface-2:#1b2238;
        --line:rgba(167,139,250,.2);
        --text:#eef2ff;
        --muted:#9ca3bf;
        --accent:#8b5cf6;
        --accent-2:#6d28d9;
      }
      body{
        background:
          radial-gradient(120% 80% at 10% 0%, rgba(139,92,246,.18) 0%, rgba(7,10,20,0) 55%),
          radial-gradient(70% 50% at 90% 0%, rgba(76,29,149,.14) 0%, rgba(7,10,20,0) 60%),
          linear-gradient(180deg, #060913 0%, #050712 100%);
        color:var(--text);
      }
      #app-shell{
        max-width:920px;
        margin:0 auto;
      }
      #bottom-nav{
        max-width:920px;
        margin:0 auto;
        border:1px solid rgba(167,139,250,.18);
        border-bottom:0;
        border-radius:22px 22px 0 0;
        backdrop-filter:blur(10px);
      }
      .nav-btn{
        border:1px solid transparent;
        border-radius:16px;
        background:linear-gradient(180deg, rgba(30,41,59,.45), rgba(15,23,42,.4));
        color:#c7d2fe;
        font-weight:700;
        padding:10px 8px;
        white-space:nowrap;
        min-height:64px;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:4px;
        font-size:11px;
        line-height:1.1;
      }
      .nav-btn.active{
        color:#f5f3ff;
        background:linear-gradient(180deg, rgba(139,92,246,.5), rgba(109,40,217,.45));
        border-color:rgba(196,181,253,.45);
        box-shadow:0 6px 18px rgba(109,40,217,.28), inset 0 1px 0 rgba(255,255,255,.16);
      }
      .nav-icon{
        font-size:18px;
        line-height:1;
      }
      .nav-label{
        font-size:11px;
        font-weight:700;
      }
      input,select,textarea{
        background:linear-gradient(180deg, rgba(18,23,40,.9), rgba(15,19,34,.96));
        border:1px solid rgba(167,139,250,.16);
        color:#f8fafc;
        border-radius:13px;
      }
      input::placeholder, textarea::placeholder{ color:#7f8ab0; }
      .soft-chip{
        display:inline-flex;
        align-items:center;
        gap:6px;
        padding:5px 10px;
        border-radius:999px;
        font-size:11px;
        font-weight:700;
        border:1px solid rgba(167,139,250,.28);
        background:rgba(30,41,69,.55);
        color:#dbeafe;
      }
      .ui-ghost-btn{
        border:1px solid rgba(148,163,184,.35);
        background:linear-gradient(180deg, rgba(30,41,59,.72), rgba(15,23,42,.82));
        color:#e2e8f0;
        border-radius:11px;
        padding:9px 12px;
        font-size:12px;
        font-weight:700;
      }
      .ui-danger-btn{
        border:1px solid rgba(248,113,113,.45);
        background:linear-gradient(180deg, rgba(127,29,29,.4), rgba(69,10,10,.5));
        color:#fee2e2;
        border-radius:11px;
        padding:9px 12px;
        font-size:12px;
        font-weight:700;
      }
      .ui-btn{
        padding:11px 13px;
        border-radius:12px;
        cursor:pointer;
        font-weight:700;
        box-shadow:0 4px 14px rgba(2,6,23,.32);
        border:1px solid transparent;
        color:#fff;
      }
      .ui-btn-primary{
        border-color:rgba(167,139,250,.24);
        background:linear-gradient(180deg, rgba(60,72,104,.45), rgba(36,46,76,.68));
      }
      .ui-btn-secondary{
        border-color:rgba(148,163,184,.35);
        background:linear-gradient(180deg, rgba(30,41,59,.72), rgba(15,23,42,.82));
        color:#e2e8f0;
      }
      .ui-btn-danger{
        border-color:rgba(248,113,113,.45);
        background:linear-gradient(180deg, rgba(127,29,29,.4), rgba(69,10,10,.5));
        color:#fee2e2;
      }
      .ui-status-badge{
        display:inline-flex;
        align-items:center;
        padding:5px 10px;
        border-radius:999px;
        font-size:11px;
        font-weight:800;
        border:1px solid transparent;
        text-transform:uppercase;
        letter-spacing:.03em;
      }
      .ui-secondary-text{
        font-size:12px;
        color:#94a3b8;
      }
      .ui-empty-state{
        text-align:center;
        border:1px dashed rgba(148,163,184,.35);
        border-radius:12px;
        background:rgba(15,23,42,.45);
        padding:14px 10px;
      }
      .ui-empty-icon{
        font-size:20px;
        margin-bottom:4px;
      }
      .ui-empty-title{
        font-size:14px;
        font-weight:800;
      }
      .ui-empty-description{
        margin-top:4px;
        font-size:12px;
        color:#94a3b8;
        line-height:1.4;
      }
      .kpi-card{
        padding:11px;
        border-radius:13px;
        border:1px solid rgba(167,139,250,.2);
        background:linear-gradient(180deg, rgba(9,15,30,.9), rgba(6,10,24,.95));
        min-height:88px;
        display:flex;
        flex-direction:column;
        justify-content:space-between;
      }
      .kpi-strip{
        display:grid;
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:6px;
        margin-bottom:12px;
      }
      .kpi-tile{
        border-radius:12px;
        border:1px solid rgba(167,139,250,.22);
        background:linear-gradient(180deg, rgba(10,16,30,.88), rgba(7,11,24,.93));
        padding:8px 9px;
        min-height:62px;
        display:flex;
        flex-direction:column;
        justify-content:space-between;
      }
      .kpi-label{
        font-size:10px;
        color:#9ca3af;
        line-height:1.1;
      }
      .kpi-value{
        margin-top:4px;
        font-size:20px;
        font-weight:800;
        line-height:1;
      }
      @media (max-width:390px){
        .kpi-strip{
          grid-template-columns:repeat(2,minmax(0,1fr));
        }
      }
    </style>
    <div id="app-shell" style="
      padding-bottom:92px;
      color:#fff;
      background:transparent;
      min-height:100vh;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
    ">
      <div style="
        margin:14px 12px 10px;
        padding:16px;
        border-radius:22px;
        border:1px solid rgba(167,139,250,.2);
        background:linear-gradient(180deg, rgba(20,26,45,.92), rgba(16,21,38,.95));
        box-shadow:0 14px 32px rgba(2,6,23,.4);
      ">
        <div style="font-size:22px; font-weight:800; letter-spacing:.2px;">Wrap 1654 CRM</div>
        <div style="font-size:12px; color:#9ca3bf; margin-top:2px;">
          ${escapeHtml(state.user?.first_name || state.user?.username || "User")}
        </div>
      </div>

      <div id="app">
        <div id="dashboard" class="tab"></div>
        <div id="orders" class="tab" style="display:none"></div>
        <div id="calendar" class="tab" style="display:none"></div>
        <div id="inventory" class="tab" style="display:none"></div>
        <div id="finance" class="tab" style="display:none"></div>
      </div>
    </div>

      <div id="bottom-nav" style="
      position:fixed;
      left:0;
      right:0;
      bottom:0;
      display:flex;
      gap:8px;
      overflow-x:auto;
      padding:10px 12px calc(12px + env(safe-area-inset-bottom, 0px));
      background:rgba(13,17,31,.92);
      border-top:1px solid rgba(167,139,250,.2);
      z-index:20;
    ">
      <button class="nav-btn" data-nav="dashboard" onclick="showTab('dashboard')" style="flex:1;">
        <span class="nav-icon">🏠</span>
        <span class="nav-label">Главная</span>
      </button>
      <button class="nav-btn" data-nav="orders" onclick="showTab('orders')" style="flex:1;">
        <span class="nav-icon">📦</span>
        <span class="nav-label">Заказы</span>
      </button>
      <button class="nav-btn" data-nav="calendar" onclick="showTab('calendar')" style="flex:1;">
        <span class="nav-icon">🗓️</span>
        <span class="nav-label">Календарь</span>
      </button>
      <button class="nav-btn" data-nav="inventory" onclick="showTab('inventory')" style="flex:1;">
        <span class="nav-icon">🧰</span>
        <span class="nav-label">Склад</span>
      </button>
      <button class="nav-btn" data-nav="finance" onclick="showTab('finance')" style="flex:1;">
        <span class="nav-icon">💰</span>
        <span class="nav-label">Финансы</span>
      </button>
    </div>

    <div id="modal"></div>
  `;
}

async function initApp() {
  keepAppHidden();
  setStartupSplash("Запуск приложения…");

  try {
    if (!tg || !tg.initData) {
      renderBlockedScreen("Доступ закрыт");
      return;
    }

    tg.expand();
    tg.ready();
    tg.setHeaderColor("#0f172a");
    tg.setBackgroundColor("#0b1120");

    setStartupSplash("Проверка доступа…");
    const auth = await api("auth");
    if (!auth?.user) {
      throw new Error("Unauthorized");
    }

    state.user = auth.user;

    setStartupSplash("Подготовка интерфейса…");
    await loadClientsToState();
    renderLayout();
    showTab("dashboard");

    await afterNextPaint();
    revealApp();
  } catch (e) {
    console.error("INIT ERROR:", e);
    renderBlockedScreen(
      "Ошибка авторизации",
      e instanceof Error ? e.message : "Unknown error"
    );
  }
}

function showTab(tab) {
  state.currentTab = tab;

  document.querySelectorAll(".tab").forEach((el) => {
    el.style.display = "none";
  });

  const current = document.getElementById(tab);
  if (current) current.style.display = "block";
  document.querySelectorAll("#bottom-nav .nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.nav === tab);
  });

  if (tab === "dashboard") loadDashboard();
  if (tab === "orders") loadOrders();
  if (tab === "calendar") loadCalendar();
  if (tab === "inventory") loadInventory();
  if (tab === "finance") loadFinance();
}

async function loadDashboard() {
  const el = document.getElementById("dashboard");
  if (!el) return;
  el.innerHTML = `<div style="padding:16px;">Загрузка...</div>`;

  try {
    const data = await api("dashboard");
    const stats = data.stats || {};
    const dashboardActiveOrders = Array.isArray(data.active_orders) ? data.active_orders : [];
    const activeOrders = dashboardActiveOrders.filter((order) => isActiveOrderStatus(order?.status));
    const lowStock = Array.isArray(data.low_stock) ? data.low_stock : [];
    const { buckets, soonHorizonDays } = buildCalendarOperationalBuckets(activeOrders, { soonHorizonDays: 3 });

    const lowStockCount = asNumber(
      stats.low_stock_count ?? lowStock.length,
      lowStock.length
    );
    const activeCount = asNumber(
      stats.active_count ?? stats.total_in_work ?? activeOrders.length,
      activeOrders.length
    );

    const quickActions = [
      { label: "➕ Новый заказ", action: "openCreateOrder()" },
      { label: "📦 Открыть заказы", action: "showTab('orders')" },
      { label: "🧰 Открыть склад", action: "showTab('inventory')" },
      { label: "👤 Открыть клиентов", action: "showTab('clients')" },
    ];

    el.innerHTML = `
      <div style="padding:16px;">
        <div class="kpi-strip">
          <div class="kpi-tile">
            <div class="kpi-label">Активные заказы</div>
            <div class="kpi-value">${activeCount}</div>
          </div>
          <div class="kpi-tile">
            <div class="kpi-label">Просрочено</div>
            <div class="kpi-value" style="color:#fca5a5;">${buckets.overdue.length}</div>
          </div>
          <div class="kpi-tile">
            <div class="kpi-label">Нужно планирование</div>
            <div class="kpi-value" style="color:#fde68a;">${buckets.unplanned.length}</div>
          </div>
          <div class="kpi-tile">
            <div class="kpi-label">Низкий остаток</div>
            <div class="kpi-value" style="color:#fbbf24;">${lowStockCount}</div>
          </div>
        </div>

        <h3 style="margin:12px 0 8px 0;">🚀 Быстрые действия</h3>
        ${card(`
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            ${quickActions.map((item) => btn(item.label, item.action, "width:100%;", "secondary")).join("")}
          </div>
        `)}

        ${renderCalendarOpsSection(
          "Сегодня",
          "Операционные события по датам на сегодня",
          [
            {
              label: "Заезды сегодня",
              items: buckets.today.arrivals,
              hint: (item) => `Приём: ${displayDate(item.intakeDateRaw)}`,
            },
            {
              label: "Старты сегодня",
              items: buckets.today.starts,
              hint: (item) => `Старт: ${displayDate(item.startDateRaw)}`,
            },
            {
              label: "Выдачи сегодня",
              items: buckets.today.completions,
              hint: (item) => `Финиш: ${displayDate(item.endDateRaw)}`,
            },
          ],
          { border: "rgba(96,165,250,.4)", accent: "#bfdbfe" }
        )}

        ${renderCalendarOpsSection(
          "Скоро",
          `План на ближайшие ${soonHorizonDays} дня`,
          [
            {
              label: "Ближайшие заезды",
              items: buckets.soon.arrivals,
              hint: (item) => `Приём: ${displayDate(item.intakeDateRaw)}`,
            },
            {
              label: "Ближайшие старты",
              items: buckets.soon.starts,
              hint: (item) => `Старт: ${displayDate(item.startDateRaw)}`,
            },
            {
              label: "Ближайшие выдачи",
              items: buckets.soon.completions,
              hint: (item) => `Финиш: ${displayDate(item.endDateRaw)}`,
            },
          ],
          { border: "rgba(52,211,153,.35)", accent: "#86efac" }
        )}

        ${card(`
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
            <div>
              <div style="font-size:15px; font-weight:800; color:#fca5a5;">Просрочено</div>
              <div style="font-size:12px; color:#94a3b8; margin-top:2px;">Плановая дата финиша в прошлом, заказ не в финальном статусе</div>
            </div>
            <span class="soft-chip" style="border-color:rgba(248,113,113,.4); color:#fecaca; background:rgba(69,10,10,.38);">${buckets.overdue.length}</span>
          </div>
          <div style="margin-top:8px;">
            ${buckets.overdue.length
              ? buckets.overdue.slice(0, 8).map((item) => renderCalendarOpsOrderCard(item, `Финиш: ${displayDate(item.endDateRaw)}`)).join("")
              : `<div style="font-size:12px; color:#6b7280;">Просроченных заказов нет</div>`
            }
          </div>
        `, "margin-bottom:10px; background:linear-gradient(180deg,#180f14,#150b12); border:1px solid rgba(248,113,113,.35);")}

        ${card(`
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
            <div>
              <div style="font-size:15px; font-weight:800; color:#fcd34d;">Нужно планирование</div>
              <div style="font-size:12px; color:#94a3b8; margin-top:2px;">Активные заказы с пробелами графика (нет старта/финиша)</div>
            </div>
            <span class="soft-chip" style="border-color:rgba(250,204,21,.4); color:#fde68a; background:rgba(66,32,6,.38);">${buckets.unplanned.length}</span>
          </div>
          <div style="margin-top:8px;">
            ${buckets.unplanned.length
              ? buckets.unplanned.slice(0, 8).map((item) => {
                  const missing = [
                    !parseDateOnly(item.startDateRaw) ? "нет даты старта" : null,
                    !parseDateOnly(item.endDateRaw) ? "нет даты финиша" : null,
                  ].filter(Boolean).join(", ");
                  return renderCalendarOpsOrderCard(item, missing || "Неполный график");
                }).join("")
              : `<div style="font-size:12px; color:#6b7280;">Пробелов планирования не найдено</div>`
            }
          </div>
        `, "margin-bottom:10px; background:linear-gradient(180deg,#19130a,#120f08); border:1px solid rgba(250,204,21,.35);")}

        <h3 style="margin:12px 0;">📉 Низкий остаток</h3>
        ${lowStock.length
          ? lowStock.slice(0, 6).map((i) => `
              ${card(`
                <div style="display:flex; justify-content:space-between; gap:8px; align-items:center;">
                  <div>
                    <div style="font-weight:700;">${escapeHtml(i.name || "")}</div>
                    <div style="font-size:12px; color:#9ca3af; margin-top:3px;">${escapeHtml(getInventoryCategoryLabel(i.category || i.normalized_category))}</div>
                  </div>
                  <div style="text-align:right; font-size:13px;">
                    <div>Текущий: ${formatMoney(i.quantity || 0)} ${escapeHtml(i.unit || "")}</div>
                    <div style="color:#fca5a5;">Мин: ${formatMoney(i.min_quantity || 0)} ${escapeHtml(i.unit || "")}</div>
                  </div>
                </div>
              `)}
            `).join("")
          : card(renderEmptyState({ icon: "✅", title: "Склад в норме", description: "Критических остатков сейчас нет." }))}
      </div>
    `;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div style="padding:16px;">Ошибка загрузки дашборда</div>`;
  }
}

async function loadOrders() {
  const el = document.getElementById("orders");
  if (!el) return;
  el.innerHTML = `<div style="padding:16px;">Загрузка...</div>`;

  try {
    const res = await api("get_orders");
    const orders = res.items || [];
    state.orders = orders;
    
    el.innerHTML = `
      <div style="padding:16px;">
        <div style="display:flex; gap:8px; margin-bottom:14px;">
          ${btn("+ Новый заказ", "openCreateOrder()")}
        </div>
        ${orders.length
          ? orders.map((o) => `
              <div onclick="openOrder('${o.id}')" style="cursor:pointer;">
                ${card(`
  <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
    <div>
      <div style="font-size:12px; letter-spacing:.06em; text-transform:uppercase; color:#94a3b8;">Заказ</div>
      <div style="font-size:18px; font-weight:900; margin-top:2px; color:#f5f3ff;">${orderLabel(o)}</div>
    </div>
    ${renderStatusBadge(o.status || "")}
  </div>

  <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px;">
    <div style="padding:9px 10px; border-radius:11px; background:rgba(15,23,42,.72); border:1px solid rgba(167,139,250,.2);">
      <div style="font-size:11px; color:#94a3b8;">Клиент</div>
      <div style="font-size:13px; font-weight:700; margin-top:3px;">${escapeHtml(o.client_name || "—")}</div>
    </div>
    <div style="padding:9px 10px; border-radius:11px; background:rgba(15,23,42,.72); border:1px solid rgba(167,139,250,.2);">
      <div style="font-size:11px; color:#94a3b8;">Авто</div>
      <div style="font-size:13px; font-weight:700; margin-top:3px;">${escapeHtml(o.car_model || "—")}</div>
    </div>
  </div>

  <div style="display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-top:10px;">
    <div style="padding:8px 9px; border-radius:10px; border:1px solid rgba(148,163,184,.22); background:rgba(9,14,27,.7);">
      <div style="font-size:10px; color:#94a3b8;">Сумма</div>
      <div style="font-size:14px; font-weight:800; margin-top:3px;">${formatMoney(o.total || 0)} ${currencySymbol(o.currency || "USD")}</div>
    </div>
    <div style="padding:8px 9px; border-radius:10px; border:1px solid rgba(52,211,153,.24); background:rgba(6,31,23,.45);">
      <div style="font-size:10px; color:#86efac;">Оплачено</div>
      <div style="font-size:14px; font-weight:800; margin-top:3px; color:#bbf7d0;">${formatMoney(o.paid || 0)} ${currencySymbol(o.currency || "USD")}</div>
    </div>
    <div style="padding:8px 9px; border-radius:10px; border:1px solid rgba(248,113,113,.3); background:rgba(69,10,10,.34);">
      <div style="font-size:10px; color:#fca5a5;">Долг</div>
      <div style="font-size:14px; font-weight:800; margin-top:3px; color:#fecaca;">${formatMoney(o.due || 0)} ${currencySymbol(o.currency || "USD")}</div>
    </div>
  </div>

  <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
    <button onclick="event.stopPropagation(); openOrder('${o.id}')" class="ui-btn ui-btn-secondary">Открыть</button>
    <button onclick="event.stopPropagation(); startEditOrder('${o.id}')" class="ui-btn ui-btn-secondary">Редактировать</button>
    <button onclick="event.stopPropagation(); handleDeleteOrder('${o.id}')" class="ui-btn ui-btn-danger">Удалить</button>
  </div>
`)}              </div>
            `).join("")
          : card(renderEmptyState({ icon: "📭", title: "Заказов пока нет", description: "Создайте первый заказ — он сразу появится в этом списке." }))}
      </div>
    `;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div style="padding:16px;">Ошибка загрузки заказов</div>`;
  }
}

function renderOrderMedia(order) {
  if (!order?.media_url) return "";

  const url = String(order.media_url);
  const lower = url.toLowerCase();

  if (/\.(jpg|jpeg|png|webp|gif)$/i.test(lower)) {
    return `
      <div style="margin:12px 0;">
        <img src="${escapeHtml(url)}" style="width:100%; border-radius:12px; border:1px solid #1f2937;">
      </div>
    `;
  }

  if (/\.(mp4|webm|mov|m4v)$/i.test(lower)) {
    return `
      <div style="margin:12px 0;">
        <video src="${escapeHtml(url)}" controls style="width:100%; border-radius:12px; border:1px solid #1f2937;"></video>
      </div>
    `;
  }

  return `
    <div style="margin:12px 0;">
      <a href="${escapeHtml(url)}" target="_blank" style="color:#93c5fd;">Открыть медиа</a>
    </div>
  `;
}

function renderOrderGallery(order) {
  const urls = Array.isArray(order?.media_urls)
    ? order.media_urls
    : (order?.media_url ? [order.media_url] : []);

  if (!urls.length) return "";

  return `
    <div style="margin:12px 0; display:grid; grid-template-columns:1fr 1fr; gap:8px;">
      ${urls.map((url) => {
        const safe = escapeHtml(String(url));
        const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(String(url));
        return isVideo
          ? `<video src="${safe}" controls style="width:100%; border-radius:12px; border:1px solid #1f2937;"></video>`
          : `<img src="${safe}" style="width:100%; border-radius:12px; border:1px solid #1f2937;">`;
      }).join("")}
    </div>
  `;
}

function statusVisual(status = "") {
  const key = String(status || "").toLowerCase();
  const map = {
    new: { label: "NEW", bg: "rgba(96,165,250,.15)", color: "#93c5fd", border: "rgba(96,165,250,.35)" },
    approved: { label: "APPROVED", bg: "rgba(52,211,153,.15)", color: "#6ee7b7", border: "rgba(52,211,153,.35)" },
    booked: { label: "BOOKED", bg: "rgba(147,197,253,.15)", color: "#bfdbfe", border: "rgba(147,197,253,.35)" },
    car_received: { label: "CAR RECEIVED", bg: "rgba(34,197,94,.15)", color: "#86efac", border: "rgba(34,197,94,.35)" },
    in_progress: { label: "IN PROGRESS", bg: "rgba(250,204,21,.12)", color: "#fde68a", border: "rgba(250,204,21,.4)" },
    paused: { label: "PAUSED", bg: "rgba(251,146,60,.15)", color: "#fdba74", border: "rgba(251,146,60,.35)" },
    ready: { label: "READY", bg: "rgba(45,212,191,.15)", color: "#5eead4", border: "rgba(45,212,191,.35)" },
    delivered: { label: "DELIVERED", bg: "rgba(16,185,129,.15)", color: "#6ee7b7", border: "rgba(16,185,129,.35)" },
    closed: { label: "CLOSED", bg: "rgba(99,102,241,.15)", color: "#c7d2fe", border: "rgba(99,102,241,.35)" },
    cancelled: { label: "CANCELLED", bg: "rgba(239,68,68,.15)", color: "#fca5a5", border: "rgba(239,68,68,.35)" },
  };

  return map[key] || {
    label: String(status || "UNKNOWN").toUpperCase(),
    bg: "rgba(148,163,184,.15)",
    color: "#cbd5e1",
    border: "rgba(148,163,184,.35)",
  };
}

function displayDate(value) {
  if (!value) return "—";
  const raw = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return escapeHtml(String(value));
  const [y, m, d] = raw.split("-");
  return `${d}.${m}.${y}`;
}

function parseDateValue(value) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function parseDateOnly(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function startOfDay(value = new Date()) {
  const dt = new Date(value);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function addDays(date, amount = 0) {
  const dt = new Date(date);
  dt.setDate(dt.getDate() + amount);
  return startOfDay(dt);
}

function isSameDay(a, b) {
  if (!a || !b) return false;
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function startOfWeek(date) {
  const base = startOfDay(date);
  const day = base.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(base, offset);
}

function formatDayLabel(date) {
  return date.toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function formatDateFromDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${d}.${m}.${y}`;
}

function formatCalendarTitle(date, view = "day") {
  const target = startOfDay(date);
  if (view === "week") {
    const from = startOfWeek(target);
    const to = addDays(from, 6);
    return `${formatDateFromDate(from)} — ${formatDateFromDate(to)}`;
  }
  return target.toLocaleDateString("ru-RU", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function orderTypeLabel(order = {}) {
  return order.order_type || order.type || order.service_type || "—";
}

function eventTypeVisual(type = "intake") {
  const map = {
    intake: { label: "Приём", tone: "rgba(59,130,246,.16)", border: "rgba(96,165,250,.45)", color: "#bfdbfe" },
    start: { label: "Старт", tone: "rgba(250,204,21,.14)", border: "rgba(250,204,21,.42)", color: "#fde68a" },
    completion: { label: "Выдача", tone: "rgba(16,185,129,.15)", border: "rgba(16,185,129,.45)", color: "#86efac" },
  };
  return map[type] || map.intake;
}

function buildCalendarEvents(orders = []) {
  const events = [];
  (Array.isArray(orders) ? orders : []).forEach((order) => {
    const variants = [
      { type: "intake", date: order?.intake_date, context: "Приём / заезд" },
      { type: "start", date: order?.start_date, context: "Начало работ" },
      { type: "completion", date: order?.end_date, context: "Завершение / выдача" },
    ];

    variants.forEach((item) => {
      const date = parseDateOnly(item.date);
      if (!date) return;
      events.push({
        id: `${order.id || "order"}-${item.type}-${date.getTime()}`,
        orderId: order.id,
        type: item.type,
        context: item.context,
        date,
        dateText: displayDate(item.date),
        clientName: order.client_name || "—",
        carModel: order.car_model || "—",
        status: order.status || "—",
        statusVisual: statusVisual(order.status || ""),
        orderType: orderTypeLabel(order),
      });
    });
  });

  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function buildCalendarOperationalBuckets(orders = [], options = {}) {
  const today = startOfDay(options.today || new Date());
  const soonHorizonDays = Number.isFinite(Number(options.soonHorizonDays))
    ? Math.max(1, Number(options.soonHorizonDays))
    : 3;
  const soonEnd = addDays(today, soonHorizonDays);
  const orderList = Array.isArray(orders) ? orders : [];

  const buckets = {
    today: { arrivals: [], starts: [], completions: [] },
    soon: { arrivals: [], starts: [], completions: [] },
    overdue: [],
    unplanned: [],
  };
  const seen = {
    today: { arrivals: new Set(), starts: new Set(), completions: new Set() },
    soon: { arrivals: new Set(), starts: new Set(), completions: new Set() },
    overdue: new Set(),
    unplanned: new Set(),
  };

  const pushUnique = (group, set, item) => {
    const key = String(item.orderId || "");
    if (!key || set.has(key)) return;
    set.add(key);
    group.push(item);
  };

  orderList.forEach((order) => {
    const orderId = String(order?.id || "");
    if (!orderId) return;

    const status = String(order?.status || "").toLowerCase();
    const orderItem = {
      orderId,
      label: orderLabel(order),
      clientName: order?.client_name || "—",
      carModel: order?.car_model || "—",
      status,
      statusVisual: statusVisual(status),
      intakeDateRaw: getOrderDate(order, ["intake_date", "received_at"]),
      startDateRaw: getOrderDate(order, ["start_date", "started_at"]),
      endDateRaw: getOrderDate(order, ["end_date", "due_date", "planned_end_date"]),
    };

    const intakeDate = parseDateOnly(orderItem.intakeDateRaw);
    const startDate = parseDateOnly(orderItem.startDateRaw);
    const endDate = parseDateOnly(orderItem.endDateRaw);
    const isComplete = isOrderCompletionStatus(status);
    const isActive = isActiveOrderStatus(status);

    const dateRules = [
      { date: intakeDate, todayList: buckets.today.arrivals, todaySet: seen.today.arrivals, soonList: buckets.soon.arrivals, soonSet: seen.soon.arrivals },
      { date: startDate, todayList: buckets.today.starts, todaySet: seen.today.starts, soonList: buckets.soon.starts, soonSet: seen.soon.starts },
      { date: endDate, todayList: buckets.today.completions, todaySet: seen.today.completions, soonList: buckets.soon.completions, soonSet: seen.soon.completions },
    ];

    dateRules.forEach((rule) => {
      if (!rule.date) return;
      if (isSameDay(rule.date, today)) {
        pushUnique(rule.todayList, rule.todaySet, orderItem);
        return;
      }
      if (rule.date > today && rule.date <= soonEnd) {
        pushUnique(rule.soonList, rule.soonSet, orderItem);
      }
    });

    if (endDate && endDate < today && !isComplete) {
      pushUnique(buckets.overdue, seen.overdue, orderItem);
    }

    const hasPlanningGap = isActive && (!startDate || !endDate);
    if (hasPlanningGap) {
      pushUnique(buckets.unplanned, seen.unplanned, orderItem);
    }
  });

  return { buckets, soonHorizonDays };
}

function renderCalendarEventCard(event) {
  const type = eventTypeVisual(event.type);
  return `
    <button onclick="openOrderFromCalendar('${escapeHtml(String(event.orderId || ""))}')" style="
      width:100%;
      text-align:left;
      border-radius:14px;
      border:1px solid #1f2937;
      background:#0f172a;
      padding:11px;
      color:#fff;
      margin-bottom:8px;
      cursor:pointer;
    ">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
        <div style="font-size:13px; font-weight:700;">${escapeHtml(event.clientName)} · ${escapeHtml(event.carModel)}</div>
        <span style="white-space:nowrap;">${renderToneBadge(type.label, { bg: type.tone, color: type.color, border: type.border })}</span>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:7px;">
        ${renderStatusBadge(event.status)}
        <span class="ui-secondary-text" style="color:#cbd5e1;">Тип: ${escapeHtml(event.orderType)}</span>
      </div>
      <div class="ui-secondary-text" style="margin-top:6px;">${escapeHtml(event.context)} · ${escapeHtml(event.dateText)}</div>
    </button>
  `;
}

function renderCalendarOpsOrderCard(order, hint = "") {
  return `
    <button onclick="openOrderFromCalendar('${escapeHtml(String(order.orderId || ""))}')" style="
      width:100%;
      text-align:left;
      border-radius:13px;
      border:1px solid rgba(148,163,184,.24);
      background:linear-gradient(180deg, rgba(11,19,37,.95), rgba(9,14,28,.95));
      padding:11px;
      color:#fff;
      margin-top:7px;
      cursor:pointer;
    ">
      <div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start;">
        <div style="font-size:13px; font-weight:800; line-height:1.35;">${escapeHtml(order.label)}</div>
        <span style="white-space:nowrap;">${renderStatusBadge(order.status)}</span>
      </div>
      <div class="ui-secondary-text" style="color:#cbd5e1; margin-top:4px;">${escapeHtml(order.clientName)} · ${escapeHtml(order.carModel)}</div>
      ${hint
        ? `<div class="ui-secondary-text" style="font-size:11px; margin-top:4px;">${escapeHtml(hint)}</div>`
        : ""
      }
    </button>
  `;
}

function renderCalendarOpsSection(title, subtitle, groups = [], tone = {}) {
  const border = tone.border || "#1f2937";
  const accent = tone.accent || "#93c5fd";
  const totalCount = groups.reduce((sum, g) => sum + g.items.length, 0);
  return card(`
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
      <div>
        <div style="font-size:15px; font-weight:800; color:${accent};">${escapeHtml(title)}</div>
        <div class="ui-secondary-text" style="margin-top:2px;">${escapeHtml(subtitle)}</div>
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end;">
        <span class="soft-chip">${totalCount}</span>
      </div>
    </div>
    <div style="margin-top:8px;">
      ${groups.map((group) => `
        <div style="margin-top:9px; padding-top:8px; border-top:1px dashed rgba(148,163,184,.18);">
          <div style="display:flex; justify-content:space-between; gap:8px; align-items:center;">
            <div style="font-size:12px; color:#cbd5e1; font-weight:700;">${escapeHtml(group.label)}</div>
            <div class="ui-secondary-text" style="font-size:11px;">${group.items.length}</div>
          </div>
          ${group.items.length
            ? group.items.map((item) => renderCalendarOpsOrderCard(item, group.hint(item))).join("")
            : renderEmptyState({ icon: "🗂️", title: "Нет заказов", description: "В этой категории пока нет запланированных заказов." })
          }
        </div>
      `).join("")}
    </div>
  `, `margin-bottom:10px; background:linear-gradient(180deg,#0b1220,#0a1020); border:1px solid ${border};`);
}

async function openOrderFromCalendar(orderId) {
  if (!orderId) return;
  showTab("orders");
  await openOrder(orderId);
}

function shiftCalendarAnchor(direction = 1) {
  const base = state.calendarAnchor || new Date();
  const amount = state.calendarView === "week" ? 7 * direction : direction;
  state.calendarAnchor = addDays(base, amount);
  loadCalendar();
}

function setCalendarView(view = "day") {
  state.calendarView = view === "week" ? "week" : "day";
  loadCalendar();
}

function moveCalendarToToday() {
  state.calendarAnchor = startOfDay(new Date());
  loadCalendar();
}

async function loadCalendar() {
  const el = document.getElementById("calendar");
  if (!el) return;
  el.innerHTML = `<div style="padding:16px;">Загрузка...</div>`;

  try {
    let orders = state.orders;
    if (!Array.isArray(orders) || !orders.length) {
      const res = await api("get_orders");
      orders = Array.isArray(res.items) ? res.items : [];
      state.orders = orders;
    }

    const events = buildCalendarEvents(orders);
    const { buckets, soonHorizonDays } = buildCalendarOperationalBuckets(orders, { soonHorizonDays: 3 });
    const anchor = startOfDay(state.calendarAnchor || new Date());
    state.calendarAnchor = anchor;

    const dayEvents = events.filter((x) => isSameDay(x.date, anchor));
    const weekStart = startOfWeek(anchor);
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    el.innerHTML = `
      <div style="padding:14px 12px 18px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px;">
          <div style="font-size:17px; font-weight:800;">Календарь задач</div>
          <div style="display:flex; gap:6px;">
            <button onclick="setCalendarView('day')" style="padding:8px 10px; border-radius:10px; border:1px solid ${state.calendarView === "day" ? "rgba(96,165,250,.45)" : "#374151"}; background:${state.calendarView === "day" ? "rgba(59,130,246,.2)" : "#111827"}; color:#fff;">День</button>
            <button onclick="setCalendarView('week')" style="padding:8px 10px; border-radius:10px; border:1px solid ${state.calendarView === "week" ? "rgba(96,165,250,.45)" : "#374151"}; background:${state.calendarView === "week" ? "rgba(59,130,246,.2)" : "#111827"}; color:#fff;">Неделя</button>
          </div>
        </div>
        <div style="display:flex; gap:6px; margin-bottom:12px;">
          <button onclick="shiftCalendarAnchor(-1)" style="flex:1; padding:9px; border-radius:10px; border:1px solid #374151; background:#111827; color:#fff;">←</button>
          <button onclick="moveCalendarToToday()" style="flex:2; padding:9px; border-radius:10px; border:1px solid #374151; background:#111827; color:#fff;">Сегодня</button>
          <button onclick="shiftCalendarAnchor(1)" style="flex:1; padding:9px; border-radius:10px; border:1px solid #374151; background:#111827; color:#fff;">→</button>
        </div>

        ${card(`
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div>
              <div style="font-size:13px; color:#94a3b8; margin-bottom:6px;">Период</div>
              <div style="font-size:16px; font-weight:700;">${escapeHtml(formatCalendarTitle(anchor, state.calendarView))}</div>
            </div>
            <span class="soft-chip">${state.calendarView === "day" ? "Day" : "Week"}</span>
          </div>
        `)}

        ${renderCalendarOpsSection(
          "Сегодня",
          "Критичные события текущего дня",
          [
            {
              label: "Заезды сегодня",
              items: buckets.today.arrivals,
              hint: (item) => `Приём: ${displayDate(item.intakeDateRaw)}`,
            },
            {
              label: "Старты сегодня",
              items: buckets.today.starts,
              hint: (item) => `Старт: ${displayDate(item.startDateRaw)}`,
            },
            {
              label: "Выдачи сегодня",
              items: buckets.today.completions,
              hint: (item) => `Финиш: ${displayDate(item.endDateRaw)}`,
            },
          ],
          { border: "rgba(96,165,250,.4)", accent: "#bfdbfe" }
        )}

        ${renderCalendarOpsSection(
          "Скоро",
          `План на ближайшие ${soonHorizonDays} дня`,
          [
            {
              label: "Ближайшие заезды",
              items: buckets.soon.arrivals,
              hint: (item) => `Приём: ${displayDate(item.intakeDateRaw)}`,
            },
            {
              label: "Ближайшие старты",
              items: buckets.soon.starts,
              hint: (item) => `Старт: ${displayDate(item.startDateRaw)}`,
            },
            {
              label: "Ближайшие выдачи",
              items: buckets.soon.completions,
              hint: (item) => `Финиш: ${displayDate(item.endDateRaw)}`,
            },
          ],
          { border: "rgba(52,211,153,.35)", accent: "#86efac" }
        )}

        ${card(`
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
            <div>
              <div style="font-size:15px; font-weight:800; color:#fca5a5;">Просрочено</div>
              <div style="font-size:12px; color:#94a3b8; margin-top:2px;">Дата завершения прошла, а заказ не закрыт</div>
            </div>
            <span class="soft-chip" style="border-color:rgba(248,113,113,.4); color:#fecaca; background:rgba(69,10,10,.38);">${buckets.overdue.length}</span>
          </div>
          <div style="margin-top:8px;">
            ${buckets.overdue.length
              ? buckets.overdue.map((item) => renderCalendarOpsOrderCard(item, `Финиш: ${displayDate(item.endDateRaw)}`)).join("")
              : `<div style="font-size:12px; color:#6b7280;">Просроченных заказов нет</div>`
            }
          </div>
        `, "margin-bottom:10px; background:linear-gradient(180deg,#180f14,#150b12); border:1px solid rgba(248,113,113,.35);")}

        ${card(`
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
            <div>
              <div style="font-size:15px; font-weight:800; color:#fcd34d;">Незапланировано</div>
              <div style="font-size:12px; color:#94a3b8; margin-top:2px;">Активные заказы без полной даты старта/финиша</div>
            </div>
            <span class="soft-chip" style="border-color:rgba(250,204,21,.4); color:#fde68a; background:rgba(66,32,6,.38);">${buckets.unplanned.length}</span>
          </div>
          <div style="margin-top:8px;">
            ${buckets.unplanned.length
              ? buckets.unplanned.map((item) => {
                  const missing = [
                    !parseDateOnly(item.startDateRaw) ? "нет даты старта" : null,
                    !parseDateOnly(item.endDateRaw) ? "нет даты финиша" : null,
                  ].filter(Boolean).join(", ");
                  return renderCalendarOpsOrderCard(item, missing || "Неполный график");
                }).join("")
              : `<div style="font-size:12px; color:#6b7280;">Пробелов планирования не найдено</div>`
            }
          </div>
        `, "margin-bottom:10px; background:linear-gradient(180deg,#19130a,#120f08); border:1px solid rgba(250,204,21,.35);")}

        ${state.calendarView === "day"
          ? card(`
              <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <div style="font-size:14px; font-weight:700;">События на день</div>
                <div class="ui-secondary-text">${dayEvents.length}</div>
              </div>
              ${dayEvents.length
                ? dayEvents.map(renderCalendarEventCard).join("")
                : renderEmptyState({ icon: "🗓️", title: "Нет событий на дату", description: "Выберите другой день или переключитесь на недельный вид." })
              }
            `)
          : weekDays.map((day) => {
              const items = events.filter((x) => isSameDay(x.date, day));
              return card(`
                <div style="display:flex; justify-content:space-between; margin-bottom:9px;">
                  <div style="font-size:14px; font-weight:700;">${escapeHtml(formatDayLabel(day))}</div>
                  <div class="ui-secondary-text">${items.length}</div>
                </div>
                ${items.length
                  ? items.map(renderCalendarEventCard).join("")
                  : renderEmptyState({ icon: "🕒", title: "Событий нет", description: "На этот день ничего не запланировано." })
                }
              `);
            }).join("")
        }
      </div>
    `;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div style="padding:16px;">Ошибка загрузки календаря</div>`;
  }
}

function daysBetween(from, to = new Date()) {
  if (!from || !to) return null;
  const diff = to.getTime() - from.getTime();
  if (!Number.isFinite(diff)) return null;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function isActiveOrderStatus(status = "") {
  const key = String(status || "").trim().toLowerCase();
  const closedStatuses = new Set(["closed", "cancelled", "delivered"]);
  return !closedStatuses.has(key);
}

function isOrderCompletionStatus(status = "") {
  const key = String(status || "").trim().toLowerCase();
  const completionStatuses = new Set(["delivered", "closed", "done", "completed", "finished"]);
  return completionStatuses.has(key);
}

function getOrderDate(order = {}, keys = []) {
  for (const key of keys) {
    if (order[key]) return order[key];
  }
  return null;
}

function collectMediaUrls(order = {}) {
  const fromList = Array.isArray(order.media_urls) ? order.media_urls : [];
  const merged = [...fromList];
  if (order.media_url) merged.push(order.media_url);
  return Array.from(new Set(
    merged.map((x) => String(x || "").trim()).filter(Boolean)
  ));
}

function parsePayments(order = {}) {
  const candidates = [
    order.payments,
    order.payment_list,
    order.payment_history,
    order.transactions,
  ];
  const list = candidates.find(Array.isArray) || [];
  return list
    .map((row) => (row && typeof row === "object" ? row : null))
    .filter(Boolean);
}

function normalizeInventoryItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    normalized_category: normalizeInventoryCategory(item.category),
    normalized_group: inventoryCategoryGroup(item.category),
  }));
}

function getInventoryAvailableQuantity(item = {}) {
  const explicitAvailable = Number(item.available_quantity);
  if (Number.isFinite(explicitAvailable)) return explicitAvailable;

  const quantity = asNumber(item.quantity, 0);
  const reserved = asNumber(item.reserved_quantity, 0);
  return quantity - reserved;
}

function getInventoryStockState(item = {}) {
  const available = getInventoryAvailableQuantity(item);
  const minQuantity = asNumber(item.min_quantity, 0);

  if (available <= 0) {
    return {
      key: "out",
      label: "Нет в наличии",
      tone: "rgba(239,68,68,.25)",
      border: "#dc2626",
      color: "#fca5a5",
    };
  }

  if (minQuantity > 0 && available <= minQuantity * 0.5) {
    return {
      key: "critical",
      label: "Критично",
      tone: "rgba(239,68,68,.2)",
      border: "#b91c1c",
      color: "#fca5a5",
    };
  }

  if (minQuantity > 0 && available <= minQuantity) {
    return {
      key: "low",
      label: "Низкий",
      tone: "rgba(245,158,11,.22)",
      border: "#d97706",
      color: "#fcd34d",
    };
  }

  return {
    key: "normal",
    label: "Норма",
    tone: "rgba(16,185,129,.2)",
    border: "#047857",
    color: "#6ee7b7",
  };
}

function inventoryMovementDateValue(movement = {}) {
  return movement.date
    || movement.created_at
    || movement.movement_date
    || movement.timestamp
    || movement.updated_at
    || null;
}

function normalizeMovementTypeLabel(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "Движение";
  const key = raw.toLowerCase();
  const map = {
    reserve: "Резерв",
    reserved: "Резерв",
    unreserve: "Снять резерв",
    release: "Снятие резерва",
    in: "Приход",
    intake: "Приход",
    receipt: "Приход",
    out: "Расход",
    расход: "Расход",
    writeoff: "Списание",
    correction: "Коррекция",
    adjustment: "Корректировка",
    usage: "Использовано в заказе",
    consume: "Использовано в заказе",
  };
  if (map[key]) return map[key];
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function normalizeInventoryMovement(raw = {}) {
  if (!raw || typeof raw !== "object") return null;
  const quantity = asNumber(raw.quantity ?? raw.qty ?? raw.amount ?? raw.delta ?? 0, 0);
  return {
    id: raw.id || raw.movement_id || null,
    inventory_item_id: raw.inventory_item_id || raw.item_id || raw.inventory_id || null,
    movement_type: normalizeMovementTypeLabel(raw.movement_type || raw.type || raw.action || ""),
    quantity,
    unit: raw.unit || raw.uom || "",
    comment: raw.comment || raw.note || raw.reason || "",
    related_order_id: raw.related_order_id || raw.order_id || raw.order?.id || null,
    related_order_number: raw.related_order_number || raw.order_number || raw.order?.order_number || null,
    date: inventoryMovementDateValue(raw),
  };
}

function inventoryMovementOrderLabel(movement = {}) {
  if (movement.related_order_number) return movement.related_order_number;
  if (movement.related_order_id) return `#${String(movement.related_order_id).slice(0, 8)}`;
  return null;
}

async function ensureInventoryMovementsForItem(itemId, { force = false } = {}) {
  const key = String(itemId || "");
  if (!key) return [];
  if (!force && Array.isArray(state.inventoryMovementsByItem[key])) {
    return state.inventoryMovementsByItem[key];
  }

  const attempts = [
    { action: "get_inventory_movements", payload: { inventory_item_id: itemId, limit: 12 } },
    { action: "get_inventory_movements", payload: { item_id: itemId, limit: 12 } },
    { action: "get_inventory_item_movements", payload: { inventory_item_id: itemId, limit: 12 } },
    { action: "get_inventory_item_movements", payload: { item_id: itemId, limit: 12 } },
    { action: "get_inventory_movement_history", payload: { inventory_item_id: itemId, limit: 12 } },
    { action: "get_inventory_movement_history", payload: { item_id: itemId, limit: 12 } },
  ];

  for (const attempt of attempts) {
    try {
      const res = await api(attempt.action, attempt.payload);
      const rows = Array.isArray(res?.items)
        ? res.items
        : (Array.isArray(res?.movements) ? res.movements : []);
      const normalized = rows
        .map(normalizeInventoryMovement)
        .filter(Boolean)
        .filter((row) => !row.inventory_item_id || String(row.inventory_item_id) === key)
        .sort((a, b) => {
          const ta = parseDateValue(inventoryMovementDateValue(a))?.getTime() || 0;
          const tb = parseDateValue(inventoryMovementDateValue(b))?.getTime() || 0;
          return tb - ta;
        });

      state.inventoryMovementsByItem[key] = normalized.slice(0, 12);
      return state.inventoryMovementsByItem[key];
    } catch (e) {
      console.warn(`Inventory movement action failed: ${attempt.action}`, e?.message || e);
    }
  }

  state.inventoryMovementsByItem[key] = [];
  return [];
}

function renderInventoryMovementHistoryBlock(itemId, { compact = false } = {}) {
  const key = String(itemId || "");
  const list = Array.isArray(state.inventoryMovementsByItem[key]) ? state.inventoryMovementsByItem[key] : [];
  const rows = compact ? list.slice(0, 3) : list.slice(0, 6);

  if (!rows.length) {
    return `
      <div style="padding:10px; border-radius:10px; border:1px dashed rgba(148,163,184,.35); color:#94a3b8; font-size:12px;">
        История движений пока недоступна.
      </div>
    `;
  }

  return rows.map((movement) => `
    <div style="padding:9px; border-radius:10px; border:1px solid rgba(148,163,184,.2); margin-bottom:8px; background:rgba(15,23,42,.4);">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <div style="font-size:13px; font-weight:700;">${escapeHtml(movement.movement_type || "Movement")}</div>
        <div style="font-size:13px; font-weight:700;">${formatMoney(movement.quantity || 0)} ${escapeHtml(movement.unit || "")}</div>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px; font-size:11px; color:#94a3b8;">
        <span>${escapeHtml(displayDate(movement.date))}</span>
        ${inventoryMovementOrderLabel(movement) ? `<span>Заказ: ${escapeHtml(inventoryMovementOrderLabel(movement))}</span>` : ""}
      </div>
      ${movement.comment ? `<div style="margin-top:4px; font-size:12px; color:#cbd5e1;">${escapeHtml(movement.comment)}</div>` : ""}
    </div>
  `).join("");
}

function isInventoryLowStock(item = {}) {
  const stock = getInventoryStockState(item);
  return stock.key === "low" || stock.key === "critical" || stock.key === "out";
}

async function ensureInventoryLoaded() {
  if ((state.inventory || []).length) return state.inventory;
  const res = await api("get_inventory");
  const items = normalizeInventoryItems(res?.items || []);
  state.inventory = items;
  return items;
}

function normalizeOrderMaterial(raw = {}, orderCurrency = "USD") {
  const quantity = asNumber(
    raw.quantity ?? raw.qty ?? raw.amount ?? raw.used_quantity ?? 0,
    0
  );
  const purchasePrice = asNumber(
    raw.purchase_price ?? raw.unit_cost ?? raw.price ?? raw.cost_per_unit,
    NaN
  );
  const fallbackTotal = Number.isFinite(purchasePrice) ? quantity * purchasePrice : 0;
  const totalCost = asNumber(
    raw.total_cost ?? raw.line_total ?? raw.total ?? raw.cost,
    fallbackTotal
  );
  return {
    material_id: raw.id || raw.material_id || raw.order_material_id || raw.link_id || null,
    item_name: raw.item_name || raw.name || raw.material_name || raw.inventory_name || "Материал",
    quantity,
    unit: raw.unit || raw.uom || "",
    purchase_price: Number.isFinite(purchasePrice) ? purchasePrice : null,
    total_cost: totalCost,
    currency: raw.currency || orderCurrency || "USD",
    inventory_item_id: raw.inventory_item_id || raw.item_id || raw.inventory_id || null,
  };
}

function parseMoneyInput(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : NaN;
}

function paymentMethodLabel(payment = {}) {
  const raw = payment.method || payment.type || payment.payment_method || "";
  return String(raw || "").trim() || "—";
}

function paymentNoteLabel(payment = {}) {
  const raw = payment.note || payment.comment || payment.description || "";
  return String(raw || "").trim();
}

function paymentDateLabel(payment = {}, fallbackValue = null) {
  const raw = payment.date || payment.paid_at || payment.created_at || payment.payment_date || fallbackValue;
  return displayDate(raw);
}

function expenseDateLabel(expense = {}) {
  return displayDate(expense.date || expense.expense_date || expense.created_at || expense.updated_at || null);
}

function financeItemMeta(order = {}) {
  const client = order.client_name || order.client?.full_name || order.customer_name || "Клиент не указан";
  const car = order.car_model || order.vehicle || "Авто не указано";
  return { client, car };
}

function financeOrderStatusLabel(order = {}) {
  return renderStatusBadge(order.status || "");
}

async function openOrder(id) {
  try {
    const res = await api("get_order", { id });
    const order = res?.item && typeof res.item === "object" ? res.item : {};
    const cur = currencySymbol(order.currency || "USD");
    const materials = (Array.isArray(order.materials) ? order.materials : [])
      .map((row) => normalizeOrderMaterial(row, order.currency || "USD"));
    const materialsSubtotal = materials.reduce((sum, row) => sum + asNumber(row.total_cost, 0), 0);
    const parsedServices = parseServicesFromNote(order?.note || "");
    const services = parsedServices.services || [];
    const cleanNote = parsedServices.cleanNote || "";
    const payments = parsePayments(order);
    const mediaUrls = collectMediaUrls(order);

    const sectionCard = (title, body) => `
      <div style="
        border:1px solid rgba(148,163,184,.22);
        border-radius:16px;
        padding:12px;
        margin-bottom:10px;
        background:linear-gradient(180deg, rgba(15,23,42,.82) 0%, rgba(2,6,23,.9) 100%);
      ">
        <div style="font-size:12px; font-weight:700; letter-spacing:.08em; color:#94a3b8; margin-bottom:10px;">${title}</div>
        ${body}
      </div>
    `;

    openModal(`
      <div style="
        border:1px solid rgba(59,130,246,.28);
        border-radius:18px;
        padding:14px;
        margin-bottom:10px;
        background:radial-gradient(circle at top right, rgba(37,99,235,.24) 0%, rgba(15,23,42,.94) 42%, rgba(2,6,23,.95) 100%);
      ">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
          <div>
            <div style="font-size:12px; letter-spacing:.08em; color:#94a3b8;">ORDER</div>
            <div style="font-size:22px; font-weight:800; margin-top:3px;">${orderLabel(order)}</div>
          </div>
          <span style="white-space:nowrap;">${renderStatusBadge(order.status || "")}</span>
        </div>

        <div style="margin-top:10px; display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <div style="padding:8px; border-radius:12px; background:rgba(15,23,42,.65); border:1px solid rgba(148,163,184,.18);">
            <div style="font-size:11px; color:#94a3b8; margin-bottom:4px;">Клиент</div>
            <div style="font-size:14px; font-weight:700;">${escapeHtml(order.client_name || "—")}</div>
          </div>
          <div style="padding:8px; border-radius:12px; background:rgba(15,23,42,.65); border:1px solid rgba(148,163,184,.18);">
            <div style="font-size:11px; color:#94a3b8; margin-bottom:4px;">Автомобиль</div>
            <div style="font-size:14px; font-weight:700;">${escapeHtml(order.car_model || "—")}</div>
          </div>
          <div style="padding:8px; border-radius:12px; background:rgba(15,23,42,.65); border:1px solid rgba(148,163,184,.18);">
            <div style="font-size:11px; color:#94a3b8; margin-bottom:4px;">Тип</div>
            <div style="font-size:14px; font-weight:700;">${escapeHtml(order.type || "—")}</div>
          </div>
          <div style="padding:8px; border-radius:12px; background:rgba(15,23,42,.65); border:1px solid rgba(148,163,184,.18);">
            <div style="font-size:11px; color:#94a3b8; margin-bottom:4px;">Валюта</div>
            <div style="font-size:14px; font-weight:700;">${escapeHtml(order.currency || "USD")}</div>
          </div>
        </div>

        <div style="margin-top:10px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
          <div style="padding:8px; border-radius:12px; border:1px solid rgba(148,163,184,.18);">
            <div style="font-size:11px; color:#94a3b8;">Приём</div>
            <div style="font-weight:700; font-size:13px;">${displayDate(order.intake_date)}</div>
          </div>
          <div style="padding:8px; border-radius:12px; border:1px solid rgba(148,163,184,.18);">
            <div style="font-size:11px; color:#94a3b8;">Старт</div>
            <div style="font-weight:700; font-size:13px;">${displayDate(order.start_date)}</div>
          </div>
          <div style="padding:8px; border-radius:12px; border:1px solid rgba(148,163,184,.18);">
            <div style="font-size:11px; color:#94a3b8;">Финиш</div>
            <div style="font-weight:700; font-size:13px;">${displayDate(order.end_date)}</div>
          </div>
        </div>
      </div>

      ${sectionCard("ФИНАНСЫ", `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <div style="padding:9px; border-radius:12px; border:1px solid rgba(148,163,184,.18);"><div style="font-size:11px; color:#94a3b8;">Итого</div><div style="font-size:17px; font-weight:800;">${formatMoney(order.total || 0)} ${cur}</div></div>
          <div style="padding:9px; border-radius:12px; border:1px solid rgba(148,163,184,.18);"><div style="font-size:11px; color:#94a3b8;">Предоплата</div><div style="font-size:17px; font-weight:800;">${formatMoney(order.prepaid || 0)} ${cur}</div></div>
          <div style="padding:9px; border-radius:12px; border:1px solid rgba(148,163,184,.18);"><div style="font-size:11px; color:#94a3b8;">Оплачено</div><div style="font-size:17px; font-weight:800;">${formatMoney(order.paid || 0)} ${cur}</div></div>
          <div style="padding:9px; border-radius:12px; border:1px solid rgba(239,68,68,.35); background:rgba(239,68,68,.08);"><div style="font-size:11px; color:#fca5a5;">К оплате</div><div style="font-size:17px; font-weight:800; color:#fecaca;">${formatMoney(order.due || 0)} ${cur}</div></div>
          <div style="padding:9px; border-radius:12px; border:1px solid rgba(148,163,184,.18);"><div style="font-size:11px; color:#94a3b8;">Себестоимость</div><div style="font-size:17px; font-weight:800;">${formatMoney(order.total_cost || 0)} ${cur}</div></div>
          <div style="padding:9px; border-radius:12px; border:1px solid ${asNumber(order.profit, 0) >= 0 ? "rgba(34,197,94,.35)" : "rgba(239,68,68,.35)"}; background:${asNumber(order.profit, 0) >= 0 ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)"};"><div style="font-size:11px; color:${asNumber(order.profit, 0) >= 0 ? "#86efac" : "#fca5a5"};">Прибыль</div><div style="font-size:17px; font-weight:800; color:${asNumber(order.profit, 0) >= 0 ? "#bbf7d0" : "#fecaca"};">${formatMoney(order.profit || 0)} ${cur}</div></div>
        </div>
      `)}

      ${sectionCard("УСЛУГИ", services.length
        ? services.map((service) => `
          <div style="padding:9px 10px; border-radius:10px; border:1px solid rgba(148,163,184,.2); margin-bottom:7px; font-size:14px;">
            ${escapeHtml(service)}
          </div>
        `).join("")
        : `<div style="padding:10px; border-radius:10px; border:1px dashed rgba(148,163,184,.35); color:#94a3b8; font-size:13px;">Услуги пока не добавлены</div>`
      )}

      ${sectionCard("МАТЕРИАЛЫ", `
        <div style="padding:10px; border-radius:12px; border:1px solid rgba(148,163,184,.22); background:rgba(2,6,23,.55); margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
            <div>
              <div style="font-size:11px; color:#94a3b8;">Подытог материалов</div>
              <div style="font-size:18px; font-weight:800;">${formatMoney(materialsSubtotal)} ${cur}</div>
            </div>
            ${btn("+ Материал", `openAddMaterialToOrder('${id}')`, "background:#1d4ed8; border-color:#3b82f6; white-space:nowrap;")}
          </div>
          <div style="font-size:11px; color:#64748b;">Этот блок влияет на себестоимость заказа.</div>
        </div>

        ${materials.length
          ? materials.map((m) => {
            const linkedItem = (state.inventory || []).find((item) => String(item.id) === String(m.inventory_item_id));
            const linkedAvailable = linkedItem ? getInventoryAvailableQuantity(linkedItem) : null;
            return `
            <div style="padding:10px; border-radius:12px; border:1px solid rgba(148,163,184,.2); margin-bottom:8px; background:rgba(15,23,42,.38);">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:6px;">
                <div style="font-weight:700; font-size:14px;">${escapeHtml(m.item_name || "Материал")}</div>
                <div style="font-size:13px; font-weight:700;">${formatMoney(m.total_cost || 0)} ${currencySymbol(m.currency || order.currency || "USD")}</div>
              </div>
              <div style="display:flex; flex-wrap:wrap; gap:8px; font-size:12px; color:#94a3b8;">
                <span>Кол-во: ${formatMoney(m.quantity || 0)} ${escapeHtml(m.unit || "ед.")}</span>
                ${m.purchase_price == null
                  ? `<span>Цена закупки: —</span>`
                  : `<span>Цена закупки: ${formatMoney(m.purchase_price)} ${currencySymbol(m.currency || order.currency || "USD")}</span>`}
              </div>
              ${m.inventory_item_id
                ? `<div style="margin-top:6px; font-size:12px; color:#cbd5e1;">
                    Склад: ${linkedItem ? escapeHtml(linkedItem.name || "Позиция склада") : "ID " + escapeHtml(String(m.inventory_item_id))}
                    ${linkedItem && linkedAvailable != null
                      ? ` · Доступно: ${formatMoney(linkedAvailable)} ${escapeHtml(linkedItem.unit || "pcs")} · Резерв: ${formatMoney(linkedItem.reserved_quantity || 0)}`
                      : ""}
                    <div style="margin-top:4px; color:#93c5fd;">Этот материал зарезервирован под заказ.</div>
                  </div>`
                : `<div style="margin-top:6px; font-size:12px; color:#94a3b8;">Склад: позиция не привязана</div>`}
              ${m.material_id && m.inventory_item_id
                ? `<div style="display:flex; gap:6px; margin-top:8px;">
                    ${btn("Изм. кол-во", `changeOrderMaterialQuantity('${id}', '${m.material_id}', '${m.inventory_item_id}', ${asNumber(m.quantity, 0)})`, "padding:7px 10px; font-size:12px;")}
                    ${btn("Убрать", `removeOrderMaterial('${id}', '${m.material_id}', '${m.inventory_item_id}', ${asNumber(m.quantity, 0)})`, "padding:7px 10px; font-size:12px; background:rgba(239,68,68,.14); border-color:rgba(239,68,68,.35); color:#fecaca;")}
                  </div>`
                : ""}
            </div>
          `;
          }).join("")
          : `<div style="padding:12px; border-radius:12px; border:1px dashed rgba(148,163,184,.35); color:#94a3b8; font-size:13px;">Материалы пока не добавлены. Нажмите «+ Материал», чтобы привязать позицию со склада.</div>`
        }
      `)}

      ${sectionCard("ПЛАТЕЖИ", `
        <div style="padding:10px; border-radius:12px; border:1px solid rgba(59,130,246,.25); background:rgba(30,64,175,.12); margin-bottom:10px;">
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
            <div style="padding:9px; border-radius:10px; border:1px solid rgba(148,163,184,.18); background:rgba(15,23,42,.45);">
              <div style="font-size:11px; color:#94a3b8;">Предоплата</div>
              <div style="font-size:16px; font-weight:800;">${formatMoney(order.prepaid || 0)} ${cur}</div>
            </div>
            <div style="padding:9px; border-radius:10px; border:1px solid rgba(148,163,184,.18); background:rgba(15,23,42,.45);">
              <div style="font-size:11px; color:#94a3b8;">Оплачено</div>
              <div style="font-size:16px; font-weight:800;">${formatMoney(order.paid || 0)} ${cur}</div>
            </div>
            <div style="padding:9px; border-radius:10px; border:1px solid rgba(239,68,68,.35); background:rgba(239,68,68,.08);">
              <div style="font-size:11px; color:#fca5a5;">К оплате</div>
              <div style="font-size:16px; font-weight:800; color:#fecaca;">${formatMoney(order.due || 0)} ${cur}</div>
            </div>
          </div>
        </div>

        <div style="padding:10px; border-radius:12px; border:1px solid rgba(148,163,184,.22); background:rgba(2,6,23,.55); margin-bottom:10px;">
          <div style="font-size:12px; color:#cbd5e1; margin-bottom:8px; font-weight:700;">Добавить оплату</div>
          <div style="display:flex; gap:8px; align-items:center;">
            <input
              id="payment_amount_${escapeHtml(String(id))}"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Сумма"
              style="flex:1; min-width:0; background:#0b1220; border:1px solid rgba(148,163,184,.3); border-radius:10px; padding:10px; color:#fff;"
            />
            ${btn("+ Оплата", `addPayment('${id}', 'payment_amount_${id}')`, "background:#1d4ed8; border-color:#3b82f6; white-space:nowrap;")}
          </div>
        </div>

        <div>
          <div style="font-size:12px; color:#94a3b8; margin-bottom:8px; font-weight:700; letter-spacing:.04em;">PAYMENT HISTORY</div>
          ${payments.length
            ? payments.map((p) => {
              const note = paymentNoteLabel(p);
              return `
                <div style="padding:10px; border-radius:10px; border:1px solid rgba(148,163,184,.2); margin-bottom:7px; background:rgba(15,23,42,.35);">
                  <div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start; margin-bottom:4px;">
                    <div style="font-size:14px; font-weight:700;">${formatMoney(p.amount || 0)} ${currencySymbol(p.currency || order.currency || "USD")}</div>
                    <div style="font-size:12px; color:#94a3b8; text-align:right;">${escapeHtml(displayDate(p.created_at || p.date || p.paid_at || ""))}</div>
                  </div>
                  <div style="font-size:12px; color:#94a3b8;">Method: ${escapeHtml(paymentMethodLabel(p))}</div>
                  ${note ? `<div style="font-size:12px; color:#cbd5e1; margin-top:4px;">Note: ${escapeHtml(note)}</div>` : ""}
                </div>
              `;
            }).join("")
            : `<div style="padding:10px; border-radius:10px; border:1px dashed rgba(148,163,184,.35); color:#94a3b8; font-size:13px;">Платежей пока нет. Добавьте первую оплату выше.</div>`
          }
        </div>
      `)}

      ${sectionCard("MEDIA", mediaUrls.length
        ? `<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            ${mediaUrls.map((url) => {
              const safe = escapeHtml(url);
              const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(url);
              if (isVideo) {
                return `<video src="${safe}" controls style="width:100%; border-radius:12px; border:1px solid rgba(148,163,184,.2);"></video>`;
              }
              return `<img src="${safe}" style="width:100%; border-radius:12px; border:1px solid rgba(148,163,184,.2);">`;
            }).join("")}
          </div>`
        : `<div style="padding:10px; border-radius:10px; border:1px dashed rgba(148,163,184,.35); color:#94a3b8; font-size:13px;">Медиафайлы отсутствуют</div>`
      )}

      ${sectionCard("COMMENT / NOTES", cleanNote
        ? `<div style="font-size:14px; line-height:1.45; white-space:pre-wrap;">${escapeHtml(cleanNote)}</div>`
        : `<div style="color:#94a3b8; font-size:13px;">Комментарий не добавлен</div>`
      )}

      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
        ${btn("Редактировать", `closeModal(); startEditOrder('${id}')`)}
        ${btn("Удалить", `handleDeleteOrder('${id}')`, "background:rgba(239,68,68,.15); color:#fecaca; border-color:rgba(239,68,68,.35);")}
      </div>
    `);
  } catch (e) {
    console.error(e);
  }
}

async function openCreateOrder(order = null) {
  const isEdit = !!order;
  await ensureOrdersLoadedForSuggestions();
  const serviceSuggestions = collectServiceSuggestions();
  const parsedNote = parseServicesFromNote(order?.note || "");

  openModal(`
    <h3 style="margin-top:0;">${isEdit ? "Редактировать заказ" : "Новый заказ"}</h3>
    ${isEdit ? "" : `<div style="font-size:12px; opacity:.7; margin-top:-4px; margin-bottom:10px;">Быстрый приём заказа — детали добавишь после создания.</div>`}

    <div style="margin-bottom:12px; padding:12px; border-radius:12px; border:1px solid #1f2937; background:#020617;">
      <div style="opacity:.6; font-size:12px; margin-bottom:6px;">Клиент</div>

      <select id="client_id" style="width:100%; margin-bottom:8px;">
        <option value="">Выберите клиента</option>
      </select>

      <input id="client_name" placeholder="Имя клиента" style="width:100%; margin-bottom:8px;">
      <input id="car_model" placeholder="Модель авто" style="width:100%;">
    </div>

    <div style="margin-bottom:12px; padding:12px; border-radius:12px; border:1px solid #1f2937; background:#020617;">
      <div style="opacity:.6; font-size:12px; margin-bottom:6px;">Тип и статус</div>
      <select id="order_type" style="width:100%; margin-bottom:8px;">
        <option value="combined">combined</option>
        <option value="vinyl_wrap">vinyl_wrap</option>
        <option value="ppf_wrap">ppf_wrap</option>
        <option value="roof_wrap">roof_wrap</option>
        <option value="dechrome">dechrome</option>
        <option value="window_tint">window_tint</option>
        <option value="detailing">detailing</option>
        <option value="elements">elements</option>
      </select>

      <select id="order_status" style="width:100%;">
        <option value="new">new</option>
        <option value="approved">approved</option>
        <option value="booked">booked</option>
        <option value="car_received">car_received</option>
        <option value="in_progress">in_progress</option>
        <option value="paused">paused</option>
        <option value="ready">ready</option>
        <option value="delivered">delivered</option>
        <option value="closed">closed</option>
        <option value="cancelled">cancelled</option>
      </select>
    </div>

    <div style="margin-bottom:12px; padding:12px; border-radius:12px; border:1px solid #1f2937; background:#020617;">
      <div style="opacity:.6; font-size:12px; margin-bottom:6px;">Даты</div>
      <input id="intake_date" type="date" style="width:100%; margin-bottom:6px;">
      <input id="start_date" type="date" style="width:100%; margin-bottom:6px;">
      <input id="end_date" type="date" style="width:100%;">
    </div>

    <div style="
      background:#020617;
      padding:12px;
      border-radius:12px;
      margin-bottom:12px;
      border:1px solid #1f2937;
    ">
      <div style="font-weight:600; margin-bottom:10px;">🧰 Услуги</div>

      <div style="display:flex; gap:8px; margin-bottom:8px;">
        <input id="service_input" list="service_suggestions" placeholder="Например: Полная оклейка" style="width:100%;">
        <button id="service_add_btn" style="padding:10px 12px; border-radius:10px; border:1px solid #374151; background:#1f2937; color:#fff;">Добавить</button>
      </div>
      <datalist id="service_suggestions">
        ${serviceSuggestions.map((item) => `<option value="${escapeHtml(item)}"></option>`).join("")}
      </datalist>

      <div id="services_list"></div>
    </div>

    ${isEdit ? `
      <div style="
        background:#020617;
        padding:12px;
        border-radius:12px;
        margin-bottom:14px;
        border:1px solid #1f2937;
      ">
        <div style="font-weight:600; margin-bottom:10px;">💰 Доход</div>

        <label style="font-size:12px; opacity:.6;">Subtotal</label>
        <input id="subtotal" type="number" value="0" style="width:100%; margin-bottom:8px;">

        <label style="font-size:12px; opacity:.6;">Скидка</label>
        <input id="discount" type="number" value="0" style="width:100%; margin-bottom:8px;">
      </div>

      <div style="
        background:#020617;
        padding:12px;
        border-radius:12px;
        margin-bottom:14px;
        border:1px solid #1f2937;
      ">
        <div style="font-weight:600; margin-bottom:10px;">🧾 Себестоимость</div>

        <label style="font-size:12px; opacity:.6;">Материалы</label>
        <input id="material_cost" type="number" value="0" style="width:100%; margin-bottom:8px;">

        <label style="font-size:12px; opacity:.6;">Работа</label>
        <input id="labor_cost" type="number" value="0" style="width:100%; margin-bottom:8px;">

        <label style="font-size:12px; opacity:.6;">Прочее</label>
        <input id="other_cost" type="number" value="0" style="width:100%; margin-bottom:8px;">
      </div>

      <div style="
        background:#020617;
        padding:12px;
        border-radius:12px;
        margin-bottom:14px;
        border:1px solid #1f2937;
      ">
        <div style="font-weight:600; margin-bottom:10px;">📊 Результат</div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <div style="background:#0f172a; border:1px solid #1f2937; border-radius:10px; padding:10px;">
            <div style="font-size:12px; opacity:.6; margin-bottom:4px;">Себестоимость</div>
            <input id="total_cost" readonly style="
              width:100%;
              background:transparent;
              border:none;
              color:#cbd5e1;
              font-weight:700;
              padding:0;
            ">
          </div>

          <div style="background:#0f172a; border:1px solid #1f2937; border-radius:10px; padding:10px;">
            <div style="font-size:12px; opacity:.6; margin-bottom:4px;">Прибыль</div>
            <input id="profit" readonly style="
              width:100%;
              background:transparent;
              border:none;
              color:#f8fafc;
              font-weight:700;
              padding:0;
            ">
          </div>
        </div>
      </div>
    ` : ""}

    <div style="
      background:#020617;
      padding:12px;
      border-radius:12px;
      margin-bottom:12px;
      border:1px solid #1f2937;
    ">
      <label style="font-size:12px; opacity:.6;">Итоговая сумма</label>
      <input id="total" type="number" value="0" style="width:100%;">
    </div>

    <div style="
      background:#020617;
      padding:12px;
      border-radius:12px;
      margin-bottom:14px;
      border:1px solid #1f2937;
    ">
      <div style="font-weight:600; margin-bottom:10px;">💳 Оплата</div>

      <div style="display:flex; gap:8px; margin-bottom:10px;">
        ${btn("0%", "setPaidPreset(0)", "flex:1;")}
        ${btn("50%", "setPaidPreset(50)", "flex:1;")}
        ${btn("100%", "setPaidPreset(100)", "flex:1;")}
      </div>

      <label style="font-size:12px; opacity:.6;">Предоплата</label>
      <input id="prepaid" type="number" value="0" style="width:100%; margin-bottom:8px;">

      ${isEdit ? `
        <label style="font-size:12px; opacity:.6;">Оплачено</label>
        <input id="paid" type="number" value="0" style="width:100%; margin-bottom:8px;">
      ` : `
        <div style="font-size:12px; opacity:.6; margin-bottom:8px;">Оплачено при создании = предоплата</div>
      `}

      <label style="font-size:12px; opacity:.6;">К доплате</label>
      <input id="due" readonly style="
        width:100%;
        font-weight:bold;
        text-align:center;
        background:#020617;
        border:1px solid #1f2937;
        color:#f8fafc;
      ">
    </div>

    <div style="margin-bottom:12px;">
      <label style="font-size:12px; opacity:.6;">Валюта</label>
      <select id="currency" style="width:100%;">
        <option value="UAH">UAH ₴</option>
        <option value="USD">USD $</option>
      </select>
    </div>

    ${isEdit ? `
      <div style="margin-bottom:12px;">
        <label style="font-size:12px; opacity:.6;">Фото / видео</label>
        <input id="order_media" type="file" accept="image/*,video/*" multiple style="width:100%;">
        <div id="order_media_preview" style="margin-top:8px;"></div>
      </div>
    ` : ""}

    <textarea id="order_note" placeholder="Комментарий" style="width:100%; min-height:80px; margin-bottom:12px;"></textarea>

    ${btn(isEdit ? "Сохранить изменения" : "Создать заказ", "createOrder()", "width:100%; background:#2563eb;")}
  `);

  renderClientOptions(order?.client_id || "");

  const clientSelect = document.getElementById("client_id");
  if (clientSelect) {
    clientSelect.addEventListener("change", syncSelectedClientToOrderForm);
  }

  bindOrderFormRecalc();
  if (isEdit) {
    bindOrderMediaPreview(Array.isArray(order?.media_urls) ? order.media_urls : (order?.media_url ? [order.media_url] : []));
  }
  
  if (order) {
    document.getElementById("client_name").value = order.client_name || "";
    document.getElementById("car_model").value = order.car_model || "";
    document.getElementById("order_type").value = order.type || "combined";
    document.getElementById("order_status").value = order.status || "new";
    document.getElementById("intake_date").value = order.intake_date || "";
    document.getElementById("start_date").value = order.start_date || "";
    document.getElementById("end_date").value = order.end_date || "";
    document.getElementById("total").value = String(order.total ?? 0);
    if (isEdit) {
      document.getElementById("subtotal").value = String(order.subtotal ?? 0);
      document.getElementById("discount").value = String(order.discount ?? 0);
      document.getElementById("material_cost").value = String(order.material_cost ?? 0);
      document.getElementById("labor_cost").value = String(order.labor_cost ?? 0);
      document.getElementById("other_cost").value = String(order.other_cost ?? 0);
    }
    document.getElementById("prepaid").value = String(order.prepaid ?? 0);
    if (isEdit) {
      document.getElementById("paid").value = String(order.paid ?? 0);
    }
    document.getElementById("currency").value = order.currency || "USD";
    document.getElementById("order_note").value = parsedNote.cleanNote || "";

    if (isEdit && order.media_url) {
      const root = document.getElementById("order_media_preview");
      if (root) {
        const url = String(order.media_url);
        if (/\.(jpg|jpeg|png|webp|gif)$/i.test(url)) {
          root.innerHTML = `<img src="${escapeHtml(url)}" style="width:100%; border-radius:12px; border:1px solid #1f2937;">`;
        } else if (/\.(mp4|webm|mov|m4v)$/i.test(url)) {
          root.innerHTML = `<video src="${escapeHtml(url)}" controls style="width:100%; border-radius:12px; border:1px solid #1f2937;"></video>`;
        } else {
          root.innerHTML = `<a href="${escapeHtml(url)}" target="_blank" style="color:#93c5fd;">Открыть текущее медиа</a>`;
        }
      }
    }
  }

  bindServicesEditor(parsedNote.services);
  recalcOrderForm();
}

function startEditOrder(orderId) {
  const order = (state.orders || []).find(o => String(o.id) === String(orderId));
  if (!order) {
    safeAlert("Заказ не найден");
    return;
  }

  state.editingOrderId = order.id;
  (async () => {
    try {
      const res = await api("get_order", { id: order.id });
      const fullOrder = res?.item ? { ...order, ...res.item } : order;
      openCreateOrder(fullOrder);
    } catch (e) {
      console.warn("Could not load full order for edit, fallback to list item:", e?.message || e);
      openCreateOrder(order);
    }
  })();
}

function setPaidPreset(percent) {
  const totalEl = document.getElementById("total");
  const paidEl = document.getElementById("paid");
  const prepaidEl = document.getElementById("prepaid");

  const total = asNumber(totalEl?.value, 0);
  const value = Math.round((total * percent) / 100 * 100) / 100;

  if (paidEl) paidEl.value = String(value);
  if (prepaidEl) prepaidEl.value = String(value);

  recalcOrderForm();
}

function bindOrderFormRecalc() {
  [
    "subtotal",
    "discount",
    "total",
    "material_cost",
    "labor_cost",
    "other_cost",
    "paid",
    "prepaid",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", recalcOrderForm);
    el.addEventListener("change", recalcOrderForm);
  });
}

function bindOrderMediaPreview(existingUrls = []) {
  const input = document.getElementById("order_media");
  const root = document.getElementById("order_media_preview");
  if (!root) return;

  function renderUrls(urls = []) {
    if (!urls.length) {
      root.innerHTML = "";
      return;
    }

    root.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
        ${urls.map((url) => {
          const safe = escapeHtml(url);
          const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(url);
          return isVideo
            ? `<video src="${safe}" controls style="width:100%; border-radius:12px; border:1px solid #1f2937;"></video>`
            : `<img src="${safe}" style="width:100%; border-radius:12px; border:1px solid #1f2937;">`;
        }).join("")}
      </div>
    `;
  }

  if (existingUrls.length) {
    renderUrls(existingUrls);
  } else {
    root.innerHTML = "";
  }

  if (!input) return;

  input.addEventListener("change", () => {
    const files = Array.from(input.files || []);
    if (!files.length) {
      renderUrls(existingUrls);
      return;
    }

    const urls = files.map((file) => URL.createObjectURL(file));

    root.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
        ${files.map((file, index) => {
          const url = urls[index];
          if (file.type.startsWith("image/")) {
            return `<img src="${url}" style="width:100%; border-radius:12px; border:1px solid #1f2937;">`;
          }
          if (file.type.startsWith("video/")) {
            return `<video src="${url}" controls style="width:100%; border-radius:12px; border:1px solid #1f2937;"></video>`;
          }
          return `<div style="opacity:.7; padding:10px; border:1px solid #1f2937; border-radius:12px;">${escapeHtml(file.name)}</div>`;
        }).join("")}
      </div>
    `;
  });
}
function recalcOrderForm() {
  const subtotalEl = document.getElementById("subtotal");
  const discountEl = document.getElementById("discount");
  const totalEl = document.getElementById("total");
  const materialCostEl = document.getElementById("material_cost");
  const laborCostEl = document.getElementById("labor_cost");
  const otherCostEl = document.getElementById("other_cost");
  const paidEl = document.getElementById("paid");
  const prepaidEl = document.getElementById("prepaid");

  const subtotal = asNumber(subtotalEl?.value, 0);
  const discount = asNumber(discountEl?.value, 0);
  let total = asNumber(totalEl?.value, 0);

  const materialCost = asNumber(materialCostEl?.value, 0);
  const laborCost = asNumber(laborCostEl?.value, 0);
  const otherCost = asNumber(otherCostEl?.value, 0);

  const paid = paidEl ? asNumber(paidEl.value, 0) : asNumber(prepaidEl?.value, 0);
  const prepaid = asNumber(prepaidEl?.value, 0);

  if (!total && subtotal > 0) {
    total = Math.max(subtotal - discount, 0);
    if (totalEl) totalEl.value = String(total);
  }

  const totalCost = materialCost + laborCost + otherCost;
  const profit = total - totalCost;
  const due = Math.max(total - paid, 0);

  const totalCostField = document.getElementById("total_cost");
  const profitField = document.getElementById("profit");
  const dueField = document.getElementById("due");

  if (totalCostField) totalCostField.value = String(totalCost);
  if (dueField) dueField.value = String(due);

  if (profitField) {
    profitField.value = String(profit);
    if (profit > 0) {
      profitField.style.color = "#22c55e";
    } else if (profit < 0) {
      profitField.style.color = "#ef4444";
    } else {
      profitField.style.color = "#f8fafc";
    }
  }

  if (paidEl && prepaid > paid) {
    paidEl.value = String(prepaid);
    if (dueField) dueField.value = String(Math.max(total - prepaid, 0));
  }

  if (!paidEl && dueField) {
    dueField.value = String(Math.max(total - prepaid, 0));
  }
}

async function handleDeleteOrder(orderId) {
  const ok = confirm("Удалить этот заказ?");
  if (!ok) return;

  try {
    await api("delete_order", { id: orderId });
    state.orders = state.orders.filter(o => String(o.id) !== String(orderId));
    loadOrders();
    loadDashboard();
    loadFinance();
    safeAlert("Заказ удалён");
  } catch (err) {
    console.error(err);
    safeAlert("Ошибка удаления заказа");
  }
}

async function uploadOrderMediaIfNeeded() {
  const input = document.getElementById("order_media");
  const files = Array.from(input?.files || []);
  if (!files.length) return [];

  const uploadedUrls = [];

  for (const file of files) {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const result = String(reader.result || "");
        const base64Data = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64Data);
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const res = await api("upload_order_media", {
      filename: file.name,
      content_type: file.type || "application/octet-stream",
      file_base64: base64,
    });

    const url =
      res?.public_url ||
      res?.url ||
      res?.item?.public_url ||
      res?.item?.url ||
      res?.data?.public_url ||
      res?.data?.url ||
      null;
    if (url) uploadedUrls.push(url);
  }

  return uploadedUrls;
}

async function createOrder() {
  const isEdit = !!state.editingOrderId;
  const client_id = document.getElementById("client_id")?.value || null;
  const client_name = document.getElementById("client_name")?.value.trim() || null;
  const car_model = document.getElementById("car_model")?.value.trim() || null;

  const type = document.getElementById("order_type")?.value || "combined";
  const status = document.getElementById("order_status")?.value || "new";

  const intake_date = document.getElementById("intake_date")?.value || null;
  const start_date = document.getElementById("start_date")?.value || null;
  const end_date = document.getElementById("end_date")?.value || null;

  const total = asNumber(document.getElementById("total")?.value, 0);
  const subtotal = isEdit
    ? asNumber(document.getElementById("subtotal")?.value, 0)
    : total;
  const discount = isEdit
    ? asNumber(document.getElementById("discount")?.value, 0)
    : 0;

  const material_cost = isEdit
    ? asNumber(document.getElementById("material_cost")?.value, 0)
    : 0;
  const labor_cost = isEdit
    ? asNumber(document.getElementById("labor_cost")?.value, 0)
    : 0;
  const other_cost = isEdit
    ? asNumber(document.getElementById("other_cost")?.value, 0)
    : 0;

  const total_cost = isEdit
    ? asNumber(document.getElementById("total_cost")?.value, 0)
    : material_cost + labor_cost + other_cost;
  const profit = isEdit
    ? asNumber(document.getElementById("profit")?.value, 0)
    : total - total_cost;

  const prepaid = asNumber(document.getElementById("prepaid")?.value, 0);
  const paid = isEdit
    ? asNumber(document.getElementById("paid")?.value, 0)
    : prepaid;
  const due = Math.max(total - paid, 0);

  const currency = document.getElementById("currency")?.value || "USD";
  const baseNote = document.getElementById("order_note")?.value.trim() || null;
  const services = (state.orderServices || []).map(normalizeServiceName).filter(Boolean);
  const note = composeNoteWithServices(baseNote, services);

  if (!client_name) {
    safeAlert("Укажи имя клиента");
    return;
  }

  if (!car_model) {
    safeAlert("Укажи модель авто");
    return;
  }

  if (!total || total <= 0) {
    safeAlert("Укажи итоговую сумму");
    return;
  }

  try {
    let media_url = null;
    let media_urls = [];

    const existingOrder = state.editingOrderId
      ? (state.orders || []).find(o => String(o.id) === String(state.editingOrderId))
      : null;

    if (isEdit) {
      try {
        media_urls = await uploadOrderMediaIfNeeded();
      } catch (e) {
        console.warn("Media upload skipped:", e?.message || e);
      }
    }

    if (!media_urls.length && Array.isArray(existingOrder?.media_urls)) {
      media_urls = existingOrder.media_urls;
    }

    if (!media_url && existingOrder?.media_url) {
      media_url = existingOrder.media_url;
    }

    const payload = {
      client_id,
      client_name,
      car_model,
      type,
      status,
      intake_date,
      start_date,
      end_date,
      subtotal,
      discount,
      total,
      material_cost,
      labor_cost,
      other_cost,
      total_cost,
      profit,
      prepaid,
      paid,
      due,
      currency,
      note,
      media_urls,
      media_url: media_urls[0] || media_url || null,
    };

    if (state.editingOrderId) {
      const previousStatus = String(existingOrder?.status || "").trim().toLowerCase();
      const nextStatus = String(status || "").trim().toLowerCase();
      const shouldConsumeOnCompletion =
        !isOrderCompletionStatus(previousStatus) && isOrderCompletionStatus(nextStatus);

      await api("update_order", {
        id: state.editingOrderId,
        ...payload,
      });

      if (shouldConsumeOnCompletion) {
        try {
          const refreshedOrderRes = await api("get_order", { id: state.editingOrderId });
          const refreshedOrder = refreshedOrderRes?.item && typeof refreshedOrderRes.item === "object"
            ? refreshedOrderRes.item
            : null;
          const materialRows = Array.isArray(refreshedOrder?.materials) ? refreshedOrder.materials : [];

          const result = await consumeReservedMaterialsForOrder(
            state.editingOrderId,
            refreshedOrder?.order_number || existingOrder?.order_number || "",
            materialRows,
          );

          if (result.consumed > 0) {
            safeAlert(`Заказ обновлён. Списаны материалы: ${result.consumed}`);
          } else {
            safeAlert("Заказ обновлён. Резервов для списания не найдено.");
          }
        } catch (consumeError) {
          console.error("Order completed, but stock consumption failed:", consumeError);
          safeAlert(`Заказ обновлён, но списание материалов не завершено: ${consumeError?.message || "ошибка"}`);
        }
      } else {
        safeAlert("Заказ обновлён");
      }
    } else {
      await api("create_order", payload);
      safeAlert("Заказ создан");
    }

    state.editingOrderId = null;
    closeModal();
    await loadClientsToState();
    loadOrders();
    loadDashboard();
    loadFinance();
  } catch (e) {
    console.error(e);
    safeAlert(e.message || "Ошибка сохранения заказа");
  }
}
async function addPayment(order_id, amountInputId = "") {
  const inlineInput = amountInputId ? document.getElementById(amountInputId) : null;
  const raw = inlineInput ? inlineInput.value : prompt("Сумма");
  if (raw == null) return;
  const amount = parseMoneyInput(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    safeAlert("Укажи корректную сумму оплаты");
    if (inlineInput) inlineInput.focus();
    return;
  }

  try {
    const res = await api("get_order", { id: order_id });
    const order = res?.item && typeof res.item === "object" ? res.item : {};

    await api("add_payment", {
      order_id,
      amount,
      currency: order.currency || "USD",
    });

    if (inlineInput) inlineInput.value = "";
    safeAlert("Оплата добавлена");
    await openOrder(order_id);
    await loadOrders();
    await loadDashboard();
    await loadFinance();
  } catch (e) {
    console.error(e);
    safeAlert(e?.message || "Не удалось добавить оплату");
  }
}

function renderAddMaterialPricePreview(item) {
  const preview = document.getElementById("add_material_price_preview");
  if (!preview) return;
  if (!item) {
    preview.textContent = "—";
    return;
  }

  const value = asNumber(item.purchase_price ?? item.retail_price ?? 0, 0);
  preview.textContent = `${formatMoney(value)} ${currencySymbol(item.currency || "USD")}`;
}

function syncAddMaterialFields() {
  const select = document.getElementById("add_material_item");
  const unitInput = document.getElementById("add_material_unit");
  if (!select || !unitInput) return;

  const selected = (state.inventory || []).find((item) => String(item.id) === String(select.value));
  unitInput.value = selected?.unit || "pcs";
  renderAddMaterialPricePreview(selected || null);
}

async function openAddMaterialToOrder(order_id) {
  try {
    const inventory = await ensureInventoryLoaded();
    const sorted = [...inventory].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "uk"));

    openModal(`
      <h3 style="margin-top:0;">Добавить материал</h3>
      <div style="font-size:12px; color:#94a3b8; margin-bottom:10px;">Выберите позицию склада и укажите расход для этого заказа.</div>

      <label style="font-size:12px; opacity:.7;">Позиция</label>
      <select id="add_material_item" onchange="syncAddMaterialFields()" style="width:100%; margin-bottom:10px;">
        <option value="">Выберите материал</option>
        ${sorted.map((item) => `
          <option value="${escapeHtml(String(item.id))}">
            ${escapeHtml(item.name || "Без названия")} · Доступно: ${formatMoney(getInventoryAvailableQuantity(item))} ${escapeHtml(item.unit || "pcs")} (резерв: ${formatMoney(item.reserved_quantity || 0)})
          </option>
        `).join("")}
      </select>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
        <div>
          <label style="font-size:12px; opacity:.7;">Количество</label>
          <input id="add_material_qty" type="number" step="0.01" min="0.01" value="1" style="width:100%;">
        </div>
        <div>
          <label style="font-size:12px; opacity:.7;">Ед. изм.</label>
          <input id="add_material_unit" type="text" value="pcs" style="width:100%;">
        </div>
      </div>

      <div style="padding:10px; border-radius:10px; border:1px solid rgba(148,163,184,.2); margin-bottom:12px; background:rgba(15,23,42,.45);">
        <div style="font-size:11px; color:#94a3b8; margin-bottom:4px;">Ориентир цены закупки</div>
        <div id="add_material_price_preview" style="font-size:16px; font-weight:800;">—</div>
      </div>

      <div style="display:flex; gap:8px;">
        ${btn("Назад к заказу", `openOrder('${order_id}')`, "flex:1;")}
        ${btn("Добавить", `addMaterialToOrder('${order_id}')`, "flex:1; background:#1d4ed8; border-color:#3b82f6;")}
      </div>
    `);
  } catch (e) {
    console.error(e);
    safeAlert(e?.message || "Не удалось загрузить склад");
  }
}

async function addMaterialToOrder(order_id) {
  const itemId = document.getElementById("add_material_item")?.value || "";
  const quantity = asNumber(document.getElementById("add_material_qty")?.value, 0);
  const unit = document.getElementById("add_material_unit")?.value.trim() || "";

  if (!itemId) {
    safeAlert("Выберите материал");
    return;
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    safeAlert("Укажите корректное количество");
    return;
  }

  const item = (state.inventory || []).find((row) => String(row.id) === String(itemId));
  if (!item) {
    safeAlert("Позиция склада не найдена");
    return;
  }
  const availableNow = getInventoryAvailableQuantity(item);
  if (quantity > availableNow) {
    safeAlert(`Недостаточно доступного остатка. Доступно: ${formatMoney(availableNow)} ${item.unit || "pcs"}`);
    return;
  }

  const purchasePrice = asNumber(item.purchase_price ?? item.retail_price, 0);
  const payload = {
    order_id,
    material_id: item.id,
    inventory_id: item.id,
    inventory_item_id: item.id,
    item_id: item.id,
    qty: quantity,
    quantity,
    unit: unit || item.unit || "pcs",
    material_name: item.name || null,
    purchase_price: purchasePrice,
    unit_cost: purchasePrice,
    total_cost: quantity * purchasePrice,
    currency: item.currency || "USD",
  };

  const attempts = ["add_order_material", "create_order_material"];
  let lastError = null;

  for (const action of attempts) {
    try {
      await api(action, payload);
      await applyInventoryReserveDelta(item.id, quantity, {
        order_id,
        reason: "add_material",
      });
      safeAlert("Материал добавлен");
      await openOrder(order_id);
      await loadOrders();
      await loadDashboard();
      await loadFinance();
      return;
    } catch (e) {
      lastError = e;
      const message = String(e?.message || "").toLowerCase();
      const isUnknownAction = message.includes("unknown action");
      console.warn(`Material action failed: ${action}`, e?.message || e);
      if (!isUnknownAction) break;
    }
  }

  safeAlert(lastError?.message || "Не удалось добавить материал к заказу");
}

function findInventoryById(itemId) {
  return (state.inventory || []).find((row) => String(row.id) === String(itemId));
}

async function consumeReservedMaterialsForOrder(orderId, orderNumber = "", materials = []) {
  const normalizedMaterials = (Array.isArray(materials) ? materials : [])
    .map((row) => normalizeOrderMaterial(row))
    .filter((row) => row.inventory_item_id && asNumber(row.quantity, 0) > 0);

  if (!normalizedMaterials.length) {
    return { consumed: 0, skipped: 0 };
  }

  await loadInventory();

  let consumedCount = 0;
  let skippedCount = 0;

  for (const material of normalizedMaterials) {
    const item = findInventoryById(material.inventory_item_id);
    if (!item) {
      skippedCount += 1;
      continue;
    }

    const quantity = asNumber(item.quantity, 0);
    const reserved = asNumber(item.reserved_quantity, 0);
    const materialQty = asNumber(material.quantity, 0);
    const consumableQty = Math.min(materialQty, reserved, quantity);

    if (!(consumableQty > 0)) {
      skippedCount += 1;
      continue;
    }

    const nextQuantity = quantity - consumableQty;
    const nextReserved = reserved - consumableQty;
    if (nextQuantity < -0.0001 || nextReserved < -0.0001) {
      throw new Error(`Списание отклонено: отрицательный остаток для "${item.name || "материала"}"`);
    }

    await api("update_inventory_item", {
      id: item.id,
      category: item.category || item.normalized_category || "other",
      brand: item.brand || "",
      name: item.name || "",
      width_cm: item.width_cm ?? null,
      unit: item.unit || "pcs",
      quantity: Math.max(nextQuantity, 0),
      purchase_price: asNumber(item.purchase_price, 0),
      retail_price: asNumber(item.retail_price, 0),
      currency: item.currency || "USD",
      min_quantity: asNumber(item.min_quantity, 0),
      color: item.color || null,
      reserved_quantity: Math.max(nextReserved, 0),
      note: item.note || null,
    });

    consumedCount += 1;

    try {
      await api("create_inventory_movement", {
        inventory_item_id: item.id,
        movement_type: "consume",
        quantity: consumableQty,
        unit: item.unit || material.unit || "pcs",
        related_order_id: orderId,
        comment: orderNumber
          ? `Consumption on order completion (${orderNumber})`
          : "Consumption on order completion",
      });
    } catch (e) {
      console.warn("Inventory movement for consumption was not created", e?.message || e);
    }
  }

  await loadInventory();
  return { consumed: consumedCount, skipped: skippedCount };
}

async function applyInventoryReserveDelta(itemId, delta, context = {}) {
  const normalizedDelta = asNumber(delta, 0);
  if (!itemId || !normalizedDelta) return;

  await loadInventory();
  const item = findInventoryById(itemId);
  if (!item) throw new Error("Позиция склада не найдена для резерва");

  const quantity = asNumber(item.quantity, 0);
  const reserved = asNumber(item.reserved_quantity, 0);
  const nextReserved = reserved + normalizedDelta;

  if (nextReserved < 0) {
    throw new Error("Операция резерва отклонена: резерв не может быть отрицательным");
  }

  const available = getInventoryAvailableQuantity(item);
  if (normalizedDelta > 0 && normalizedDelta > available) {
    throw new Error(`Недостаточно доступного остатка. Доступно: ${formatMoney(available)} ${item.unit || "pcs"}`);
  }

  await api("update_inventory_item", {
    id: item.id,
    category: item.category || item.normalized_category || "other",
    brand: item.brand || "",
    name: item.name || "",
    width_cm: item.width_cm ?? null,
    unit: item.unit || "pcs",
    quantity,
    purchase_price: asNumber(item.purchase_price, 0),
    retail_price: asNumber(item.retail_price, 0),
    currency: item.currency || "USD",
    min_quantity: asNumber(item.min_quantity, 0),
    color: item.color || null,
    reserved_quantity: nextReserved,
    note: item.note || null,
  });

  await loadInventory();
  const refreshed = findInventoryById(itemId);
  if (refreshed) {
    const refreshedReserved = asNumber(refreshed.reserved_quantity, 0);
    if (Math.abs(refreshedReserved - nextReserved) > 0.0001) {
      throw new Error("Резерв не подтверждён на сервере. Попробуйте обновить данные.");
    }
  }

  if (context?.order_id && item?.id) {
    try {
      await api("create_inventory_movement", {
        inventory_item_id: item.id,
        movement_type: normalizedDelta > 0 ? "reserve" : "release",
        quantity: Math.abs(normalizedDelta),
        unit: item.unit || "pcs",
        related_order_id: context.order_id,
        comment: normalizedDelta > 0 ? "Reserve from order material" : "Release reserve from order material",
      });
    } catch (e) {
      console.warn("Inventory movement for reserve was not created", e?.message || e);
    }
  }
}

async function changeOrderMaterialQuantity(order_id, material_id, inventory_item_id, currentQuantity) {
  const raw = prompt("Новое количество материала", String(asNumber(currentQuantity, 0)));
  if (raw == null) return;

  const nextQuantity = parseMoneyInput(raw);
  if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
    safeAlert("Укажите корректное количество больше 0");
    return;
  }

  const currentQty = asNumber(currentQuantity, 0);
  const delta = nextQuantity - currentQty;
  if (Math.abs(delta) < 0.0001) return;

  const orderRes = await api("get_order", { id: order_id });
  const order = orderRes?.item || {};
  const material = (Array.isArray(order.materials) ? order.materials : [])
    .map((row) => normalizeOrderMaterial(row, order.currency || "USD"))
    .find((row) => String(row.material_id) === String(material_id));

  if (!material) {
    safeAlert("Материал в заказе не найден. Обновите карточку заказа.");
    return;
  }

  const purchasePrice = asNumber(material.purchase_price, 0);
  const payload = {
    id: material_id,
    order_id,
    quantity: nextQuantity,
    unit: material.unit || "pcs",
    purchase_price: purchasePrice,
    total_cost: nextQuantity * purchasePrice,
    inventory_item_id,
  };

  const actions = ["update_order_material", "edit_order_material", "patch_order_material"];
  let updateError = null;
  for (const action of actions) {
    try {
      await api(action, payload);
      await applyInventoryReserveDelta(inventory_item_id, delta, { order_id, reason: "update_material" });
      safeAlert("Количество материала обновлено");
      await openOrder(order_id);
      await loadOrders();
      await loadDashboard();
      await loadFinance();
      return;
    } catch (e) {
      updateError = e;
      console.warn(`Order material update failed: ${action}`, e?.message || e);
    }
  }

  safeAlert(updateError?.message || "Не удалось обновить материал заказа");
}

async function removeOrderMaterial(order_id, material_id, inventory_item_id, quantity) {
  const ok = await safeConfirm("Удалить материал из заказа и снять резерв?");
  if (!ok) return;

  const releaseQty = asNumber(quantity, 0);
  const actions = ["delete_order_material", "remove_order_material", "detach_order_material"];
  let lastError = null;
  for (const action of actions) {
    try {
      await api(action, { id: material_id, material_id, order_id });
      await applyInventoryReserveDelta(inventory_item_id, -releaseQty, { order_id, reason: "remove_material" });
      safeAlert("Материал удалён, резерв снят");
      await openOrder(order_id);
      await loadOrders();
      await loadDashboard();
      await loadFinance();
      return;
    } catch (e) {
      lastError = e;
      console.warn(`Order material delete failed: ${action}`, e?.message || e);
    }
  }

  safeAlert(lastError?.message || "Не удалось удалить материал из заказа");
}






function updateInventoryFilters() {
  state.inventoryFilters = {
    search: document.getElementById("inv_search")?.value || "",
    category: document.getElementById("inv_filter_category")?.value || "all",
    brand: document.getElementById("inv_filter_brand")?.value || "all",
    lowOnly: Boolean(document.getElementById("inv_filter_low_only")?.checked),
  };
  renderInventoryTab();
}

function renderInventoryCard(item, type = "product") {
  const available = getInventoryAvailableQuantity(item);
  const stock = getInventoryStockState(item);
  const isLow = isInventoryLowStock(item);
  const currency = currencySymbol(item.currency || "USD");
  const usagePercent = asNumber(item.quantity, 0) > 0
    ? Math.max(0, Math.min(100, (available / asNumber(item.quantity, 0)) * 100))
    : 0;

  return card(`
    <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
      <div>
        <div style="font-weight:800; font-size:15px; line-height:1.35;">${escapeHtml(item.name || "Без названия")}</div>
        <div style="font-size:12px; opacity:.7; margin-top:3px;">
          ${escapeHtml(item.brand || "Без бренда")} • ${escapeHtml(getInventoryCategoryLabel(item.normalized_category || item.category || "other"))}
        </div>
      </div>
      ${renderToneBadge(stock.label, { bg: stock.tone, color: stock.color, border: stock.border })}
    </div>

    ${(type === "film" && item.color) || (type === "film" && item.width_cm)
      ? `<div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px; font-size:12px; opacity:.8;">
           ${item.color ? `<span>Цвет: ${escapeHtml(item.color)}</span>` : ""}
           ${item.width_cm ? `<span>Ширина: ${formatMoney(item.width_cm)} см</span>` : ""}
         </div>`
      : ""}

    <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px; margin-top:10px;">
      <div style="background:#0b1220; border:1px solid #1e293b; border-radius:10px; padding:8px;">
        <div style="font-size:11px; opacity:.65;">Количество</div>
        <div style="font-size:14px; font-weight:700;">${formatMoney(item.quantity)} ${escapeHtml(item.unit || "pcs")}</div>
      </div>
      <div style="background:#0b1220; border:1px solid #1e293b; border-radius:10px; padding:8px;">
        <div style="font-size:11px; opacity:.65;">Резерв</div>
        <div style="font-size:14px; font-weight:700;">${formatMoney(item.reserved_quantity || 0)} ${escapeHtml(item.unit || "pcs")}</div>
      </div>
      <div style="background:${isLow ? "rgba(127,29,29,.25)" : "#0b1220"}; border:1px solid ${isLow ? "#7f1d1d" : "#1e293b"}; border-radius:10px; padding:8px;">
        <div style="font-size:11px; opacity:.72;">Доступно</div>
        <div style="font-size:15px; font-weight:800; color:${isLow ? "#fca5a5" : "#fff"};">${formatMoney(available)} ${escapeHtml(item.unit || "pcs")}</div>
      </div>
      <div style="background:#0b1220; border:1px solid #1e293b; border-radius:10px; padding:8px;">
        <div style="font-size:11px; opacity:.65;">Мин. остаток</div>
        <div style="font-size:14px; font-weight:700;">${formatMoney(item.min_quantity || 0)} ${escapeHtml(item.unit || "pcs")}</div>
      </div>
    </div>
    <div style="margin-top:8px; font-size:11px; color:#94a3b8;">
      Доступно = Количество - Резерв
    </div>
    <div style="margin-top:6px; height:6px; border-radius:999px; background:#0b1220; border:1px solid #1e293b; overflow:hidden;">
      <div style="height:100%; width:${usagePercent}%; background:${isLow ? "#f87171" : "#34d399"};"></div>
    </div>

    <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:10px; font-size:12px; opacity:.9;">
      <span>Закупка: ${formatMoney(item.purchase_price || 0)} ${currency}</span>
      <span>Розница: ${formatMoney(item.retail_price || 0)} ${currency}</span>
    </div>
    ${item.note ? `<div style="font-size:12px; opacity:0.75; margin-top:6px;">Заметка: ${escapeHtml(item.note)}</div>` : ""}
    <div style="margin-top:10px;">
      <div style="font-size:11px; color:#94a3b8; margin-bottom:6px;">Последние движения</div>
      ${renderInventoryMovementHistoryBlock(item.id, { compact: true })}
    </div>
    <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
      ${btn("Редактировать", `openEditInventoryItem('${item.id}', '${type}')`)}
      ${btn("Удалить", `deleteInventoryItem('${item.id}')`, "", "danger")}
    </div>
  `, isLow ? "box-shadow:0 0 0 1px rgba(239,68,68,.35) inset;" : "");
}

function renderInventoryGroup(items = [], type = "product", title = "Товар") {
  if (!items.length) {
    const emoji = type === "film" ? "🎞️" : "📦";
    const helper = type === "film"
      ? "Добавьте рулон, чтобы планировать материалы и резервы под заказы."
      : "Добавьте позицию, чтобы видеть остатки, движение и low stock заранее.";
    return card(
      renderEmptyState({ icon: emoji, title: `${title} пока пуст`, description: helper }),
      "border-style:dashed; border-color:rgba(148,163,184,.35); background:linear-gradient(180deg, rgba(15,23,42,.72), rgba(12,18,33,.82));"
    );
  }
  return items.map((item) => `<div>${renderInventoryCard(item, type)}</div>`).join("");
}

function renderInventoryTab() {
  const el = document.getElementById("inventory");
  if (!el) return;
  const allItems = Array.isArray(state.inventory) ? state.inventory : [];
  const filters = state.inventoryFilters || {};
  const search = String(filters.search || "").trim().toLowerCase();
  const selectedCategory = String(filters.category || "all");
  const selectedBrand = String(filters.brand || "all");
  const lowOnly = Boolean(filters.lowOnly);

  const categories = Array.from(new Set(allItems.map((item) => item.normalized_category || item.category || "other"))).sort((a, b) => a.localeCompare(b, "uk"));
  const brands = Array.from(new Set(allItems.map((item) => String(item.brand || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "uk"));

  const filteredItems = allItems.filter((item) => {
    if (search && !String(item.name || "").toLowerCase().includes(search)) return false;
    const itemCategory = item.normalized_category || item.category || "other";
    if (selectedCategory !== "all" && itemCategory !== selectedCategory) return false;
    const itemBrand = String(item.brand || "").trim() || "—";
    if (selectedBrand !== "all" && itemBrand !== selectedBrand) return false;
    if (lowOnly && !isInventoryLowStock(item)) return false;
    return true;
  });

  const filmItems = filteredItems.filter((i) => i.normalized_group === "film");
  const productItems = filteredItems.filter((i) => i.normalized_group === "product");
  const lowStockCount = filteredItems.filter(isInventoryLowStock).length;

  el.innerHTML = `
    <div style="padding:16px;">
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
        ${btn("+ Плёнка", "openCreateInventoryItem('film')")}
        ${btn("+ Товар", "openCreateInventoryItem('product')")}
      </div>

      <div style="background:linear-gradient(180deg, rgba(15,23,42,.95), rgba(11,17,32,.95)); border:1px solid rgba(167,139,250,.22); border-radius:16px; padding:11px; margin-bottom:12px; box-shadow:inset 0 1px 0 rgba(255,255,255,.02);">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
          <div style="font-size:13px; font-weight:800;">Фильтры склада</div>
          <span class="soft-chip">${filteredItems.length} поз.</span>
        </div>
        <input
          id="inv_search"
          placeholder="Поиск по названию"
          value="${escapeHtml(filters.search || "")}"
          oninput="updateInventoryFilters()"
          style="width:100%; margin-bottom:8px; background:#0b1120; color:#fff; border:1px solid rgba(167,139,250,.23); border-radius:11px; padding:10px;"
        >
        <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px;">
          <select id="inv_filter_category" onchange="updateInventoryFilters()" style="width:100%; background:#0b1120; color:#fff; border:1px solid rgba(167,139,250,.23); border-radius:11px; padding:10px;">
            <option value="all" ${selectedCategory === "all" ? "selected" : ""}>Все категории</option>
            ${categories.map((category) => `<option value="${escapeHtml(category)}" ${selectedCategory === category ? "selected" : ""}>${escapeHtml(getInventoryCategoryLabel(category))}</option>`).join("")}
          </select>
          <select id="inv_filter_brand" onchange="updateInventoryFilters()" style="width:100%; background:#0b1120; color:#fff; border:1px solid rgba(167,139,250,.23); border-radius:11px; padding:10px;">
            <option value="all" ${selectedBrand === "all" ? "selected" : ""}>Все бренды</option>
            ${brands.map((brand) => `<option value="${escapeHtml(brand)}" ${selectedBrand === brand ? "selected" : ""}>${escapeHtml(brand)}</option>`).join("")}
          </select>
        </div>
        <label style="display:flex; align-items:center; gap:9px; margin-top:10px; font-size:13px; cursor:pointer; padding:8px 10px; border-radius:11px; border:1px solid ${lowOnly ? "rgba(248,113,113,.4)" : "rgba(148,163,184,.26)"}; background:${lowOnly ? "rgba(69,10,10,.35)" : "rgba(15,23,42,.55)"};">
          <input id="inv_filter_low_only" type="checkbox" ${lowOnly ? "checked" : ""} onchange="updateInventoryFilters()" style="width:16px; height:16px; accent-color:#f87171; margin:0;">
          <span style="font-weight:700; color:${lowOnly ? "#fecaca" : "#dbeafe"};">Только low/critical/out of stock</span>
        </label>
        <div style="margin-top:8px; font-size:12px; opacity:.75;">
          Найдено: ${filteredItems.length} • Низкий остаток: ${lowStockCount}
        </div>
      </div>

      <h3 style="margin:0 0 8px 0;">Плёнка</h3>
      ${renderInventoryGroup(filmItems, "film", "Плёнка")}

      <h3 style="margin:14px 0 8px 0;">Товар</h3>
      ${renderInventoryGroup(productItems, "product", "Товар")}
    </div>
  `;

  const toPrefetch = [...filmItems, ...productItems].slice(0, 8);
  toPrefetch.forEach((item) => {
    ensureInventoryMovementsForItem(item.id);
  });
}

async function loadInventory() {
  const el = document.getElementById("inventory");
  if (!el) return;
  el.innerHTML = `<div style="padding:16px;">Загрузка...</div>`;

  try {
    const res = await api("get_inventory");
    state.inventory = normalizeInventoryItems(res?.items || []);
    renderInventoryTab();
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div style="padding:16px;">Ошибка загрузки склада</div>`;
  }
}


function openCreateInventoryItem(type = "product") {
  openInventoryItemForm({
    mode: "create",
    type,
  });
}

async function openEditInventoryItem(id, type = "product") {
  const item = (state.inventory || []).find((x) => String(x.id) === String(id));
  if (!item) {
    safeAlert("Позиция не найдена");
    return;
  }
  await ensureInventoryMovementsForItem(item.id);
  openInventoryItemForm({
    mode: "edit",
    type,
    item,
  });
}

function openInventoryItemForm({ mode = "create", type = "product", item = null } = {}) {
  const isFilm = type === "film";
  const allowedCategories = isFilm ? FILM_CATEGORIES : PRODUCT_CATEGORIES;
  const normalizedCategory = normalizeInventoryCategory(item?.category);
  const selectedCategory = allowedCategories.includes(normalizedCategory)
    ? normalizedCategory
    : defaultCategoryByType(type);
  const title = mode === "edit"
    ? (isFilm ? "Редактировать плёнку" : "Редактировать товар")
    : (isFilm ? "Новая плёнка" : "Новый товар");
  const actionLabel = mode === "edit" ? "Сохранить" : "Создать";

  openModal(`
    <h3 style="margin-top:0;">${title}</h3>
    <select id="inv_category" style="width:100%; margin-bottom:8px;">
      ${allowedCategories.map((category) => `
        <option value="${category}" ${category === selectedCategory ? "selected" : ""}>${escapeHtml(getInventoryCategoryLabel(category))}</option>
      `).join("")}
    </select>
    <input id="inv_brand" placeholder="Бренд" value="${escapeHtml(item?.brand || "")}" style="width:100%; margin-bottom:8px;">
    <input id="inv_name" placeholder="Название" value="${escapeHtml(item?.name || "")}" style="width:100%; margin-bottom:8px;">
    ${isFilm ? `<input id="inv_color" placeholder="Цвет" value="${escapeHtml(item?.color || "")}" style="width:100%; margin-bottom:8px;">` : ""}
    ${isFilm ? `<input id="inv_width" placeholder="Ширина, см" value="${escapeHtml(item?.width_cm ?? "")}" type="number" step="0.1" style="width:100%; margin-bottom:8px;">` : ""}
    <input id="inv_unit" placeholder="Ед. изм. (m / pcs / roll / l / set)" value="${escapeHtml(item?.unit || (isFilm ? "m" : "pcs"))}" style="width:100%; margin-bottom:8px;">
    <input id="inv_quantity" placeholder="Количество" value="${escapeHtml(item?.quantity ?? 0)}" type="number" step="0.1" style="width:100%; margin-bottom:8px;">
    ${isFilm
      ? `<input id="inv_price" placeholder="Цена" value="${escapeHtml(item?.retail_price ?? item?.purchase_price ?? 0)}" type="number" step="0.01" style="width:100%; margin-bottom:8px;">`
      : `
        <input id="inv_purchase" placeholder="Входная цена" value="${escapeHtml(item?.purchase_price ?? 0)}" type="number" step="0.01" style="width:100%; margin-bottom:8px;">
        <input id="inv_retail" placeholder="Розничная цена" value="${escapeHtml(item?.retail_price ?? 0)}" type="number" step="0.01" style="width:100%; margin-bottom:8px;">
      `}
    <select id="inv_currency" style="width:100%; margin-bottom:8px;">
      <option value="USD" ${String(item?.currency || "USD").toUpperCase() === "USD" ? "selected" : ""}>USD $</option>
      <option value="UAH" ${String(item?.currency || "").toUpperCase() === "UAH" ? "selected" : ""}>UAH ₴</option>
    </select>
    <input id="inv_min" placeholder="Мин. остаток" value="${escapeHtml(item?.min_quantity ?? 0)}" type="number" step="0.1" style="width:100%; margin-bottom:8px;">
    <textarea id="inv_note" placeholder="Заметка" style="width:100%; margin-bottom:8px; min-height:68px;">${escapeHtml(item?.note || "")}</textarea>
    ${mode === "edit" && item?.id ? `
      <div style="margin-bottom:10px; border:1px solid rgba(148,163,184,.25); border-radius:12px; padding:10px; background:rgba(2,6,23,.55);">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px;">
          <div style="font-size:13px; font-weight:700;">История движений</div>
          ${btn("Обновить", `refreshInventoryMovementHistory('${item.id}')`, "padding:6px 10px; font-size:12px;")}
        </div>
        <div id="inventory_movements_${escapeHtml(String(item.id))}">
          ${renderInventoryMovementHistoryBlock(item.id)}
        </div>
      </div>
    ` : ""}
    ${btn(actionLabel, mode === "edit" ? `updateInventoryItem('${item?.id}', '${type}')` : `createInventoryItem('${type}')`)}
  `);
}

async function refreshInventoryMovementHistory(itemId) {
  const box = document.getElementById(`inventory_movements_${itemId}`);
  if (box) {
    box.innerHTML = `<div style="font-size:12px; color:#94a3b8;">Обновляем историю...</div>`;
  }
  await ensureInventoryMovementsForItem(itemId, { force: true });
  if (box) {
    box.innerHTML = renderInventoryMovementHistoryBlock(itemId);
  }
}

async function createInventoryItem(type = "product") {
  const isFilm = type === "film";
  const rawPrice = Number(document.getElementById("inv_price")?.value) || 0;
  const selectedCategory = normalizeInventoryCategory(document.getElementById("inv_category")?.value);
  const fallbackCategory = defaultCategoryByType(type);
  const allowedCategories = isFilm ? FILM_CATEGORIES : PRODUCT_CATEGORIES;
  const category = allowedCategories.includes(selectedCategory) ? selectedCategory : fallbackCategory;

  const payload = {
    category,
    brand: document.getElementById("inv_brand")?.value.trim(),
    name: document.getElementById("inv_name")?.value.trim(),
    width_cm: Number(document.getElementById("inv_width")?.value) || null,
    unit: document.getElementById("inv_unit")?.value.trim() || "m",
    quantity: Number(document.getElementById("inv_quantity")?.value) || 0,
    purchase_price: isFilm ? rawPrice : Number(document.getElementById("inv_purchase")?.value) || 0,
    retail_price: isFilm ? rawPrice : Number(document.getElementById("inv_retail")?.value) || 0,
    currency: document.getElementById("inv_currency")?.value || "USD",
    min_quantity: Number(document.getElementById("inv_min")?.value) || 0,
    color: isFilm ? document.getElementById("inv_color")?.value.trim() || null : null,
    note: document.getElementById("inv_note")?.value.trim() || null,
  };

  if (!payload.name) {
    safeAlert("Заполни название");
    return;
  }
  if (isFilm && !FILM_CATEGORIES.includes(payload.category)) {
    safeAlert("Для плёнки выбери категорию: vinyl, ppf или tint");
    return;
  }
  if (!isFilm && !PRODUCT_CATEGORIES.includes(payload.category)) {
    safeAlert("Для товара выбери категорию: Aroma selective, Gyeon, SRB, Расходники, Химия, Инструменты, Аксессуары или Другое");
    return;
  }

  try {
    await api("create_inventory_item", payload);
    closeModal();
    loadInventory();
    loadDashboard();
    safeAlert(isFilm ? "Плёнка создана" : "Товар создан");
  } catch (e) {
    console.error(e);
  }
}

async function updateInventoryItem(id, type = "product") {
  const isFilm = type === "film";
  const rawPrice = Number(document.getElementById("inv_price")?.value) || 0;
  const selectedCategory = normalizeInventoryCategory(document.getElementById("inv_category")?.value);
  const fallbackCategory = defaultCategoryByType(type);
  const allowedCategories = isFilm ? FILM_CATEGORIES : PRODUCT_CATEGORIES;
  const category = allowedCategories.includes(selectedCategory) ? selectedCategory : fallbackCategory;

  const payload = {
    id,
    category,
    brand: document.getElementById("inv_brand")?.value.trim(),
    name: document.getElementById("inv_name")?.value.trim(),
    width_cm: isFilm ? Number(document.getElementById("inv_width")?.value) || null : null,
    unit: document.getElementById("inv_unit")?.value.trim() || (isFilm ? "m" : "pcs"),
    quantity: Number(document.getElementById("inv_quantity")?.value) || 0,
    purchase_price: isFilm ? rawPrice : Number(document.getElementById("inv_purchase")?.value) || 0,
    retail_price: isFilm ? rawPrice : Number(document.getElementById("inv_retail")?.value) || 0,
    currency: document.getElementById("inv_currency")?.value || "USD",
    min_quantity: Number(document.getElementById("inv_min")?.value) || 0,
    color: isFilm ? document.getElementById("inv_color")?.value.trim() || null : null,
    note: document.getElementById("inv_note")?.value.trim() || null,
  };

  if (!payload.name) {
    safeAlert("Заполни название");
    return;
  }
  if (isFilm && !FILM_CATEGORIES.includes(payload.category)) {
    safeAlert("Для плёнки выбери категорию: vinyl, ppf или tint");
    return;
  }
  if (!isFilm && !PRODUCT_CATEGORIES.includes(payload.category)) {
    safeAlert("Для товара выбери категорию: Aroma selective, Gyeon, SRB, Расходники, Химия, Инструменты, Аксессуары или Другое");
    return;
  }

  try {
    await api("update_inventory_item", payload);
    closeModal();
    await loadInventory();
    loadDashboard();
    safeAlert(isFilm ? "Плёнка обновлена" : "Товар обновлён");
  } catch (e) {
    console.error(e);
    safeAlert(e.message || "Ошибка обновления позиции");
  }
}

async function deleteInventoryItem(id) {
  const item = (state.inventory || []).find((x) => String(x.id) === String(id));
  const label = item?.name ? `«${item.name}»` : "эту позицию";
  const ok = await safeConfirm(`Удалить ${label}?`);
  if (!ok) return;

  try {
    await api("delete_inventory_item", { id });
    await loadInventory();
    loadDashboard();
    safeAlert("Позиция удалена");
  } catch (e) {
    console.error(e);
    safeAlert(e.message || "Ошибка удаления позиции");
  }
}






function openCreateClient() {
  openModal(`
    <h3 style="margin-top:0;">Новый клиент</h3>
    <input id="client_form_name" placeholder="Имя" style="width:100%; margin-bottom:10px;">
    <input id="client_phone" placeholder="Телефон" style="width:100%; margin-bottom:10px;">
    <input id="client_instagram" placeholder="Instagram" style="width:100%; margin-bottom:10px;">
    <textarea id="client_note" placeholder="Заметка" style="width:100%; margin-bottom:10px;"></textarea>
    ${btn("Создать", "createClient()")}
  `);
}

async function createClient() {
  const full_name = document.getElementById("client_form_name")?.value.trim();
  const phone = document.getElementById("client_phone")?.value.trim();
  const instagram = document.getElementById("client_instagram")?.value.trim();
  const note = document.getElementById("client_note")?.value.trim();

  if (!full_name) {
    safeAlert("Укажи имя клиента");
    return;
  }

  try {
    await api("create_client", {
      full_name,
      phone,
      instagram,
      note,
    });

    await loadClientsToState();
    closeModal();
    safeAlert("Клиент создан");
    loadDashboard();
  } catch (e) {
    console.error(e);
  }
}

function openModal(html) {
  const modal = document.getElementById("modal");
  if (!modal) return;

  modal.innerHTML = `
    <div style="
      position:fixed;
      inset:0;
      background:rgba(0,0,0,0.7);
      display:flex;
      align-items:flex-end;
      justify-content:center;
      z-index:9999;
    ">
      <div style="
        width:100%;
        max-width:700px;
        max-height:85vh;
        overflow:auto;
        background:#0f172a;
        color:#fff;
        padding:16px;
        border-top-left-radius:18px;
        border-top-right-radius:18px;
        border:1px solid #1f2937;
      ">
        ${html}
        <br><br>
        ${btn("Закрыть", "closeModal()")}
      </div>
    </div>
  `;
}

function closeModal() {
  const modal = document.getElementById("modal");
  if (modal) modal.innerHTML = "";
}

async function loadFinance() {
  const el = document.getElementById("finance");
  if (!el) return;
  el.innerHTML = `<div style="padding:16px;">Загрузка...</div>`;

  try {
    const summaryRes = await api("get_finance_summary", { period: "all_time" });
    const summary = summaryRes && typeof summaryRes === "object" ? summaryRes : {};

    const ordersRes = await api("get_orders");
    const orders = Array.isArray(ordersRes?.items) ? ordersRes.items : [];
    state.orders = orders;

    const expensesRes = await api("get_expenses");
    const expenses = Array.isArray(expensesRes?.items) ? expensesRes.items : [];

    const paidFromOrders = orders.reduce((sum, o) => sum + Math.max(0, asNumber(o.paid, 0)), 0);
    const accruedFromOrders = orders.reduce((sum, o) => sum + Math.max(0, asNumber(o.total, 0)), 0);
    const revenue = asNumber(summary.revenue ?? summary.orders_paid_total ?? summary.orders_revenue, paidFromOrders);
    const accrued = asNumber(summary.accrued ?? summary.orders_total ?? summary.accrued_total, accruedFromOrders);
    const expenseTotal = asNumber(summary.expenses_total, 0);
    const netProfit = asNumber(summary.net_profit, asNumber(summary.gross_profit, 0) - expenseTotal);
    const unpaidFromSummary = asNumber(
      summary.unpaid_total ?? summary.due_total ?? summary.orders_due_total,
      NaN
    );
    const unpaidFromOrders = orders.reduce((sum, o) => sum + Math.max(0, asNumber(o.due, 0)), 0);
    const unpaidTotal = Number.isFinite(unpaidFromSummary) ? unpaidFromSummary : unpaidFromOrders;

    const recentPayments = orders
      .flatMap((order) => {
        const payments = parsePayments(order);
        return payments.map((payment) => ({ order, payment }));
      })
      .sort((a, b) => {
        const da = parseDateValue(a.payment?.date || a.payment?.paid_at || a.payment?.created_at || "");
        const db = parseDateValue(b.payment?.date || b.payment?.paid_at || b.payment?.created_at || "");
        return (db?.getTime() || 0) - (da?.getTime() || 0);
      })
      .slice(0, 8);

    const recentExpenses = [...expenses]
      .sort((a, b) => {
        const da = parseDateValue(a?.date || a?.expense_date || a?.created_at || "");
        const db = parseDateValue(b?.date || b?.expense_date || b?.created_at || "");
        return (db?.getTime() || 0) - (da?.getTime() || 0);
      })
      .slice(0, 8);

    const dueOrders = orders
      .filter((o) => asNumber(o.due, 0) > 0)
      .sort((a, b) => asNumber(b.due, 0) - asNumber(a.due, 0))
      .slice(0, 8);

    el.innerHTML = `
      <div style="padding:16px;">
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
          ${btn("+ Расход", "openCreateExpense()")}
        </div>

        ${card(`
          <div style="font-size:12px; letter-spacing:.07em; color:#c4b5fd; font-weight:800; margin-bottom:2px;">ФИНАНСЫ</div>
          <div style="font-size:11px; color:#94a3b8; margin-bottom:10px;">Период: за всё время</div>
          <div style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px;">
            <div class="kpi-card" style="border-color:rgba(37,99,235,.35); background:linear-gradient(180deg, rgba(30,58,138,.22), rgba(9,15,30,.95));">
              <div style="font-size:11px; color:#93c5fd; margin-bottom:4px;">Выручка</div>
              <div style="font-size:21px; font-weight:900;">${formatMoney(revenue)} ₴</div>
            </div>
            <div class="kpi-card" style="border-color:rgba(124,58,237,.35); background:linear-gradient(180deg, rgba(76,29,149,.24), rgba(9,15,30,.95));">
              <div style="font-size:11px; color:#c4b5fd; margin-bottom:4px;">Начислено</div>
              <div style="font-size:21px; font-weight:900;">${formatMoney(accrued)} ₴</div>
            </div>
            <div class="kpi-card" style="border-color:rgba(251,146,60,.35); background:linear-gradient(180deg, rgba(124,45,18,.24), rgba(9,15,30,.95));">
              <div style="font-size:11px; color:#fdba74; margin-bottom:4px;">Расходы</div>
              <div style="font-size:21px; font-weight:900;">${formatMoney(expenseTotal)} ₴</div>
            </div>
            <div class="kpi-card" style="border-color:${netProfit >= 0 ? "rgba(34,197,94,.35)" : "rgba(239,68,68,.35)"}; background:${netProfit >= 0 ? "linear-gradient(180deg, rgba(6,78,59,.24), rgba(9,15,30,.95))" : "linear-gradient(180deg, rgba(127,29,29,.24), rgba(9,15,30,.95))"};">
              <div style="font-size:11px; color:${netProfit >= 0 ? "#86efac" : "#fca5a5"}; margin-bottom:4px;">Чистая прибыль</div>
              <div style="font-size:21px; font-weight:900;">${formatMoney(netProfit)} ₴</div>
            </div>
            <div class="kpi-card" style="border-color:rgba(239,68,68,.35); background:linear-gradient(180deg, rgba(127,29,29,.24), rgba(9,15,30,.95));">
              <div style="font-size:11px; color:#fca5a5; margin-bottom:4px;">Неоплачено / к оплате</div>
              <div style="font-size:21px; font-weight:900;">${formatMoney(unpaidTotal)} ₴</div>
            </div>
          </div>
        `)}

        ${card(`
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="font-weight:800; font-size:16px;">Платежи</div>
            <div style="font-size:12px; color:#94a3b8;">Последние ${recentPayments.length}</div>
          </div>
          ${recentPayments.length
            ? recentPayments.map(({ order, payment }) => {
              const amount = asNumber(payment.amount ?? payment.value ?? payment.sum, 0);
              const cur = payment.currency || order.currency || "USD";
              const info = financeItemMeta(order);
              const method = paymentMethodLabel(payment);
              const note = paymentNoteLabel(payment);
              return `
                <div style="border:1px solid rgba(148,163,184,.22); border-radius:12px; padding:10px; margin-bottom:8px; background:rgba(2,6,23,.55); border-left:3px solid rgba(147,197,253,.6);">
                  <div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start;">
                    <div style="font-weight:800; font-size:17px; color:#93c5fd;">${formatMoney(amount)} ${currencySymbol(cur)}</div>
                    <div style="font-size:12px; color:#94a3b8;">${paymentDateLabel(payment, order.updated_at || order.created_at)}</div>
                  </div>
                  <div style="font-size:13px; margin-top:5px;">${escapeHtml(info.client)} · ${escapeHtml(info.car)}</div>
                  <div style="font-size:12px; color:#94a3b8; margin-top:4px;">Заказ: ${orderLabel(order)} · ${escapeHtml(method)}</div>
                  ${note ? `<div style="font-size:12px; color:#cbd5e1; margin-top:4px;">${escapeHtml(note)}</div>` : ""}
                </div>
              `;
            }).join("")
            : `<div style="padding:10px; border-radius:10px; border:1px dashed rgba(148,163,184,.35); color:#94a3b8; font-size:13px;">Платежей пока нет</div>`
          }
        `)}

        ${card(`
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="font-weight:800; font-size:16px;">Расходы</div>
            <div style="font-size:12px; color:#94a3b8;">Последние ${recentExpenses.length}</div>
          </div>
          ${recentExpenses.length
            ? recentExpenses.map((x) => `
              <div style="border:1px solid rgba(148,163,184,.2); border-radius:12px; padding:10px; margin-bottom:8px; background:rgba(2,6,23,.55); border-left:3px solid rgba(251,146,60,.6);">
                <div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start;">
                  <div style="font-weight:700;">${escapeHtml(x.category || "Без категории")}</div>
                  <div style="font-size:12px; color:#94a3b8;">${expenseDateLabel(x)}</div>
                </div>
                <div style="font-size:17px; font-weight:900; margin-top:4px; color:#fdba74;">
                  ${formatMoney(x.amount || 0)} ${currencySymbol(x.currency || "USD")}
                </div>
                <div style="font-size:12px; color:#94a3b8; margin-top:4px;">
                  Поставщик: ${escapeHtml(x.supplier || "—")}
                </div>
                ${x.note ? `<div style="font-size:12px; color:#cbd5e1; margin-top:4px;">${escapeHtml(x.note)}</div>` : ""}
              </div>
            `).join("")
            : `<div style="padding:10px; border-radius:10px; border:1px dashed rgba(148,163,184,.35); color:#94a3b8; font-size:13px;">Расходов пока нет</div>`
          }
        `)}

        ${card(`
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="font-weight:800; font-size:16px;">Неоплаченные заказы</div>
            <div style="font-size:12px; color:#94a3b8;">${dueOrders.length} шт.</div>
          </div>
          ${dueOrders.length
            ? dueOrders.map((o) => {
              const info = financeItemMeta(o);
              return `
                <div style="border:1px solid rgba(239,68,68,.28); border-radius:12px; padding:10px; margin-bottom:8px; background:rgba(127,29,29,.15); border-left:3px solid rgba(248,113,113,.75);">
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                    <div>
                      <div style="font-weight:700;">${escapeHtml(info.client)}</div>
                      <div style="font-size:12px; color:#cbd5e1; margin-top:4px;">${escapeHtml(info.car)}</div>
                    </div>
                    <div style="text-align:right;">
                      <div style="font-size:18px; font-weight:900; color:#fecaca;">${formatMoney(o.due || 0)} ${currencySymbol(o.currency || "USD")}</div>
                      <div style="margin-top:4px;">${financeOrderStatusLabel(o)}</div>
                    </div>
                  </div>
                  <div style="margin-top:8px;">
                    <button onclick="openOrder('${o.id}')" style="
                      width:100%;
                      padding:9px 10px;
                      border-radius:10px;
                      border:1px solid rgba(248,113,113,.45);
                      background:rgba(239,68,68,.16);
                      color:#fee2e2;
                      font-weight:700;
                      cursor:pointer;
                    ">Открыть заказ</button>
                  </div>
                </div>
              `;
            }).join("")
            : `<div style="padding:10px; border-radius:10px; border:1px dashed rgba(34,197,94,.35); color:#86efac; font-size:13px;">Нет заказов с долгом</div>`
          }
        `)}
      </div>
    `;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div style="padding:16px;">Ошибка загрузки финансов</div>`;
  }
}

function openCreateExpense() {
  openModal(`
    <h3 style="margin-top:0;">Новый расход</h3>
    <input id="exp_category" placeholder="Категория" style="width:100%; margin-bottom:10px;">
    <input id="exp_amount" placeholder="Сумма" type="number" step="0.01" style="width:100%; margin-bottom:10px;">
    <select id="exp_currency" style="width:100%; margin-bottom:10px;">
      <option value="UAH">UAH ₴</option>
      <option value="USD">USD $</option>
    </select>
    <input id="exp_supplier" placeholder="Поставщик" style="width:100%; margin-bottom:10px;">
    <textarea id="exp_note" placeholder="Заметка" style="width:100%; margin-bottom:10px;"></textarea>
    ${btn("Создать", "createExpense()")}
  `);
}

async function createExpense() {
  const category = document.getElementById("exp_category")?.value.trim();
  const amount = Number(document.getElementById("exp_amount")?.value);
  const currency = document.getElementById("exp_currency")?.value || "USD";
  const supplier = document.getElementById("exp_supplier")?.value.trim();
  const note = document.getElementById("exp_note")?.value.trim();

  if (!category) {
    safeAlert("Укажи категорию");
    return;
  }

  if (!amount || amount <= 0) {
    safeAlert("Укажи сумму");
    return;
  }

  try {
    await api("create_expense", {
      category,
      amount,
      currency,
      supplier,
      note,
    });

    closeModal();
    loadFinance();
    loadDashboard();
    safeAlert("Расход создан");
  } catch (e) {
    console.error(e);
  }
}

window.showTab = showTab;
window.openCreateOrder = openCreateOrder;
window.createOrder = createOrder;
window.setPaidPreset = setPaidPreset;
window.addOrderService = addOrderService;
window.removeOrderService = removeOrderService;
window.openOrder = openOrder;
window.startEditOrder = startEditOrder;
window.handleDeleteOrder = handleDeleteOrder;
window.addPayment = addPayment;
window.openAddMaterialToOrder = openAddMaterialToOrder;
window.syncAddMaterialFields = syncAddMaterialFields;
window.addMaterialToOrder = addMaterialToOrder;
window.openCreateInventoryItem = openCreateInventoryItem;
window.createInventoryItem = createInventoryItem;
window.openCreateClient = openCreateClient;
window.createClient = createClient;
window.openCreateExpense = openCreateExpense;
window.createExpense = createExpense;
window.setCalendarView = setCalendarView;
window.shiftCalendarAnchor = shiftCalendarAnchor;
window.moveCalendarToToday = moveCalendarToToday;
window.openOrderFromCalendar = openOrderFromCalendar;
window.openModal = openModal;
window.closeModal = closeModal;

document.addEventListener("DOMContentLoaded", initApp);
