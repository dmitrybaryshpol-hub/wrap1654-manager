const tg = window.Telegram?.WebApp || null;

const API_URL = "https://hbciwqgfccdfnzrhiops.supabase.co/functions/v1/smart-handler";

const state = {
  user: null,
  currentTab: "dashboard",
  fxRate: 0,
  fxUpdatedAt: null,

  orders: [],
  clients: [],
  inventory: [],

  editingOrderId: null,
  orderServices: [],
};
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

function renderBlockedScreen(title, text = "Открой приложение внутри Telegram") {
  document.body.innerHTML = `
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
      background:#111827;
      border:1px solid #1f2937;
      border-radius:14px;
      padding:12px;
      margin-bottom:10px;
      ${extra}
    ">
      ${html}
    </div>
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
    listRoot.innerHTML = `<div style="opacity:.6; font-size:13px;">Добавьте хотя бы одну услугу</div>`;
    return;
  }

  listRoot.innerHTML = services.map((service, index) => `
    <div style="
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      padding:8px 10px;
      border:1px solid #1f2937;
      border-radius:10px;
      margin-bottom:8px;
      background:#0b1120;
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
  document.body.innerHTML = `
    <div id="app-shell" style="
      padding-bottom:80px;
      color:#fff;
      background:#0b1120;
      min-height:100vh;
      font-family:Arial,sans-serif;
    ">
      <div style="padding:16px 16px 8px 16px;">
        <div style="font-size:20px; font-weight:700;">Wrap 1654 CRM</div>
        <div style="font-size:12px; opacity:0.7;">
          ${escapeHtml(state.user?.first_name || state.user?.username || "User")}
        </div>
      </div>

      <div id="app">
        <div id="dashboard" class="tab"></div>
        <div id="orders" class="tab" style="display:none"></div>
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
      padding:10px;
      background:#111827;
      border-top:1px solid #1f2937;
      z-index:20;
    ">
      <button onclick="showTab('dashboard')" style="flex:1;">Главная</button>
      <button onclick="showTab('orders')" style="flex:1;">Заказы</button>
      <button onclick="showTab('inventory')" style="flex:1;">Склад</button>
      <button onclick="showTab('finance')" style="flex:1;">Финансы</button>
    </div>

    <div id="modal"></div>
  `;
}

