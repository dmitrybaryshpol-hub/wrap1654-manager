const tg = window.Telegram?.WebApp || null;
const API_URL = "https://hbciwqgfccdfnzrhiops.supabase.co/functions/v1/smart-handler";

const state = {
  user: null,
  currentTab: "dashboard",
  orders: [],
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
  return cur === "USD" ? "$" : "₴";
}

function safeAlert(text) {
  if (tg?.showAlert) tg.showAlert(String(text));
  else alert(String(text));
}

async function api(action, data = {}) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, initData: tg?.initData || "", ...data }),
  });

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error("Invalid API response");
  }

  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || "API error");
  }

  return json;
}

function card(html) {
  return `<div style="background:#111827;border:1px solid #1f2937;border-radius:14px;padding:12px;margin-bottom:10px;">${html}</div>`;
}

function btn(text, onclick, extra = "") {
  return `<button onclick="${onclick}" style="padding:10px 12px;border-radius:10px;border:1px solid #374151;background:#1f2937;color:#fff;cursor:pointer;${extra}">${text}</button>`;
}

function renderBlockedScreen(title, text = "Открой приложение внутри Telegram") {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1120;color:#fff;font-family:Arial,sans-serif;padding:24px;text-align:center;">
      <div>
        <h2 style="margin:0 0 10px 0;">${escapeHtml(title)}</h2>
        <p style="margin:0;opacity:.8;">${escapeHtml(text)}</p>
      </div>
    </div>
  `;
}

function renderLayout() {
  document.body.innerHTML = `
    <div style="padding-bottom:80px;color:#fff;background:#0b1120;min-height:100vh;font-family:Arial,sans-serif;">
      <div style="padding:16px 16px 8px 16px;">
        <div style="font-size:20px;font-weight:700;">Wrap 1654 CRM</div>
        <div style="font-size:12px;opacity:0.7;">${escapeHtml(state.user?.first_name || state.user?.username || "User")}</div>
      </div>
      <div id="dashboard" class="tab"></div>
      <div id="orders" class="tab" style="display:none"></div>
      <div id="inventory" class="tab" style="display:none"></div>
      <div id="finance" class="tab" style="display:none"></div>
    </div>
    <div style="position:fixed;left:0;right:0;bottom:0;display:flex;gap:8px;padding:10px;background:#111827;border-top:1px solid #1f2937;z-index:20;">
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
    if (!auth?.user) throw new Error("Unauthorized");

    state.user = auth.user;
    renderLayout();
    showTab("dashboard");
  } catch (e) {
    console.error(e);
    renderBlockedScreen("Ошибка авторизации", "У вас нет доступа");
  }
}

function showTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll(".tab").forEach((el) => (el.style.display = "none"));
  const current = document.getElementById(tab);
  if (current) current.style.display = "block";

  if (tab === "dashboard") loadDashboard();
  if (tab === "orders") loadOrders();
  if (tab === "inventory") loadPlaceholder("inventory", "Склад скоро верну");
  if (tab === "finance") loadPlaceholder("finance", "Финансы скоро верну");
}

function loadPlaceholder(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<div style="padding:16px;">${escapeHtml(text)}</div>`;
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
        ${card(`<div style="font-weight:700;margin-bottom:8px;">💰 Финансы</div><div>Выручка: ${formatMoney(f.orders_revenue || 0)} ₴</div><div>Расходы: ${formatMoney(f.expenses_total || 0)} ₴</div><hr style="border-color:#1f2937;"><div><b>Чистая прибыль: ${formatMoney(f.net_profit || 0)} ₴</b></div>`) }
        ${card(`<div style="font-weight:700;margin-bottom:8px;">📊 Статистика</div><div>Активных заказов: ${stats.active_count || 0}</div><div>В работе: ${stats.total_in_work || 0}</div><div>Долги: ${formatMoney(stats.total_debt || 0)} ₴</div>`) }
        <div style="display:flex;gap:8px;flex-wrap:wrap;">${btn("+ Заказ", "openCreateOrder()")}</div>
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
    state.orders = Array.isArray(res.items) ? res.items : [];
    el.innerHTML = `
      <div style="padding:16px;">
        <div style="display:flex;gap:8px;margin-bottom:14px;">${btn("+ Новый заказ", "openCreateOrder()")}</div>
        ${state.orders.length ? state.orders.map((o) => card(`
          <div style="font-weight:700;">${escapeHtml(o.order_number || `Заказ ${String(o.id).slice(0, 8)}`)}</div>
          <div>${escapeHtml(o.status || "")}</div>
          <div>${formatMoney(o.total || 0)} ${currencySymbol(o.currency || "UAH")}</div>
          <div style="font-size:13px;opacity:0.7;">Клиент: ${escapeHtml(o.client_name || "—")}</div>
          <div style="font-size:13px;opacity:0.7;">Авто: ${escapeHtml(o.car_model || "—")}</div>
          <div style="font-size:13px;opacity:0.7;">Оплачено: ${formatMoney(o.paid || 0)} ${currencySymbol(o.currency || "UAH")} | Долг: ${formatMoney(o.due || 0)} ${currencySymbol(o.currency || "UAH")}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
            ${btn("Открыть", `openOrder('${o.id}')`)}
            ${btn("Удалить", `handleDeleteOrder('${o.id}')`, "background:rgba(239,68,68,.15);color:#fecaca;border-color:rgba(239,68,68,.35);")}
          </div>
        `)).join("") : card("Заказов пока нет")}
      </div>
    `;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div style="padding:16px;">Ошибка загрузки заказов</div>`;
  }
}

