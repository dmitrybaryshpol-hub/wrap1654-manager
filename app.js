const tg = window.Telegram?.WebApp;

const API_URL = "https://hbciwqgfccdfnzrhiops.supabase.co/functions/v1/smart-handler";

// ==============================
// INIT
// ==============================

if (tg) {
  tg.expand();
  tg.setHeaderColor("#0f172a");
}

const state = {
  user: null,
  currentTab: "dashboard"
  orderSearch: "",
  orderStatus: "all",
  inventorySearch: "",
  inventoryCategory: "all",
};

// ==============================
// HELPERS
// ==============================

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeAlert(text) {
  if (tg?.showAlert) tg.showAlert(text);
  else alert(text);
}
function getStatusBadge(status = "") {
  const s = String(status || "").trim();
  return `<span class="badge-status status-${s}">${escapeHtml(s || "unknown")}</span>`;
}

function getPaymentBadge(status = "") {
  const s = String(status || "").trim();
  return `<span class="badge-status payment-${s}">${escapeHtml(s || "unknown")}</span>`;
}
function icon(name = "") {
  return `<span class="icon">${name}</span>`;
}

function emptyState(emoji, title, desc) {
  return card(`
    <div class="empty-state">
      <div class="emoji">${emoji}</div>
      <div class="title">${title}</div>
      <div class="desc">${desc}</div>
    </div>
  `);
}
function injectStyles() {
  const old = document.getElementById("app-styles");
  if (old) old.remove();

  const style = document.createElement("style");
  style.id = "app-styles";
  style.innerHTML = `
    :root{
      --bg:#05060a;
      --panel:#0b0f17;
      --panel-2:#111827;
      --line:#1f2937;
      --soft:#94a3b8;
      --text:#f8fafc;
      --accent:#f5c518;
      --accent-2:#ffd54a;
      --danger:#ef4444;
      --success:#22c55e;
      --shadow:0 10px 30px rgba(0,0,0,.35);
      --radius:18px;
    }

    *{
      box-sizing:border-box;
      -webkit-tap-highlight-color:transparent;
    }

    html,body{
      margin:0;
      padding:0;
      background:linear-gradient(180deg,#05060a 0%, #0a0d14 100%);
      color:var(--text);
      font-family:Inter, Arial, sans-serif;
    }

    body{
      min-height:100vh;
    }

    input, select, textarea, button{
      font:inherit;
    }

    input, select, textarea{
      width:100%;
      background:#0b1220;
      color:var(--text);
      border:1px solid var(--line);
      border-radius:14px;
      padding:12px 14px;
      outline:none;
      transition:.2s ease;
    }

    input:focus, select:focus, textarea:focus{
      border-color:#334155;
      box-shadow:0 0 0 3px rgba(245,197,24,.08);
    }

    button{
      border:none;
      outline:none;
    }

    .shell{
      min-height:100vh;
      padding-bottom:92px;
      background:
        radial-gradient(circle at top right, rgba(245,197,24,.08), transparent 24%),
        radial-gradient(circle at top left, rgba(255,255,255,.03), transparent 20%);
    }

    .topbar{
      padding:18px 16px 10px;
    }

    .brand{
      font-size:22px;
      font-weight:800;
      letter-spacing:.2px;
    }

    .sub{
      font-size:12px;
      color:var(--soft);
      margin-top:4px;
    }

    .page{
      padding:0 16px 16px;
    }

    .app-card{
      background:linear-gradient(180deg, rgba(17,24,39,.96), rgba(11,15,23,.96));
      border:1px solid rgba(255,255,255,.05);
      border-radius:22px;
      padding:14px;
      margin-bottom:12px;
      box-shadow:var(--shadow);
    }

    .app-card.clickable{
      cursor:pointer;
      transition:transform .18s ease, border-color .18s ease, background .18s ease;
    }

    .app-card.clickable:active{
      transform:scale(.99);
    }

    .app-card-title{
      font-weight:700;
      font-size:15px;
      margin-bottom:6px;
    }

    .muted{
      color:var(--soft);
      font-size:13px;
    }

    .row{
      display:flex;
      gap:8px;
      flex-wrap:wrap;
    }

    .grid-2{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:10px;
    }

    .stat-value{
      font-size:22px;
      font-weight:800;
      margin-top:6px;
    }

    .section-title{
      font-size:15px;
      font-weight:800;
      margin:14px 0 10px;
    }

    .btn{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:8px;
      min-height:42px;
      padding:0 14px;
      border-radius:14px;
      font-weight:700;
      cursor:pointer;
      transition:.18s ease;
      white-space:nowrap;
    }

    .btn:active{
      transform:scale(.98);
    }

    .btn-primary{
      background:linear-gradient(180deg,var(--accent-2),var(--accent));
      color:#111;
      box-shadow:0 8px 24px rgba(245,197,24,.22);
    }

    .btn-secondary{
      background:#0f172a;
      color:var(--text);
      border:1px solid var(--line);
    }

    .btn-ghost{
      background:transparent;
      color:var(--soft);
      border:1px solid var(--line);
    }

    .bottom-nav{
      position:fixed;
      left:0;
      right:0;
      bottom:0;
      z-index:30;
      padding:10px 12px calc(10px + env(safe-area-inset-bottom));
      background:rgba(7,10,16,.92);
      backdrop-filter:blur(14px);
      border-top:1px solid rgba(255,255,255,.06);
      display:flex;
      gap:8px;
    }

    .nav-btn{
      flex:1;
      min-height:48px;
      border-radius:16px;
      background:#0b1220;
      color:var(--soft);
      border:1px solid var(--line);
      font-weight:700;
    }

    .nav-btn.active{
      background:linear-gradient(180deg,#1b2433,#111827);
      color:#fff;
      border-color:#334155;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
    }

    .modal-overlay{
      position:fixed;
      inset:0;
      z-index:100;
      background:rgba(0,0,0,.68);
      backdrop-filter:blur(8px);
      display:flex;
      align-items:flex-end;
      justify-content:center;
    }

    .modal-sheet{
      width:100%;
      max-width:760px;
      max-height:88vh;
      overflow:auto;
      background:linear-gradient(180deg,#0b0f17,#0d1320);
      border:1px solid rgba(255,255,255,.06);
      border-top-left-radius:24px;
      border-top-right-radius:24px;
      padding:16px;
      box-shadow:0 -10px 30px rgba(0,0,0,.45);
    }

    .modal-title{
      font-size:18px;
      font-weight:800;
      margin:0 0 14px;
    }

    .list-row{
      padding:10px 0;
      border-bottom:1px solid rgba(255,255,255,.06);
    }

    .badge{
      display:inline-flex;
      align-items:center;
      padding:4px 8px;
      border-radius:999px;
      font-size:12px;
      font-weight:700;
      background:#111827;
      border:1px solid var(--line);
      color:#cbd5e1;
    }

    .danger{
      color:#fca5a5;
    }

    .success{
      color:#86efac;
    }

    .divider{
      height:1px;
      background:rgba(255,255,255,.06);
      margin:12px 0;
    }
  `;
  document.head.appendChild(style);
}
// ==============================
// API
// ==============================

