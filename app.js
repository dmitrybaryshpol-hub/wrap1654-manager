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

async function loadFxRate() {
  try {
    const res = await api("get_fx_rate", { base: "USD", quote: "USD" });
    state.fxRate = asNumber(res.rate, 0);
    state.fxUpdatedAt = res.updated_at || null;
  } catch (e) {
    console.warn("FX rate unavailable:", e?.message || e);
    state.fxRate = 0;
    state.fxUpdatedAt = null;
  }
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
    await loadFxRate();
    renderLayout();
    showTab("dashboard");
  } catch (e) {
    console.error("INIT ERROR:", e);
    renderBlockedScreen("Ошибка авторизации", "У вас нет доступа");
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
    const f = data.finance || {};
    const stats = data.stats || {};

    el.innerHTML = `
      <div style="padding:16px;">
        ${card(`
          <div style="font-weight:700; margin-bottom:8px;">💰 Финансы</div>
          <div>Выручка по заказам: ${formatMoney(f.orders_revenue || 0)} ₴</div>
          <div>Расходы: ${formatMoney(f.expenses_total || 0)} ₴</div>
          <hr style="border-color:#1f2937;">
          <div><b>Чистая прибыль: ${formatMoney(f.net_profit || 0)} ₴</b></div>
          ${state.fxRate > 0 ? `<div style="font-size:12px; opacity:.7; margin-top:8px;">USD курс: ${formatMoney(state.fxRate)} ₴</div>` : ""}
        `)}

        ${card(`
          <div style="font-weight:700; margin-bottom:8px;">📊 Статистика</div>
          <div>Активных заказов: ${stats.active_count || 0}</div>
          <div>В работе: ${stats.total_in_work || 0}</div>
          <div>Долги: ${formatMoney(stats.total_debt || 0)} ₴</div>
          <div>Клиентов: ${data.clients_count || 0}</div>
          <div>Товаров: ${data.inventory_count || 0}</div>
        `)}

        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
          ${btn("+ Заказ", "openCreateOrder()")}
          ${btn("+ Клиент", "openCreateClient()")}
          ${btn("+ Расход", "openCreateExpense()")}
        </div>

        <h3 style="margin:12px 0;">📦 Активные заказы</h3>
        ${(data.active_orders || []).length
          ? data.active_orders.map((o) => `
              <div onclick="openOrder('${o.id}')" style="cursor:pointer;">
                ${card(`
                  <div style="font-weight:700;">${orderLabel(o)}</div>
                  <div style="font-size:14px; opacity:0.8;">Статус: ${escapeHtml(o.status || "")}</div>
                  <div style="font-size:14px; opacity:0.8;">Сумма: ${formatMoney(o.total || 0)} ${currencySymbol(o.currency || "USD")}</div>
                `)}
              </div>
            `).join("")
          : card("Нет активных заказов")}

        <h3 style="margin:12px 0;">💸 Долги</h3>
        ${(data.debts || []).length
          ? data.debts.map((d) => `
              ${card(`
                <div style="font-weight:700;">${orderLabel(d)}</div>
                <div>Долг: ${formatMoney(d.due || 0)} ${currencySymbol(d.currency || "USD")}</div>
              `)}
            `).join("")
          : card("Долгов нет")}

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
          <div><b>${escapeHtml(m.item_name || m.inventory_item_id || "Материал")}</b></div>
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
  ${btn("+ Материал", `addMaterial('${id}')`)}
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

function openCreateOrder(order = null) {
  const isEdit = !!order;

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
        <option value="service">service</option>
        <option value="sale">sale</option>
      </select>

      <select id="order_status" style="width:100%;">
        <option value="new">new</option>
        <option value="in_progress">in_progress</option>
        <option value="done">done</option>
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
      <div style="font-weight:600; margin-bottom:10px;">💰 Доход</div>

      <label style="font-size:12px; opacity:.6;">Subtotal</label>
      <input id="subtotal" type="number" value="0" style="width:100%; margin-bottom:8px;">

      <label style="font-size:12px; opacity:.6;">Скидка</label>
      <input id="discount" type="number" value="0" style="width:100%; margin-bottom:8px;">

      <label style="font-size:12px; opacity:.6;">Итог</label>
      <input id="total" type="number" value="0" style="width:100%;">
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
        <option value="USD">USD ₴</option>
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
    document.getElementById("subtotal").value = String(order.subtotal ?? 0);
    document.getElementById("discount").value = String(order.discount ?? 0);
    document.getElementById("total").value = String(order.total ?? 0);
    document.getElementById("material_cost").value = String(order.material_cost ?? 0);
    document.getElementById("labor_cost").value = String(order.labor_cost ?? 0);
    document.getElementById("other_cost").value = String(order.other_cost ?? 0);
    document.getElementById("prepaid").value = String(order.prepaid ?? 0);
    document.getElementById("paid").value = String(order.paid ?? 0);
    document.getElementById("currency").value = order.currency || "USD";
    document.getElementById("order_note").value = order.note || "";

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
  const client_id = document.getElementById("client_id")?.value || null;
  const client_name = document.getElementById("client_name")?.value.trim() || null;
  const car_model = document.getElementById("car_model")?.value.trim() || null;

  const type = document.getElementById("order_type")?.value || "combined";
  const status = document.getElementById("order_status")?.value || "new";

  const intake_date = document.getElementById("intake_date")?.value || null;
  const start_date = document.getElementById("start_date")?.value || null;
  const end_date = document.getElementById("end_date")?.value || null;

  const subtotal = asNumber(document.getElementById("subtotal")?.value, 0);
  const discount = asNumber(document.getElementById("discount")?.value, 0);
  const total = asNumber(document.getElementById("total")?.value, 0);

  const material_cost = asNumber(document.getElementById("material_cost")?.value, 0);
  const labor_cost = asNumber(document.getElementById("labor_cost")?.value, 0);
  const other_cost = asNumber(document.getElementById("other_cost")?.value, 0);

  const total_cost = asNumber(document.getElementById("total_cost")?.value, 0);
  const profit = asNumber(document.getElementById("profit")?.value, 0);

  const prepaid = asNumber(document.getElementById("prepaid")?.value, 0);
  const paid = asNumber(document.getElementById("paid")?.value, 0);
  const due = asNumber(document.getElementById("due")?.value, 0);

  const currency = document.getElementById("currency")?.value || "USD";
  const note = document.getElementById("order_note")?.value.trim() || null;

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
      media_urls, media_url: media_urls[0] || null,
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

async function addMaterial(order_id) {
  try {
    const res = await api("get_inventory");
    const items = res.items || [];

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
        ${items.map((i) => `
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
              Остаток: ${formatMoney(i.quantity)}
              | Резерв: ${formatMoney(i.reserved_quantity || 0)}
              | Доступно: ${formatMoney(i.available_quantity ?? i.quantity)}
              | Цена: ${formatMoney(i.purchase_price || 0)} ${currencySymbol(i.currency || "USD")}
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

  document.querySelectorAll(".material-row").forEach((row) => {
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
    await api("writeoff_inventory", {
      order_id,
      item_id,
      quantity: qty,
    });

    safeAlert("Материал списан");
    closeModal();
    openOrder(order_id);
    loadInventory();
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

    el.innerHTML = `
      <div style="padding:16px;">
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
          ${btn("+ Приход", "openAddStock()")}
          ${btn("+ Товар", "openCreateInventoryItem()")}
        </div>

        ${items.length
          ? items.map((i) => `
              <div onclick="openItem('${i.id}')" style="cursor:pointer;">
                ${card(`
                  <div style="font-weight:700;">${escapeHtml(i.name || "")}</div>
                  <div style="font-size:13px; opacity:0.85;">Остаток: ${formatMoney(i.quantity)}</div>
                  <div style="font-size:13px; opacity:0.85;">Резерв: ${formatMoney(i.reserved_quantity || 0)}</div>
                  <div style="font-size:13px; opacity:0.85;">Доступно: ${formatMoney(i.available_quantity ?? i.quantity)}</div>
                  <div style="font-size:13px; opacity:0.85;">Мин. остаток: ${formatMoney(i.min_quantity || 0)}</div>
                  <div style="font-size:13px; opacity:0.85;">Вход: ${formatMoney(i.purchase_price || 0)} ${currencySymbol(i.currency || "USD")}</div>
                  <div style="font-size:13px; opacity:0.85;">Розница: ${formatMoney(i.retail_price || 0)} ${currencySymbol(i.currency || "USD")}</div>
                `)}
              </div>
            `).join("")
          : card("Склад пуст")}
      </div>
    `;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div style="padding:16px;">Ошибка загрузки склада</div>`;
  }
}

async function openItem(id) {
  try {
    const itemRes = await api("get_inventory_item", { id });
    const movementsRes = await api("get_inventory_movements", { item_id: id });

    const item = itemRes.item;
    const movements = movementsRes.items || [];

    openModal(`
      <h3 style="margin-top:0;">${escapeHtml(item.name || "")}</h3>
      <p>Остаток: ${formatMoney(item.quantity)}</p>
      <p>Резерв: ${formatMoney(item.reserved_quantity || 0)}</p>
      <p>Доступно: ${formatMoney(item.available_quantity ?? item.quantity)}</p>
      <p>Мин. остаток: ${formatMoney(item.min_quantity || 0)}</p>
      <p>Вход: ${formatMoney(item.purchase_price || 0)} ${currencySymbol(item.currency || "USD")}</p>
      <p>Розница: ${formatMoney(item.retail_price || 0)} ${currencySymbol(item.currency || "USD")}</p>

      <div style="display:flex; gap:8px; flex-wrap:wrap; margin:12px 0;">
        ${btn("🔒 Резерв", `reserveItem('${id}')`)}
        ${btn("🔓 Снять резерв", `unreserveItem('${id}')`)}
        ${btn("⚙️ Корректировка", `adjustItem('${id}')`)}
      </div>

      <hr style="border-color:#1f2937;">
      <h4>История</h4>
      <div style="max-height:220px; overflow:auto;">
        ${movements.length
          ? movements.map((m) => `
              <div style="border-bottom:1px solid #1f2937; padding:6px 0;">
                <div><b>${escapeHtml(m.movement_type || "")}</b> — ${formatMoney(m.quantity)}</div>
                <div style="font-size:12px; opacity:0.75;">
                  ${escapeHtml(m.comment || "")}
                </div>
              </div>
            `).join("")
          : `<div style="opacity:0.7;">Движений пока нет</div>`}
      </div>
    `);
  } catch (e) {
    console.error(e);
  }
}

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
    <select id="inv_currency" style="width:100%; margin-bottom:8px;">
      <option value="USD">USD ₴</option>
      <option value="USD">USD $</option>
    </select>
    <input id="inv_min" placeholder="Мин. остаток" type="number" step="0.1" style="width:100%; margin-bottom:8px;">
    ${btn("Создать", "createInventoryItem()")}
  `);
}

async function createInventoryItem() {
  const payload = {
    category: document.getElementById("inv_category")?.value.trim(),
    brand: document.getElementById("inv_brand")?.value.trim(),
    name: document.getElementById("inv_name")?.value.trim(),
    width_cm: Number(document.getElementById("inv_width")?.value) || null,
    unit: document.getElementById("inv_unit")?.value.trim() || "m",
    quantity: Number(document.getElementById("inv_quantity")?.value) || 0,
    purchase_price: Number(document.getElementById("inv_purchase")?.value) || 0,
    retail_price: Number(document.getElementById("inv_retail")?.value) || 0,
    currency: document.getElementById("inv_currency")?.value || "USD",
    min_quantity: Number(document.getElementById("inv_min")?.value) || 0,
  };

  if (!payload.category || !payload.name) {
    safeAlert("Заполни категорию и название");
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
  const item_id = document.getElementById("item_id")?.value.trim();
  const qty = Number(document.getElementById("qty")?.value);
  const purchase_price = Number(document.getElementById("purchase_price")?.value) || 0;

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
      purchase_price,
    });

    closeModal();
    loadInventory();
    loadDashboard();
    safeAlert("Приход добавлен");
  } catch (e) {
    console.error(e);
  }
}