function recalcOrderForm() {
  const total = asNumber(document.getElementById("total")?.value, 0);
  const material = asNumber(document.getElementById("material_cost")?.value, 0);
  const labor = asNumber(document.getElementById("labor_cost")?.value, 0);
  const other = asNumber(document.getElementById("other_cost")?.value, 0);
  const prepaid = asNumber(document.getElementById("prepaid")?.value, 0);
  const paidEl = document.getElementById("paid");
  let paid = asNumber(paidEl?.value, 0);
  if (prepaid > paid) {
    paid = prepaid;
    if (paidEl) paidEl.value = String(prepaid);
  }
  const totalCost = material + labor + other;
  const profit = total - totalCost;
  const due = Math.max(total - paid, 0);
  const totalCostEl = document.getElementById("total_cost");
  const profitEl = document.getElementById("profit");
  const dueEl = document.getElementById("due");
  if (totalCostEl) totalCostEl.value = String(totalCost);
  if (profitEl) profitEl.value = String(profit);
  if (dueEl) dueEl.value = String(due);
}

function bindOrderFormRecalc() {
  ["total", "material_cost", "labor_cost", "other_cost", "prepaid", "paid"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", recalcOrderForm);
    el.addEventListener("change", recalcOrderForm);
  });
}

function setPaidPreset(percent) {
  const total = asNumber(document.getElementById("total")?.value, 0);
  const value = Math.round((total * percent) / 100 * 100) / 100;
  const prepaidEl = document.getElementById("prepaid");
  const paidEl = document.getElementById("paid");
  if (prepaidEl) prepaidEl.value = String(value);
  if (paidEl) paidEl.value = String(value);
  recalcOrderForm();
}

function openCreateOrder() {
  openModal(`
    <h3 style="margin-top:0;">Новый заказ</h3>
    <input id="client_name" placeholder="Имя клиента" style="width:100%;margin-bottom:8px;">
    <input id="car_model" placeholder="Модель авто" style="width:100%;margin-bottom:8px;">
    <select id="order_status" style="width:100%;margin-bottom:8px;">
      <option value="new">new</option>
      <option value="in_progress">in_progress</option>
      <option value="done">done</option>
    </select>
    <select id="currency" style="width:100%;margin-bottom:8px;">
      <option value="UAH">UAH ₴</option>
      <option value="USD">USD $</option>
    </select>
    <input id="total" type="number" value="0" placeholder="Сумма заказа" style="width:100%;margin-bottom:8px;">
    <div style="background:#020617;padding:12px;border-radius:12px;margin-bottom:14px;border:1px solid #1f2937;">
      <div style="font-weight:600;margin-bottom:10px;">🧾 Себестоимость</div>
      <input id="material_cost" type="number" value="0" placeholder="Материалы" style="width:100%;margin-bottom:8px;">
      <input id="labor_cost" type="number" value="0" placeholder="Работа" style="width:100%;margin-bottom:8px;">
      <input id="other_cost" type="number" value="0" placeholder="Прочее" style="width:100%;margin-bottom:8px;">
      <input id="total_cost" readonly placeholder="Итого себестоимость" style="width:100%;margin-bottom:8px;">
      <input id="profit" readonly placeholder="Прибыль" style="width:100%;">
    </div>
    <div style="background:#020617;padding:12px;border-radius:12px;margin-bottom:14px;border:1px solid #1f2937;">
      <div style="font-weight:600;margin-bottom:10px;">💳 Оплата</div>
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        ${btn("0%", "setPaidPreset(0)", "flex:1;")}
        ${btn("50%", "setPaidPreset(50)", "flex:1;")}
        ${btn("100%", "setPaidPreset(100)", "flex:1;")}
      </div>
      <input id="prepaid" type="number" value="0" placeholder="Предоплата" style="width:100%;margin-bottom:8px;">
      <input id="paid" type="number" value="0" placeholder="Оплачено" style="width:100%;margin-bottom:8px;">
      <input id="due" readonly placeholder="Долг" style="width:100%;">
    </div>
    <textarea id="order_note" placeholder="Комментарий" style="width:100%;min-height:80px;margin-bottom:12px;"></textarea>
    ${btn("Создать заказ", "createOrder()", "width:100%;background:#2563eb;")}
  `);
  bindOrderFormRecalc();
  recalcOrderForm();
}