async function api(action, data = {}) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action,
      initData: tg?.initData || "",
      ...data
    })
  });

  const json = await res.json();

  if (!res.ok) {
    console.error("API error:", json);
    safeAlert(json.error || "Ошибка");
    throw new Error(json.error || "API error");
  }

  return json;
}

// ==============================
// INIT APP
// ==============================

async function initApp() {
  try {
    injectStyles();

    const user = await api("auth");
    state.user = user;

    renderLayout();
    showTab("dashboard");
  } catch (e) {
    console.error(e);
  }
}

initApp();

// ==============================
// LAYOUT
// ==============================

function renderLayout() {
  document.body.innerHTML = `
    <div class="shell">
      <div class="topbar">
        <div class="brand">Wrap 1654 CRM</div>
        <div class="sub">${escapeHtml(state.user?.first_name || state.user?.username || "User")}</div>
      </div>

      <div id="app">
        <div id="dashboard" class="tab page"></div>
        <div id="orders" class="tab page" style="display:none"></div>
        <div id="inventory" class="tab page" style="display:none"></div>
        <div id="finance" class="tab page" style="display:none"></div>
      </div>
    </div>

    <div class="bottom-nav">
      <button id="nav-dashboard" class="nav-btn" onclick="showTab('dashboard')">Главная</button>
      <button id="nav-orders" class="nav-btn" onclick="showTab('orders')">Заказы</button>
      <button id="nav-inventory" class="nav-btn" onclick="showTab('inventory')">Склад</button>
      <button id="nav-finance" class="nav-btn" onclick="showTab('finance')">Финансы</button>
    </div>

    <div id="modal"></div>
  `;
}

// ==============================
// NAVIGATION
// ==============================

function showTab(tab) {
  state.currentTab = tab;

  document.querySelectorAll(".tab").forEach(el => {
    el.style.display = "none";
  });

  document.querySelectorAll(".nav-btn").forEach(el => {
    el.classList.remove("active");
  });

  const current = document.getElementById(tab);
  if (current) current.style.display = "block";

  const nav = document.getElementById(`nav-${tab}`);
  if (nav) nav.classList.add("active");

  if (tab === "dashboard") loadDashboard();
  if (tab === "orders") loadOrders();
  if (tab === "inventory") loadInventory();
  if (tab === "finance") loadFinance();
}

// ==============================
// UI HELPERS
// ==============================

function card(html, extra = "") {
  return `<div class="app-card ${extra}">${html}</div>`;
}

function btn(text, onclick, variant = "secondary", extra = "") {
  return `
    <button onclick="${onclick}" class="btn btn-${variant}" style="${extra}">
      ${text}
    </button>
  `;
}

function btn(text, onclick, extra = "") {
  return `
    <button onclick="${onclick}" style="
      padding:10px 12px;
      border-radius:10px;
      border:1px solid #374151;
      background:#1f2937;
      color:#fff;
      cursor:pointer;
      ${extra}
    ">${text}</button>
  `;
}

// ==============================
// DASHBOARD
// ==============================