async function initApp() {
  try {
    if (!tg || !tg.initData) {
      renderBlockedScreen("Доступ закрыт");
      return;
    }

    tg.expand();
    tg.ready();
    tg.setHeaderColor("#0f172a");
    tg.setBackgroundColor("#0b1120");

    const auth = await api("auth");
    if (!auth?.user) {
      throw new Error("Unauthorized");
    }

    state.user = auth.user;
    await loadClientsToState();
    renderLayout();
    showTab("dashboard");
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

  if (tab === "dashboard") loadDashboard();
  if (tab === "orders") loadOrders();
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

    el.innerHTML = `
      <div style="padding:16px;">
        ${card(`
          <div style="font-weight:700; margin-bottom:8px;">📊 Оперативная сводка</div>
          <div>Активных заказов: ${stats.active_count || 0}</div>
          <div>В работе: ${stats.total_in_work || 0}</div>
          <div>Клиентов: ${data.clients_count || 0}</div>
          <div>Товаров: ${data.inventory_count || 0}</div>
        `)}

        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
          ${btn("+ Заказ", "openCreateOrder()")}
          ${btn("+ Клиент", "openCreateClient()")}
        </div>

        <h3 style="margin:12px 0;">📦 Активные заказы</h3>
        ${(data.active_orders || []).length
          ? data.active_orders.map((o) => `
              <div onclick="openOrder('${o.id}')" style="cursor:pointer;">
                ${card(`
                  <div style="font-weight:700;">${orderLabel(o)}</div>
                  <div style="font-size:14px; opacity:0.8;">Статус: ${escapeHtml(o.status || "")}</div>
                  <div style="font-size:14px; opacity:0.8;">Клиент: ${escapeHtml(o.client_name || "—")}</div>
                  <div style="font-size:14px; opacity:0.8;">Авто: ${escapeHtml(o.car_model || "—")}</div>
                `)}
              </div>
            `).join("")
          : card("Нет активных заказов")}

        <h3 style="margin:12px 0;">⚠️ Заканчивается</h3>
        ${(data.low_stock || []).length
          ? data.low_stock.map((i) => `
              ${card(`
                <b>${escapeHtml(i.name || "")}</b><br>
                Остаток: ${formatMoney(i.quantity || 0)}<br>
                Мин. остаток: ${formatMoney(i.min_quantity || 0)}
              `)}
            `).join("")
          : card("Склад в норме")}
      </div>
    `;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div style="padding:16px;">Ошибка загрузки Dashboard</div>`;
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
  <div style="font-weight:700;">${orderLabel(o)}</div>
  <div>${escapeHtml(o.status || "")}</div>
  <div>${formatMoney(o.total || 0)} ${currencySymbol(o.currency || "USD")}</div>
  <div style="font-size:13px; opacity:0.7;">Клиент: ${escapeHtml(o.client_name || "—")}</div>
  <div style="font-size:13px; opacity:0.7;">Авто: ${escapeHtml(o.car_model || "—")}</div>
  <div style="font-size:13px; opacity:0.7;">
    Оплачено: ${formatMoney(o.paid || 0)} ${currencySymbol(o.currency || "USD")}
    |
    Долг: ${formatMoney(o.due || 0)} ${currencySymbol(o.currency || "USD")}
  </div>

  <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
    <button onclick="event.stopPropagation(); startEditOrder('${o.id}')" style="
      padding:10px 12px;
      border-radius:10px;
      border:1px solid #374151;
      background:#1f2937;
      color:#fff;
      cursor:pointer;
    ">Редактировать</button>

    <button onclick="event.stopPropagation(); handleDeleteOrder('${o.id}')" style="
      padding:10px 12px;
      border-radius:10px;
      border:1px solid rgba(239,68,68,.35);
      background:rgba(239,68,68,.15);
      color:#fecaca;
      cursor:pointer;
    ">Удалить</button>
  </div>
`)}              </div>
            `).join("")
          : card("Заказов пока нет")}
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

async function openOrder(id) {
  try {
    const res = await api("get_order", { id });
    const order = res.item;

    let materialsHtml = `<div style="font-size:13px; opacity:0.7;">Материалов пока нет</div>`;

    if (order.materials && order.materials.length) {
      materialsHtml = order.materials.map((m) => `
        <div style="border-bottom:1px solid #1f2937; padding:6px 0;">
          <div><b>${escapeHtml(m.item_name || "Материал")}</b></div>
          <div style="font-size:13px; opacity:0.8;">
            Кол-во: ${formatMoney(m.quantity)} ${escapeHtml(m.unit || "")}
            |
            Себестоимость: ${formatMoney(m.total_cost || 0)} ${currencySymbol(m.currency || order.currency || "USD")}
          </div>
        </div>
      `).join("");
    }

    openModal(`
      <h3 style="margin-top:0;">${orderLabel(order)}</h3>
      <p>Статус: ${escapeHtml(order.status || "")}</p>
      <p>Клиент: ${escapeHtml(order.client_name || "—")}</p>
      <p>Авто: ${escapeHtml(order.car_model || "—")}</p>
      <p>Сумма: ${formatMoney(order.total || 0)} ${currencySymbol(order.currency || "USD")}</p>
      <p>Материалы: ${formatMoney(order.material_cost || 0)} ${currencySymbol(order.currency || "USD")}</p>
      <p>Себестоимость: ${formatMoney(order.total_cost || 0)} ${currencySymbol(order.currency || "USD")}</p>
      <p>Прибыль: ${formatMoney(order.profit || 0)} ${currencySymbol(order.currency || "USD")}</p>
      <p>Оплачено: ${formatMoney(order.paid || 0)} ${currencySymbol(order.currency || "USD")}</p>
      <p>Долг: ${formatMoney(order.due || 0)} ${currencySymbol(order.currency || "USD")}</p>

      ${renderOrderGallery(order)}

      <div style="display:flex; gap:8px; flex-wrap:wrap; margin:12px 0;">
  ${btn("+ Оплата", `addPayment('${id}')`)}
  ${btn("Редактировать", `closeModal(); startEditOrder('${id}')`)}
  ${btn("Удалить", `handleDeleteOrder('${id}')`, "background:rgba(239,68,68,.15); color:#fecaca; border-color:rgba(239,68,68,.35);")}