async function createOrder() {
  const client_name = document.getElementById("client_name")?.value.trim() || null;
  const car_model = document.getElementById("car_model")?.value.trim() || null;
  const status = document.getElementById("order_status")?.value || "new";
  const currency = document.getElementById("currency")?.value || "UAH";
  const total = asNumber(document.getElementById("total")?.value, 0);
  const material_cost = asNumber(document.getElementById("material_cost")?.value, 0);
  const labor_cost = asNumber(document.getElementById("labor_cost")?.value, 0);
  const other_cost = asNumber(document.getElementById("other_cost")?.value, 0);
  const total_cost = asNumber(document.getElementById("total_cost")?.value, 0);
  const profit = asNumber(document.getElementById("profit")?.value, 0);
  const prepaid = asNumber(document.getElementById("prepaid")?.value, 0);
  const paid = asNumber(document.getElementById("paid")?.value, 0);
  const due = asNumber(document.getElementById("due")?.value, 0);
  const note = document.getElementById("order_note")?.value.trim() || null;

  if (!client_name) return safeAlert("Укажи имя клиента");
  if (!car_model) return safeAlert("Укажи модель авто");
  if (!total || total <= 0) return safeAlert("Укажи сумму заказа");

  const submitButton = document.querySelector('#modal button[onclick="createOrder()"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Сохранение...";
    submitButton.style.opacity = "0.7";
  }

  try {
    await api("create_order", {
      client_name,
      car_model,
      type: "combined",
      status,
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
    });
    closeModal();
    await loadOrders();
    loadDashboard();
    safeAlert("Заказ создан");
  } catch (e) {
    console.error(e);
    safeAlert(e.message || "Ошибка сохранения заказа");
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Создать заказ";
      submitButton.style.opacity = "1";
    }
  }
}

async function openOrder(id) {
  try {
    const res = await api("get_order", { id });
    const order = res.item || {};
    openModal(`
      <h3 style="margin-top:0;">${escapeHtml(order.order_number || `Заказ ${String(order.id || "").slice(0, 8)}`)}</h3>
      <p>Статус: ${escapeHtml(order.status || "")}</p>
      <p>Клиент: ${escapeHtml(order.client_name || "—")}</p>
      <p>Авто: ${escapeHtml(order.car_model || "—")}</p>
      <p>Сумма: ${formatMoney(order.total || 0)} ${currencySymbol(order.currency || "UAH")}</p>
      <p>Оплачено: ${formatMoney(order.paid || 0)} ${currencySymbol(order.currency || "UAH")}</p>
      <p>Долг: ${formatMoney(order.due || 0)} ${currencySymbol(order.currency || "UAH")}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;">
        ${btn("+ Оплата", `addPayment('${id}')`)}
        ${btn("Удалить", `handleDeleteOrder('${id}')`, "background:rgba(239,68,68,.15);color:#fecaca;border-color:rgba(239,68,68,.35);")}
      </div>
    `);
  } catch (e) {
    console.error(e);
    safeAlert("Не удалось открыть заказ");
  }
}

async function addPayment(order_id) {
  const amount = prompt("Сумма");
  if (!amount) return;
  try {
    const res = await api("get_order", { id: order_id });
    const order = res.item || {};
    await api("add_payment", { order_id, amount: Number(amount), currency: order.currency || "UAH" });
    closeModal();
    await loadOrders();
    loadDashboard();
    safeAlert("Оплата добавлена");
  } catch (e) {
    console.error(e);
    safeAlert("Ошибка добавления оплаты");
  }
}

async function handleDeleteOrder(orderId) {
  if (!confirm("Удалить этот заказ?")) return;
  try {
    await api("delete_order", { id: orderId });
    closeModal();
    await loadOrders();
    loadDashboard();
    safeAlert("Заказ удалён");
  } catch (e) {
    console.error(e);
    safeAlert("Ошибка удаления заказа");
  }
}

function openModal(html) {
  const modal = document.getElementById("modal");
  if (!modal) return;
  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:flex-end;justify-content:center;z-index:9999;">
      <div style="width:100%;max-width:700px;max-height:85vh;overflow:auto;background:#0f172a;color:#fff;padding:16px;border-top-left-radius:18px;border-top-right-radius:18px;border:1px solid #1f2937;">
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

window.showTab = showTab;
window.openCreateOrder = openCreateOrder;
window.createOrder = createOrder;
window.setPaidPreset = setPaidPreset;
window.openOrder = openOrder;
window.addPayment = addPayment;
window.handleDeleteOrder = handleDeleteOrder;
window.closeModal = closeModal;

document.addEventListener("DOMContentLoaded", initApp);