async function loadDashboard() {
  const el = document.getElementById("dashboard");
  el.innerHTML = `
  <div class="sticky-top">
    <div class="toolbar-panel">
      <div class="toolbar">
        ${btn(`${icon("＋")} Заказ`, "openCreateOrder()", "primary")}
        ${btn(`${icon("🛒")} Продажа`, "openCreateSale()", "secondary")}
        ${btn(`${icon("₴")} Расход`, "openCreateExpense()", "ghost")}
      </div>
    </div>
  </div>

  <div class="grid-2">
    ${card(`
      <div class="metric-card">
        <div class="metric-label">Общая выручка</div>
        <div class="metric-value">${(f.orders_revenue || 0) + (f.sales_revenue || 0)}</div>
        <div class="muted">Заказы + склад</div>
      </div>
    `)}

    ${card(`
      <div class="metric-card">
        <div class="metric-label">Чистая прибыль</div>
        <div class="metric-value">${f.net_profit || 0}</div>
        <div class="muted">После расходов</div>
      </div>
    `)}

    ${card(`
      <div class="metric-card">
        <div class="metric-label">Расходы</div>
        <div class="metric-value">${f.expenses_total || 0}</div>
        <div class="muted">За текущий месяц</div>
      </div>
    `)}

    ${card(`
      <div class="metric-card">
        <div class="metric-label">Долги клиентов</div>
        <div class="metric-value">${stats.total_debt || 0}</div>
        <div class="muted">По открытым заказам</div>
      </div>
    `)}
  </div>

  <div class="section-title">Активные заказы</div>
  ${(data.active_orders || []).length ? data.active_orders.map(o => `
    <div onclick="openOrder('${o.id}')">
      ${card(`
        <div class="app-card-title">${escapeHtml(o.order_number || "")}</div>
        <div class="row" style="justify-content:space-between; align-items:center; margin-bottom:8px;">
          ${getStatusBadge(o.status)}
          <b>${o.total || 0}</b>
        </div>
        <div class="mini-stat">
          <span class="mini-stat-label">Оплачено</span>
          <span class="mini-stat-value">${o.paid || 0}</span>
        </div>
        <div class="mini-stat">
          <span class="mini-stat-label">Долг</span>
          <span class="mini-stat-value danger">${o.due || 0}</span>
        </div>
      `, "clickable")}
    </div>
  `).join("") : emptyState("📭", "Нет активных заказов", "Когда появятся новые или текущие заказы, они будут показаны здесь.")}

  <div class="section-title">Заканчивается</div>
  ${(data.low_stock || []).length ? data.low_stock.map(i => `
    ${card(`
      <div class="app-card-title">${escapeHtml(i.name || "")}</div>
      <div class="pretty-row">
        <div>
          <div class="pretty-row-title">Текущий остаток</div>
          <div class="pretty-row-sub">Минимум: ${i.min_quantity || 0}</div>
        </div>
        <div class="pretty-row-right danger">${i.quantity}</div>
      </div>
    `)}
  `).join("") : emptyState("✅", "Склад в норме", "Сейчас нет позиций, которые упали ниже минимального остатка.")}
`;

  try {
    const data = await api("dashboard");

    const f = data.finance || {};
    const stats = data.stats || {};

    el.innerHTML = `
  <div class="grid-2">
    ${card(`
      <div class="muted">Выручка</div>
      <div class="stat-value">${(f.orders_revenue || 0) + (f.sales_revenue || 0)}</div>
    `)}
    ${card(`
      <div class="muted">Чистая прибыль</div>
      <div class="stat-value">${f.net_profit || 0}</div>
    `)}
    ${card(`
      <div class="muted">Расходы</div>
      <div class="stat-value">${f.expenses_total || 0}</div>
    `)}
    ${card(`
      <div class="muted">Долги</div>
      <div class="stat-value">${stats.total_debt || 0}</div>
    `)}
  </div>

  <div class="row" style="margin:12px 0 8px;">
    ${btn("+ Заказ", "openCreateOrder()", "primary")}
    ${btn("+ Продажа", "openCreateSale()", "secondary")}
    ${btn("+ Расход", "openCreateExpense()", "ghost")}
  </div>

  <div class="section-title">Активные заказы</div>
  ${(data.active_orders || []).length ? data.active_orders.map(o => `
    <div onclick="openOrder('${o.id}')">
      ${card(`
        <div class="app-card-title">${escapeHtml(o.order_number || "")}</div>
        <div class="row" style="justify-content:space-between; align-items:center;">
          <span class="badge">${escapeHtml(o.status || "")}</span>
          <b>${o.total || 0}</b>
        </div>
      `, "clickable")}
    </div>
  `).join("") : card(`<div class="muted">Нет активных заказов</div>`)}

  <div class="section-title">Заканчивается</div>
  ${(data.low_stock || []).length ? data.low_stock.map(i => `
    ${card(`
      <div class="app-card-title">${escapeHtml(i.name || "")}</div>
      <div class="muted">Остаток: ${i.quantity}</div>
    `)}
  `).join("") : card(`<div class="muted">Склад в норме</div>`)}
`;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div style="padding:16px;">Ошибка загрузки</div>`;
  }
}
// ==============================
// ORDERS
// ==============================

async function loadOrders() {
  const el = document.getElementById("orders");
  el.innerHTML = `<div style="padding:16px;">Загрузка...</div>`;

  try {
    const orders = await api("get_orders");
    const search = (state.orderSearch || "").trim().toLowerCase();
    const status = state.orderStatus || "all";

    const filtered = (orders || []).filter(o => {
      const orderNumber = String(o.order_number || "").toLowerCase();
      const orderStatus = String(o.status || "").toLowerCase();

      const matchSearch = !search || orderNumber.includes(search);
      const matchStatus = status === "all" || orderStatus === status;

      return matchSearch && matchStatus;
    });

    el.innerHTML = `
  <div class="sticky-top">
    <div class="toolbar-panel">
      <div class="toolbar">
        ${btn(`${icon("＋")} Новый заказ`, "openCreateOrder()", "primary")}
      </div>

      <input
        class="search-input"
        placeholder="Поиск по номеру заказа"
        value="${escapeHtml(state.orderSearch)}"
        oninput="setOrderSearch(this.value)"
      >

      <div class="filter-row">
        <button class="filter-chip ${state.orderStatus === "all" ? "active" : ""}" onclick="setOrderStatus('all')">Все</button>
        <button class="filter-chip ${state.orderStatus === "new" ? "active" : ""}" onclick="setOrderStatus('new')">New</button>
        <button class="filter-chip ${state.orderStatus === "in_progress" ? "active" : ""}" onclick="setOrderStatus('in_progress')">In progress</button>
        <button class="filter-chip ${state.orderStatus === "ready" ? "active" : ""}" onclick="setOrderStatus('ready')">Ready</button>
        <button class="filter-chip ${state.orderStatus === "closed" ? "active" : ""}" onclick="setOrderStatus('closed')">Closed</button>
      </div>
    </div>
  </div>

  ${filtered.length ? filtered.map(o => `
    <div onclick="openOrder('${o.id}')" style="cursor:pointer;">
      ${card(`
        <div class="app-card-title">${escapeHtml(o.order_number || "")}</div>
        <div class="row" style="justify-content:space-between; align-items:center; margin-bottom:8px;">
          ${getStatusBadge(o.status)}
          <b>${o.total || 0} ${escapeHtml(o.currency || "UAH")}</b>
        </div>

        <div class="pretty-row">
          <div>
            <div class="pretty-row-title">Оплачено</div>
            <div class="pretty-row-sub">Текущий прогресс оплаты</div>
          </div>
          <div class="pretty-row-right">${o.paid || 0}</div>
        </div>

        <div class="pretty-row">
          <div>
            <div class="pretty-row-title">Долг</div>
            <div class="pretty-row-sub">Остаток к оплате</div>
          </div>
          <div class="pretty-row-right danger">${o.due || 0}</div>
        </div>
      `, "clickable")}
    </div>
  `).join("") : emptyState("🔎", "Ничего не найдено", "Попробуй изменить поиск или выбрать другой фильтр по статусу.")}
`;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div style="padding:16px;">Ошибка загрузки заказов</div>`;
  }
}
function setOrderSearch(value) {
  state.orderSearch = value;
  loadOrders();
}