async function reserveItem(id) {
  const qty = prompt("Сколько зарезервировать?");
  if (!qty) return;

  try {
    await api("reserve_inventory", {
      item_id: id,
      quantity: Number(qty),
      comment: "Резерв из приложения",
    });

    safeAlert("Зарезервировано");
    openItem(id);
    loadInventory();
    loadDashboard();
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
      comment: "Снятие резерва",
    });

    safeAlert("Резерв снят");
    openItem(id);
    loadInventory();
    loadDashboard();
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
      comment: "Корректировка",
    });

    safeAlert("Обновлено");
    openItem(id);
    loadInventory();
    loadDashboard();
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
      <option value="USD">USD ₴</option>
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
window.openOrder = openOrder;
window.addPayment = addPayment;
window.addMaterial = addMaterial;
window.selectMaterial = selectMaterial;
window.filterMaterialList = filterMaterialList;
window.submitMaterialToOrder = submitMaterialToOrder;
window.openAddStock = openAddStock;
window.addStock = addStock;
window.openCreateInventoryItem = openCreateInventoryItem;
window.createInventoryItem = createInventoryItem;
window.openItem = openItem;
window.reserveItem = reserveItem;
window.unreserveItem = unreserveItem;
window.adjustItem = adjustItem;
window.openCreateClient = openCreateClient;
window.createClient = createClient;
window.openCreateExpense = openCreateExpense;
window.createExpense = createExpense;
window.openModal = openModal;
window.closeModal = closeModal;

document.addEventListener("DOMContentLoaded", initApp);