</div>
      <hr style="border-color:#1f2937;">
      <h4>Материалы</h4>
      <div style="max-height:220px; overflow:auto;">${materialsHtml}</div>
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

    <div style="margin-bottom:14px;">
      <div style="opacity:.6; font-size:12px; margin-bottom:6px;">Клиент</div>

      <select id="client_id" style="width:100%; margin-bottom:8px;">
        <option value="">Выберите клиента</option>
      </select>

      <input id="client_name" placeholder="Имя клиента" style="width:100%; margin-bottom:8px;">
      <input id="car_model" placeholder="Модель авто" style="width:100%;">
    </div>

    <div style="margin-bottom:14px;">
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

    <div style="margin-bottom:14px;">
      <div style="opacity:.6; font-size:12px; margin-bottom:6px;">Даты</div>
      <input id="intake_date" type="date" style="width:100%; margin-bottom:6px;">
      <input id="start_date" type="date" style="width:100%; margin-bottom:6px;">
      <input id="end_date" type="date" style="width:100%;">
    </div>

    <div style="
      background:#020617;
      padding:12px;
      border-radius:12px;
      margin-bottom:14px;
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
      margin-bottom:14px;
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

      <label style="font-size:12px; opacity:.6;">Оплачено</label>
      <input id="paid" type="number" value="0" style="width:100%; margin-bottom:8px;">

      <label style="font-size:12px; opacity:.6;">Долг</label>
      <input id="due" readonly style="
        width:100%;
        font-weight:bold;
        text-align:center;
        background:#020617;
        border:1px solid #1f2937;
        color:#f8fafc;
      ">
    </div>

    <div style="margin-bottom:14px;">
      <label style="font-size:12px; opacity:.6;">Валюта</label>
      <select id="currency" style="width:100%;">
        <option value="UAH">UAH ₴</option>
        <option value="USD">USD $</option>
      </select>
    </div>

    <div style="margin-bottom:14px;">
      <label style="font-size:12px; opacity:.6;">Фото / видео</label>
      <input id="order_media" type="file" accept="image/*,video/*" multiple style="width:100%;">
      <div id="order_media_preview" style="margin-top:8px;"></div>
    </div>

    <textarea id="order_note" placeholder="Комментарий" style="width:100%; min-height:80px; margin-bottom:12px;"></textarea>

    ${btn(isEdit ? "Сохранить изменения" : "Создать заказ", "createOrder()", "width:100%; background:#2563eb;")}
  `);

  renderClientOptions(order?.client_id || "");

  const clientSelect = document.getElementById("client_id");
  if (clientSelect) {
    clientSelect.addEventListener("change", syncSelectedClientToOrderForm);
  }

  bindOrderFormRecalc();
  bindOrderMediaPreview(Array.isArray(order?.media_urls) ? order.media_urls : (order?.media_url ? [order.media_url] : []));
  
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
    document.getElementById("paid").value = String(order.paid ?? 0);
    document.getElementById("currency").value = order.currency || "USD";
    document.getElementById("order_note").value = parsedNote.cleanNote || "";

    if (order.media_url) {
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
  openCreateOrder(order);
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

  const paid = asNumber(paidEl?.value, 0);
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

    const url = res.public_url || res.url || null;
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
  const paid = asNumber(document.getElementById("paid")?.value, 0);
  const due = asNumber(document.getElementById("due")?.value, 0);

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

    try {
      media_urls = await uploadOrderMediaIfNeeded();
    } catch (e) {
      console.warn("Media upload skipped:", e?.message || e);
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
      await api("update_order", {
        id: state.editingOrderId,
        ...payload,
      });

      safeAlert("Заказ обновлён");
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
async function addPayment(order_id) {
  const amount = prompt("Сумма");
  if (!amount) return;

  try {
    const res = await api("get_order", { id: order_id });
    const order = res.item;

    await api("add_payment", {
      order_id,
      amount: Number(amount),
      currency: order.currency || "USD",
    });

    safeAlert("Оплата добавлена");
    openOrder(order_id);
    loadOrders();
    loadDashboard();
    loadFinance();
  } catch (e) {
    console.error(e);
  }
}






async function loadInventory() {
  const el = document.getElementById("inventory");
  if (!el) return;
  el.innerHTML = `<div style="padding:16px;">Загрузка...</div>`;

  try {
    const res = await api("get_inventory");
    const items = res.items || [];
    const filmItems = items.filter((i) => String(i.category || "").toLowerCase() === "film");
    const productItems = items.filter((i) => String(i.category || "").toLowerCase() !== "film");

    const renderInventoryCard = (i, type) => card(`
      <div style="font-weight:700;">${escapeHtml(i.name || "")}</div>
      <div style="font-size:13px; opacity:0.85;">Остаток: ${formatMoney(i.quantity)}</div>
      <div style="font-size:13px; opacity:0.85;">Резерв: ${formatMoney(i.reserved_quantity || 0)}</div>
      <div style="font-size:13px; opacity:0.85;">Доступно: ${formatMoney(i.available_quantity ?? i.quantity)}</div>
      <div style="font-size:13px; opacity:0.85;">Мин. остаток: ${formatMoney(i.min_quantity || 0)}</div>
      ${type === "film"
        ? `<div style="font-size:13px; opacity:0.85;">Цена: ${formatMoney(i.retail_price || i.purchase_price || 0)} ${currencySymbol(i.currency || "USD")}</div>`
        : `
          <div style="font-size:13px; opacity:0.85;">Вход: ${formatMoney(i.purchase_price || 0)} ${currencySymbol(i.currency || "USD")}</div>
          <div style="font-size:13px; opacity:0.85;">Розница: ${formatMoney(i.retail_price || 0)} ${currencySymbol(i.currency || "USD")}</div>
        `}
    `);

    el.innerHTML = `
      <div style="padding:16px;">
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
          ${btn("+ Плёнка", "openCreateInventoryItem('film')")}
          ${btn("+ Товар", "openCreateInventoryItem('product')")}
        </div>

        <h3 style="margin:0 0 8px 0;">Плёнка</h3>
        ${filmItems.length
          ? filmItems.map((i) => `<div>${renderInventoryCard(i, "film")}</div>`).join("")
          : card("Плёнка отсутствует")}

        <h3 style="margin:14px 0 8px 0;">Товар</h3>
        ${productItems.length
          ? productItems.map((i) => `<div>${renderInventoryCard(i, "product")}</div>`).join("")
          : card("Товар отсутствует")}
      </div>
    `;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div style="padding:16px;">Ошибка загрузки склада</div>`;
  }
}