function setOrderStatus(value) {
  state.orderStatus = value;
  loadOrders();
}

// ==============================
// ORDER VIEW
// ==============================

async function openOrder(id) {
  try {
    const order = await api("get_order", { id });

    let materialsHtml = `
      <div class="muted">Материалы ещё не добавлены</div>
    `;

    if (order.materials && order.materials.length) {
      materialsHtml = order.materials.map(m => `
        <div style="border-bottom:1px solid #1f2937; padding:6px 0;">
          <div><b>${escapeHtml(m.item_name || m.inventory_item_id || "Материал")}</b></div>
          <div style="font-size:13px; opacity:0.8;">
            Кол-во: ${m.quantity} | Себестоимость: ${m.total_cost || 0}
          </div>
        </div>
      `).join("");
    }

    openModal(`
      <h3 style="margin-top:0;">${escapeHtml(order.order_number || "")}</h3>

      <div class="row" style="justify-content:space-between; align-items:center; margin-bottom:10px;">
  ${getStatusBadge(order.status)}
  ${getPaymentBadge(
    (order.paid || 0) <= 0 ? "unpaid" : (order.due || 0) > 0 ? "partial_paid" : "paid"
  )}
</div>

<div class="grid-2" style="margin-bottom:12px;">
  ${card(`
    <div class="metric-label">Сумма</div>
    <div class="metric-value" style="font-size:20px;">${order.total || 0}</div>
  `)}
  ${card(`
    <div class="metric-label">Долг</div>
    <div class="metric-value" style="font-size:20px;">${order.due || 0}</div>
  `)}
</div>

      <div style="display:flex; gap:8px; flex-wrap:wrap; margin:12px 0;">
  ${btn(`${icon("₴")} Оплата`, `addPayment('${id}')`, "primary")}
  ${btn(`${icon("🧩")} Материал`, `addMaterial('${id}')`, "secondary")}
</div>

      <hr style="border-color:#1f2937;">

      <h4>Материалы</h4>
      <div style="max-height:220px; overflow:auto;">${materialsHtml}</div>
    `);
  } catch (e) {
    console.error(e);
  }
}

// ==============================
// CREATE ORDER
// ==============================

function openCreateOrder() {
  openModal(`
    <h3 style="margin-top:0;">Новый заказ</h3>

    <input id="client" placeholder="Client ID" style="width:100%; margin-bottom:10px;">
    <input id="total" placeholder="Сумма" type="number" style="width:100%; margin-bottom:10px;">

    ${btn("Создать", "createOrder()")}
  `);
}

async function createOrder() {
  const client_id = document.getElementById("client").value.trim();
  const total = Number(document.getElementById("total").value);

  if (!client_id) {
    safeAlert("Укажи client_id");
    return;
  }

  if (!total || total <= 0) {
    safeAlert("Укажи сумму");
    return;
  }

  try {
    await api("create_order", {
      client_id,
      total
    });

    closeModal();
    loadOrders();
    safeAlert("Заказ создан");
  } catch (e) {
    console.error(e);
  }
}

// ==============================
// ADD PAYMENT
// ==============================

async function addPayment(order_id) {
  const amount = prompt("Сумма");

  if (!amount) return;

  try {
    await api("add_payment", {
      order_id,
      amount: Number(amount)
    });

    safeAlert("Оплата добавлена");
    openOrder(order_id);
    loadOrders();
    loadDashboard();
  } catch (e) {
    console.error(e);
  }
}

// ==============================
// MATERIALS IN ORDER UI
// ==============================

async function addMaterial(order_id) {
  try {
    const items = await api("get_inventory");

    openModal(`
      <h3 style="margin-top:0;">Добавить материал в заказ</h3>

      <input
        id="material-search"
        placeholder="Поиск товара"
        oninput="filterMaterialList()"
        style="width:100%; margin-bottom:10px;"
      >

      <input type="hidden" id="selected_item_id">
      <div id="selected_item_name" style="margin-bottom:10px; color:#9ca3af;">
        Товар не выбран
      </div>

      <input
        id="material_qty"
        placeholder="Количество"
        type="number"
        step="0.1"
        style="width:100%; margin-bottom:10px;"
      >

      <div id="material-list" style="
        max-height:240px;
        overflow:auto;
        border:1px solid #1f2937;
        padding:6px;
        border-radius:10px;
      ">
        ${(items || []).map(i => `
          <div
            class="material-row"
            data-name="${escapeHtml((i.name || "").toLowerCase())}"
            onclick="selectMaterial('${i.id}', \`${escapeHtml(i.name || "")}\`)"
            style="
              padding:8px;
              border-bottom:1px solid #1f2937;
              cursor:pointer;
              border-radius:8px;
            "
          >
            <b>${escapeHtml(i.name || "")}</b><br>
            <span style="font-size:13px; opacity:0.8;">
              Остаток: ${i.quantity} | Резерв: ${i.reserved_quantity} | Доступно: ${i.available_quantity}
            </span>
          </div>
        `).join("")}
      </div>

      <br>
      ${btn("Списать в заказ", `submitMaterialToOrder('${order_id}')`)}
    `);
  } catch (e) {
    console.error(e);
  }
}

function selectMaterial(id, name) {
  const hidden = document.getElementById("selected_item_id");
  const label = document.getElementById("selected_item_name");
  if (hidden) hidden.value = id;
  if (label) label.innerHTML = `Выбрано: <b>${name}</b>`;
}

function filterMaterialList() {
  const input = document.getElementById("material-search");
  const q = (input?.value || "").trim().toLowerCase();

  document.querySelectorAll(".material-row").forEach(row => {
    const name = row.dataset.name || "";
    row.style.display = name.includes(q) ? "block" : "none";
  });
}

async function submitMaterialToOrder(order_id) {
  const item_id = document.getElementById("selected_item_id")?.value;
  const qty = Number(document.getElementById("material_qty")?.value);

  if (!item_id) {
    safeAlert("Сначала выбери товар");
    return;
  }

  if (!qty || qty <= 0) {
    safeAlert("Укажи корректное количество");
    return;
  }

  try {
    // если у тебя в smart-handler action называется иначе,
    // поменяй на writeoff_reserved_inventory
    await api("writeoff_inventory", {
      order_id,
      item_id,
      quantity: qty
    });

    safeAlert("Материал списан");
    closeModal();
    openOrder(order_id);
    loadInventory();
    loadOrders();
  } catch (e) {
    console.error(e);
  }
}

// ==============================
// INVENTORY
// ==============================