function openCreateInventoryItem(type = "product") {
  const isFilm = type === "film";
  openModal(`
    <h3 style="margin-top:0;">${isFilm ? "Новая плёнка" : "Новый товар"}</h3>
    <input id="inv_brand" placeholder="Бренд" style="width:100%; margin-bottom:8px;">
    <input id="inv_name" placeholder="Название" style="width:100%; margin-bottom:8px;">
    <input id="inv_width" placeholder="Ширина, см" type="number" style="width:100%; margin-bottom:8px;">
    <input id="inv_unit" placeholder="Ед. изм. (m / pcs / roll / l / set)" style="width:100%; margin-bottom:8px;">
    <input id="inv_quantity" placeholder="Количество" type="number" step="0.1" style="width:100%; margin-bottom:8px;">
    ${isFilm
      ? `<input id="inv_price" placeholder="Цена" type="number" step="0.01" style="width:100%; margin-bottom:8px;">`
      : `
        <input id="inv_purchase" placeholder="Входная цена" type="number" step="0.01" style="width:100%; margin-bottom:8px;">
        <input id="inv_retail" placeholder="Розничная цена" type="number" step="0.01" style="width:100%; margin-bottom:8px;">
      `}
    <select id="inv_currency" style="width:100%; margin-bottom:8px;">
      <option value="USD">USD $</option>
      <option value="UAH">UAH ₴</option>
    </select>
    <input id="inv_min" placeholder="Мин. остаток" type="number" step="0.1" style="width:100%; margin-bottom:8px;">
    ${btn("Создать", `createInventoryItem('${type}')`)}
  `);
}