async function loadInventory() {
  const el = document.getElementById("inventory");
  el.innerHTML = `
  <div class="sticky-top">
    <div class="toolbar-panel">
      <div class="toolbar">
        ${btn(`${icon("📦")} Приход`, "openAddStock()", "primary")}
        ${btn(`${icon("＋")} Товар`, "openCreateInventoryItem()", "secondary")}
      </div>

      <input
        class="search-input"
        placeholder="Поиск по названию или бренду"
        value="${escapeHtml(state.inventorySearch)}"
        oninput="setInventorySearch(this.value)"
      >

      <div class="filter-row">
        <button class="filter-chip ${state.inventoryCategory === "all" ? "active" : ""}" onclick="setInventoryCategory('all')">Все</button>
        <button class="filter-chip ${state.inventoryCategory === "vinyl" ? "active" : ""}" onclick="setInventoryCategory('vinyl')">Vinyl</button>
        <button class="filter-chip ${state.inventoryCategory === "ppf" ? "active" : ""}" onclick="setInventoryCategory('ppf')">PPF</button>
        <button class="filter-chip ${state.inventoryCategory === "tint" ? "active" : ""}" onclick="setInventoryCategory('tint')">Tint</button>
        <button class="filter-chip ${state.inventoryCategory === "consumables" ? "active" : ""}" onclick="setInventoryCategory('consumables')">Расходники</button>
      </div>
    </div>
  </div>

  ${filtered.length ? filtered.map(i => `
    <div onclick="openItem('${i.id}')" style="cursor:pointer;">
      ${card(`
        <div class="row" style="justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div class="app-card-title" style="margin-bottom:0;">${escapeHtml(i.name || "")}</div>
          <span class="badge">${escapeHtml(i.category || "")}</span>
        </div>

        <div class="pretty-row">
          <div>
            <div class="pretty-row-title">Остаток</div>
            <div class="pretty-row-sub">Полное количество на складе</div>
          </div>
          <div class="pretty-row-right">${i.quantity}</div>
        </div>

        <div class="pretty-row">
          <div>
            <div class="pretty-row-title">Резерв</div>
            <div class="pretty-row-sub">Уже выделено под заказы</div>
          </div>
          <div class="pretty-row-right">${i.reserved_quantity}</div>
        </div>

        <div class="pretty-row">
          <div>
            <div class="pretty-row-title">Доступно</div>
            <div class="pretty-row-sub">Свободный остаток</div>
          </div>
          <div class="pretty-row-right ${Number(i.available_quantity) <= Number(i.min_quantity || 0) ? "danger" : "success"}">
            ${i.available_quantity}
          </div>
        </div>
      `, "clickable")}
    </div>
  `).join("") : emptyState("📦", "Ничего не найдено", "Попробуй изменить поиск или выбрать другую категорию.")}
`;

  try {
    const items = await api("get_inventory");
    const search = (state.inventorySearch || "").trim().toLowerCase();
    const category = state.inventoryCategory || "all";

    const filtered = (items || []).filter(i => {
      const name = String(i.name || "").toLowerCase();
      const brand = String(i.brand || "").toLowerCase();
      const itemCategory = String(i.category || "").toLowerCase();

      const matchSearch = !search || name.includes(search) || brand.includes(search);
      const matchCategory = category === "all" || itemCategory === category;

      return matchSearch && matchCategory;
    });

    el.innerHTML = `
      <div>
        <div class="toolbar">
          ${btn("+ Приход", "openAddStock()", "primary")}
          ${btn("+ Товар", "openCreateInventoryItem()", "secondary")}
        </div>

        <input
          class="search-input"
          placeholder="Поиск по названию или бренду"
          value="${escapeHtml(state.inventorySearch)}"
          oninput="setInventorySearch(this.value)"
        >

        <div class="filter-row">
          <button class="filter-chip ${state.inventoryCategory === "all" ? "active" : ""}" onclick="setInventoryCategory('all')">Все</button>
          <button class="filter-chip ${state.inventoryCategory === "vinyl" ? "active" : ""}" onclick="setInventoryCategory('vinyl')">Vinyl</button>
          <button class="filter-chip ${state.inventoryCategory === "ppf" ? "active" : ""}" onclick="setInventoryCategory('ppf')">PPF</button>
          <button class="filter-chip ${state.inventoryCategory === "tint" ? "active" : ""}" onclick="setInventoryCategory('tint')">Tint</button>
          <button class="filter-chip ${state.inventoryCategory === "consumables" ? "active" : ""}" onclick="setInventoryCategory('consumables')">Расходники</button>
        </div>

        ${filtered.length ? filtered.map(i => `
          <div onclick="openItem('${i.id}')" style="cursor:pointer;">
            ${card(`
              <div class="app-card-title">${escapeHtml(i.name || "")}</div>
              <div class="row" style="justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span class="badge">${escapeHtml(i.category || "")}</span>
                <b>${i.available_quantity}</b>
              </div>
              <div class="muted">Остаток: ${i.quantity}</div>
              <div class="muted">Резерв: ${i.reserved_quantity}</div>
              <div class="muted">Доступно: ${i.available_quantity}</div>
            `, "clickable")}
          </div>
        `).join("") : card(`<div class="muted">Ничего не найдено</div>`)}
      </div>
    `;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div style="padding:16px;">Ошибка загрузки склада</div>`;
  }
}
function setInventorySearch(value) {
  state.inventorySearch = value;
  loadInventory();
}

function setInventoryCategory(value) {
  state.inventoryCategory = value;
  loadInventory();
}

// ==============================
// INVENTORY ITEM
// ==============================

async function openItem(id) {
  try {
    const item = await api("get_inventory_item", { id });
    const movements = await api("get_inventory_movements", { item_id: id });

    openModal(`
      <h3 style="margin-top:0;">${escapeHtml(item.name || "")}</h3>

      <p>Остаток: ${item.quantity}</p>
      <p>Резерв: ${item.reserved_quantity}</p>
      <p>Доступно: ${item.available_quantity}</p>
      <p>Вход: ${item.purchase_price || 0}</p>
      <p>Розница: ${item.retail_price || 0}</p>

      <div style="display:flex; gap:8px; flex-wrap:wrap; margin:12px 0;">
        ${btn("🔒 Резерв", `reserveItem('${id}')`)}
        ${btn("🔓 Снять резерв", `unreserveItem('${id}')`)}
        ${btn("⚙️ Корректировка", `adjustItem('${id}')`)}
      </div>

      <hr style="border-color:#1f2937;">

      <h4>История</h4>
      <div style="max-height:220px; overflow:auto;">
        ${(movements || []).length ? movements.map(m => `
          <div style="border-bottom:1px solid #1f2937; padding:6px 0;">
            <div><b>${escapeHtml(m.movement_type || "")}</b> — ${m.quantity}</div>
            <div style="font-size:12px; opacity:0.75;">
              ${escapeHtml(m.comment || "")}
            </div>
          </div>
        `).join("") : `<div style="opacity:0.7;">Движений пока нет</div>`}
      </div>
    `);
  } catch (e) {
    console.error(e);
  }
}

// ==============================
// CREATE INVENTORY ITEM
// ==============================

function openCreateInventoryItem() {
  openModal(`
    <h3 style="margin-top:0;">Новый товар</h3>

    <input id="inv_category" placeholder="Категория (vinyl / ppf / tint / consumables)" style="width:100%; margin-bottom:8px;">
    <input id="inv_brand" placeholder="Бренд" style="width:100%; margin-bottom:8px;">
    <input id="inv_name" placeholder="Название" style="width:100%; margin-bottom:8px;">
    <input id="inv_width" placeholder="Ширина, см" type="number" style="width:100%; margin-bottom:8px;">
    <input id="inv_unit" placeholder="Ед. изм. (m / pcs / roll / l / set)" style="width:100%; margin-bottom:8px;">
    <input id="inv_quantity" placeholder="Количество" type="number" step="0.1" style="width:100%; margin-bottom:8px;">
    <input id="inv_purchase" placeholder="Входная цена" type="number" step="0.01" style="width:100%; margin-bottom:8px;">
    <input id="inv_retail" placeholder="Розничная цена" type="number" step="0.01" style="width:100%; margin-bottom:8px;">
    <input id="inv_currency" placeholder="Валюта (UAH / USD)" style="width:100%; margin-bottom:8px;">
    <input id="inv_min" placeholder="Мин. остаток" type="number" step="0.1" style="width:100%; margin-bottom:8px;">

    ${btn("Создать", "createInventoryItem()")}
  `);
}

async function createInventoryItem() {
  const payload = {
    category: document.getElementById("inv_category").value.trim(),
    brand: document.getElementById("inv_brand").value.trim(),
    name: document.getElementById("inv_name").value.trim(),
    width_cm: Number(document.getElementById("inv_width").value) || null,
    unit: document.getElementById("inv_unit").value.trim() || "m",
    quantity: Number(document.getElementById("inv_quantity").value) || 0,
    purchase_price: Number(document.getElementById("inv_purchase").value) || 0,
    retail_price: Number(document.getElementById("inv_retail").value) || 0,
    currency: document.getElementById("inv_currency").value.trim() || "UAH",
    min_quantity: Number(document.getElementById("inv_min").value) || 0
  };

  if (!payload.category || !payload.name) {
    safeAlert("Заполни категорию и название");
    return;
  }

  try {
    await api("create_inventory_item", payload);
    closeModal();
    loadInventory();
    safeAlert("Товар создан");
  } catch (e) {
    console.error(e);
  }
}

// ==============================
// ADD STOCK
// ==============================

function openAddStock() {
  openModal(`
    <h3 style="margin-top:0;">Приход</h3>

    <input id="item_id" placeholder="ID товара" style="width:100%; margin-bottom:10px;">
    <input id="qty" placeholder="Количество" type="number" step="0.1" style="width:100%; margin-bottom:10px;">
    <input id="purchase_price" placeholder="Входная цена" type="number" step="0.01" style="width:100%; margin-bottom:10px;">

    ${btn("Добавить", "addStock()")}
  `);
}

async function addStock() {
  const item_id = document.getElementById("item_id").value.trim();
  const qty = Number(document.getElementById("qty").value);
  const purchase_price = Number(document.getElementById("purchase_price").value) || 0;

  if (!item_id) {
    safeAlert("Укажи ID товара");
    return;
  }

  if (!qty || qty <= 0) {
    safeAlert("Укажи количество");
    return;
  }

  try {
    await api("add_stock", {
      item_id,
      quantity: qty,
      purchase_price
    });

    closeModal();
    loadInventory();
    safeAlert("Приход добавлен");
  } catch (e) {
    console.error(e);
  }
}

// ==============================
// RESERVE / UNRESERVE / ADJUST
// ==============================

async function reserveItem(id) {
  const qty = prompt("Сколько зарезервировать?");
  if (!qty) return;

  try {
    await api("reserve_inventory", {
      item_id: id,
      quantity: Number(qty),
      comment: "Резерв из приложения"
    });

    safeAlert("Зарезервировано");
    openItem(id);
    loadInventory();
  } catch (e) {
    console.error(e);
  }
}

async function unreserveItem(id) {
  const qty = prompt("Сколько снять с резерва?");
  if (!qty) return;

  try {
    await api("unreserve_inventory", {
      item_id: id,
      quantity: Number(qty),
      comment: "Снятие резерва"
    });

    safeAlert("Резерв снят");
    openItem(id);
    loadInventory();
  } catch (e) {
    console.error(e);
  }
}

async function adjustItem(id) {
  const qty = prompt("Изменение (+ или -)");
  if (!qty) return;

  try {
    await api("adjust_inventory", {
      item_id: id,
      quantity_delta: Number(qty),
      comment: "Корректировка"
    });

    safeAlert("Обновлено");
    openItem(id);
    loadInventory();
  } catch (e) {
    console.error(e);
  }
}

// ==============================
// SALES (заготовка)
// ==============================

function openCreateSale() {
  openModal(`
    <h3 style="margin-top:0;">Новая продажа</h3>

    <input id="sale_client_id" placeholder="Client ID" style="width:100%; margin-bottom:10px;">
    <input id="sale_comment" placeholder="Комментарий" style="width:100%; margin-bottom:10px;">

    ${btn("Создать продажу", "createSale()")}
  `);
}

async function createSale() {
  const client_id = document.getElementById("sale_client_id").value.trim();
  const comment = document.getElementById("sale_comment").value.trim();

  try {
    const sale = await api("create_sale", {
      client_id: client_id || null,
      comment,
      currency: "UAH"
    });

    closeModal();
    safeAlert(`Продажа создана: ${sale.sale_number || sale.id}`);
  } catch (e) {
    console.error(e);
  }
}

// ==============================
// CLIENTS (заглушка)
// ==============================

function openCreateClient() {
  safeAlert("Экран клиентов добавим следующим шагом");
}

// ==============================
// MODAL
// ==============================

function openModal(html) {
  document.getElementById("modal").innerHTML = `
    <div class="modal-overlay">
      <div class="modal-sheet">
        ${html}
        <div style="height:10px;"></div>
        ${btn("Закрыть", "closeModal()", "ghost")}
      </div>
    </div>
  `;
}

function closeModal() {
  document.getElementById("modal").innerHTML = "";
}

// ==============================
// FINANCE
// ==============================

async function loadFinance() {
  const el = document.getElementById("finance");
  el.innerHTML = `<div style="padding:16px;">Загрузка...</div>`;

  try {
    const summary = await api("get_finance_summary");
    const expenses = await api("get_expenses");

    el.innerHTML = `
      <div style="padding:16px;">
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
          ${btn("+ Расход", "openCreateExpense()")}
        </div>

        ${card(`
          <div style="font-weight:700; margin-bottom:8px;">Сводка за месяц</div>
          <div>Выручка по заказам: ${summary.orders_revenue || 0}</div>
          <div>Прибыль по заказам: ${summary.orders_profit || 0}</div>
          <div>Выручка со склада: ${summary.sales_revenue || 0}</div>
          <div>Прибыль со склада: ${summary.sales_profit || 0}</div>
          <div>Расходы: ${summary.expenses_total || 0}</div>
          <hr style="border-color:#1f2937;">
          <div><b>Валовая прибыль: ${summary.gross_profit || 0}</b></div>
          <div><b>Чистая прибыль: ${summary.net_profit || 0}</b></div>
        `)}

        <h3 style="margin:12px 0;">Расходы</h3>
        ${(expenses || []).length ? expenses.map(x => `
          ${card(`
            <div style="font-weight:700;">${escapeHtml(x.category || "")}</div>
            <div>${x.amount || 0} ${escapeHtml(x.currency || "UAH")}</div>
            <div style="font-size:12px; opacity:0.7;">${escapeHtml(x.note || "")}</div>
          `)}
        `).join("") : emptyState("🧾", "Расходов пока нет", "Добавь первый расход, чтобы видеть более точную чистую прибыль.")
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

    <input id="exp_category" placeholder="Категория (rent / utilities / ads / salary / other)" style="width:100%; margin-bottom:10px;">
    <input id="exp_amount" placeholder="Сумма" type="number" step="0.01" style="width:100%; margin-bottom:10px;">
    <input id="exp_currency" placeholder="Валюта (UAH / USD)" style="width:100%; margin-bottom:10px;">
    <input id="exp_supplier" placeholder="Поставщик" style="width:100%; margin-bottom:10px;">
    <input id="exp_note" placeholder="Комментарий" style="width:100%; margin-bottom:10px;">

    ${btn("Сохранить", "createExpense()")}
  `);
}

async function createExpense() {
  const category = document.getElementById("exp_category").value.trim();
  const amount = Number(document.getElementById("exp_amount").value);
  const currency = document.getElementById("exp_currency").value.trim() || "UAH";
  const supplier = document.getElementById("exp_supplier").value.trim();
  const note = document.getElementById("exp_note").value.trim();

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
      note
    });

    closeModal();
    loadFinance();
    safeAlert("Расход добавлен");
  } catch (e) {
    console.error(e);
  }
}

function closeModal() {
  document.getElementById("modal").innerHTML = "";
}