async function createInventoryItem(type = "product") {
  const isFilm = type === "film";
  const rawPrice = Number(document.getElementById("inv_price")?.value) || 0;
  const payload = {
    category: isFilm ? "film" : "product",
    brand: document.getElementById("inv_brand")?.value.trim(),
    name: document.getElementById("inv_name")?.value.trim(),
    width_cm: Number(document.getElementById("inv_width")?.value) || null,
    unit: document.getElementById("inv_unit")?.value.trim() || "m",
    quantity: Number(document.getElementById("inv_quantity")?.value) || 0,
    purchase_price: isFilm ? rawPrice : Number(document.getElementById("inv_purchase")?.value) || 0,
    retail_price: isFilm ? rawPrice : Number(document.getElementById("inv_retail")?.value) || 0,
    currency: document.getElementById("inv_currency")?.value || "USD",
    min_quantity: Number(document.getElementById("inv_min")?.value) || 0,
  };

  if (!payload.name) {
    safeAlert("Заполни название");
    return;
  }

  try {
    await api("create_inventory_item", payload);
    closeModal();
    loadInventory();
    loadDashboard();
    safeAlert("Товар создан");
  } catch (e) {
    console.error(e);
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
    const summary = await api("get_finance_summary");
    const expensesRes = await api("get_expenses");
    const expenses = expensesRes.items || [];

    el.innerHTML = `
      <div style="padding:16px;">
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
          ${btn("+ Расход", "openCreateExpense()")}
        </div>

        ${card(`
          <div style="font-weight:700; margin-bottom:8px;">Сводка</div>
          <div>Выручка по заказам: ${formatMoney(summary.orders_revenue || 0)} ₴</div>
          <div>Прибыль по заказам: ${formatMoney(summary.orders_profit || 0)} ₴</div>
          <div>Расходы: ${formatMoney(summary.expenses_total || 0)} ₴</div>
          <hr style="border-color:#1f2937;">
          <div><b>Валовая прибыль: ${formatMoney(summary.gross_profit || 0)} ₴</b></div>
          <div><b>Чистая прибыль: ${formatMoney(summary.net_profit || 0)} ₴</b></div>
        `)}

        <h3 style="margin:12px 0;">Расходы</h3>
        ${expenses.length
          ? expenses.map((x) => `
              ${card(`
                <div style="font-weight:700;">${escapeHtml(x.category || "")}</div>
                <div>${formatMoney(x.amount || 0)} ${currencySymbol(x.currency || "USD")}</div>
                <div style="font-size:12px; opacity:0.7;">${escapeHtml(x.note || "")}</div>
              `)}
            `).join("")
          : card("Расходов пока нет")}
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
window.openCreateInventoryItem = openCreateInventoryItem;
window.createInventoryItem = createInventoryItem;
window.openCreateClient = openCreateClient;
window.createClient = createClient;
window.openCreateExpense = openCreateExpense;
window.createExpense = createExpense;
window.openModal = openModal;
window.closeModal = closeModal;

document.addEventListener("DOMContentLoaded", initApp);
