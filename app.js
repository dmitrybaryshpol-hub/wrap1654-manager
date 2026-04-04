const tg = window.Telegram?.WebApp || null;

const API_URL = "https://hbciwqgfccdfnzrhiops.supabase.co/functions/v1/smart-handler";
async function initApp() {
  try {
    // ❗ БЛОКИРОВКА ВНЕ TELEGRAM
    if (!tg || !tg.initData) {
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
            <h2>Доступ только через Telegram</h2>
            <p>Открой приложение из бота Wrap 1654 Manager</p>
          </div>
        </div>
      `;
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

   
   catch (e) {
    console.error("INIT ERROR:", e);

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
          <h2>Ошибка авторизации</h2>
          <p>У вас нет доступа</p>
        </div>
      </div>
    `;
  }
}    

  } catch (e) {
    console.error(e);
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
          <h2>Access denied</h2>
          <p>У вас нет доступа к приложению.</p>
        </div>
      </div>
    `;
  }
}
  
   
 catch (e) {
    console.error(e);
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
          <h2>Access denied</h2>
          <p>У вас нет доступа к приложению.</p>
        </div>
      </div>
    `;
  }
}

if (tg) {
  tg.expand();
  tg.ready();
  tg.setHeaderColor("#0f172a");
  tg.setBackgroundColor("#0b1120");
}

const state = {
  user: null,
  currentTab: "dashboard",
};

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeAlert(text) {
  if (tg?.showAlert) tg.showAlert(String(text));
  else alert(String(text));
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

  const json = await res.json();

  if (!res.ok || json?.ok === false) {
    console.error("API error:", json);
    safeAlert(json?.error || "Ошибка");
    throw new Error(json?.error || "API error");
  }

  return json;
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
  return escapeHtml(order?.order_number || (order?.id ? `Заказ ${String(order.id).slice(0, 8)}` : "Заказ"));
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
  el.innerHTML = `<div style="padding:16px;">Загрузка...</div>`;

  try {
    const data = await api("dashboard");
    const f = data.finance || {};
    const stats = data.stats || {};

    el.innerHTML = `
      <div style="padding:16px;">
        ${card(`
          <div style="font-weight:700; margin-bottom:8px;">💰 Финансы</div>
          <div>Выручка: ${(Number(f.orders_revenue || 0) + Number(f.sales_revenue || 0))}</div>
          <div>Расходы: ${f.expenses_total || 0}</div>
          <hr style="border-color:#1f2937;">
          <div><b>Чистая прибыль: ${f.net_profit || 0}</b></div>
        `)}

        ${card(`
          <div style="font-weight:700; margin-bottom:8px;">📊 Статистика</div>
          <div>Активных заказов: ${stats.active_count || 0}</div>
          <div>В работе: ${stats.total_in_work || 0}</div>
          <div>Долги: ${stats.total_debt || 0}</div>
          <div>Клиентов: ${data.clients_count || 0}</div>
          <div>Товаров: ${data.inventory_count || 0}</div>
        `)}

        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
          ${btn("+ Заказ", "openCreateOrder()")}
          ${btn("+ Клиент", "openCreateClient()")}
          ${btn("+ Продажа", "openCreateSale()")}
          ${btn("+ Расход", "openCreateExpense()")}
        </div>

        <h3 style="margin:12px 0;">📦 Активные заказы</h3>
        ${(data.active_orders || []).length
          ? data.active_orders.map((o) => `
              <div onclick="openOrder('${o.id}')" style="cursor:pointer;">
                ${card(`
                  <div style="font-weight:700;">${orderLabel(o)}</div>
                  <div style="font-size:14px; opacity:0.8;">Статус: ${escapeHtml(o.status || "")}</div>
                  <div style="font-size:14px; opacity:0.8;">Сумма: ${o.total || 0} ${escapeHtml(o.currency || "UAH")}</div>
                `)}
              </div>
            `).join("")
          : card("Нет активных заказов")}

        <h3 style="margin:12px 0;">💸 Долги</h3>
        ${(data.debts || []).length
          ? data.debts.map((d) => `
              ${card(`
                <div style="font-weight:700;">${orderLabel(d)}</div>
                <div>Долг: ${d.due || 0} ${escapeHtml(d.currency || "UAH")}</div>
              `)}
            `).join("")
          : card("Долгов нет")}

        <h3 style="margin:12px 0;">⚠️ Заканчивается</h3>
        ${(data.low_stock || []).length
          ? data.low_stock.map((i) => `
              ${card(`
                <b>${escapeHtml(i.name || "")}</b><br>
                Остаток: ${i.quantity}
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
  el.innerHTML = `<div style="padding:16px;">Загрузка...</div>`;

  try {
    const res = await api("get_orders");
    const orders = res.items || [];

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
                  <div>${o.total || 0} ${escapeHtml(o.currency || "UAH")}</div>
                  <div style="font-size:13px; opacity:0.7;">
                    Клиент: ${escapeHtml(o.client_name || "—")}
                  </div>
                  <div style="font-size:13px; opacity:0.7;">
                    Оплачено: ${o.paid || 0} | Долг: ${o.due || 0}
                  </div>
                `)}
              </div>
            `).join("")
          : card("Заказов пока нет")}
      </div>
    `;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div style="padding:16px;">Ошибка загрузки заказов</div>`;
  }
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
            Кол-во: ${m.quantity} ${escapeHtml(m.unit || "")} | Себестоимость: ${m.total_cost || 0}
          </div>
        </div>
      `).join("");
    }

    openModal(`
      <h3 style="margin-top:0;">${orderLabel(order)}</h3>
      <p>Статус: ${escapeHtml(order.status || "")}</p>
      <p>Сумма: ${order.total || 0} ${escapeHtml(order.currency || "UAH")}</p>
      <p>Оплачено: ${order.paid || 0}</p>
      <p>Долг: ${order.due || 0}</p>

      <div style="display:flex; gap:8px; flex-wrap:wrap; margin:12px 0;">
        ${btn("+ Оплата", `addPayment('${id}')`)}
        ${btn("+ Материал", `addMaterial('${id}')`)}
      </div>

      <hr style="border-color:#1f2937;">
      <h4>Материалы</h4>
      <div style="max-height:220px; overflow:auto;">${materialsHtml}</div>
    `);
  } catch (e) {
    console.error(e);
  }
}

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
      total,
      currency: "UAH",
    });

    closeModal();
    loadOrders();
    loadDashboard();
    safeAlert("Заказ создан");
  } catch (e) {
    console.error(e);
  }
}

async function addPayment(order_id) {
  const amount = prompt("Сумма");
  if (!amount) return;

  try {
    await api("add_payment", {
      order_id,
      amount: Number(amount),
      currency: "UAH",
    });

    safeAlert("Оплата добавлена");
    openOrder(order_id);
    loadOrders();
    loadDashboard();
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
              Остаток: ${i.quantity} | Резерв: ${i.reserved_quantity || 0} | Доступно: ${i.available_quantity ?? i.quantity}
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
  } catch (e) {
    console.error(e);
  }
}

async function loadInventory() {
  const el = document.getElementById("inventory");
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
                  <div style="font-size:13px; opacity:0.85;">Остаток: ${i.quantity}</div>
                  <div style="font-size:13px; opacity:0.85;">Резерв: ${i.reserved_quantity || 0}</div>
                  <div style="font-size:13px; opacity:0.85;">Доступно: ${i.available_quantity ?? i.quantity}</div>
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
      <p>Остаток: ${item.quantity}</p>
      <p>Резерв: ${item.reserved_quantity || 0}</p>
      <p>Доступно: ${item.available_quantity ?? item.quantity}</p>
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
        ${movements.length
          ? movements.map((m) => `
              <div style="border-bottom:1px solid #1f2937; padding:6px 0;">
                <div><b>${escapeHtml(m.movement_type || "")}</b> — ${m.quantity}</div>
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
    min_quantity: Number(document.getElementById("inv_min").value) || 0,
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
      purchase_price,
    });

    closeModal();
    loadInventory();
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
  } catch (e) {
    console.error(e);
  }
}

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
    const res = await api("create_sale", {
      client_id: client_id || null,
      comment,
      currency: "UAH",
    });

    closeModal();
    safeAlert(`Продажа создана: ${res.item?.sale_number || res.item?.id || ""}`);
  } catch (e) {
    console.error(e);
  }
}

function openCreateClient() {
  openModal(`
    <h3 style="margin-top:0;">Новый клиент</h3>
    <input id="client_name" placeholder="Имя" style="width:100%; margin-bottom:10px;">
    <input id="client_phone" placeholder="Телефон" style="width:100%; margin-bottom:10px;">
    <input id="client_instagram" placeholder="Instagram" style="width:100%; margin-bottom:10px;">
    <textarea id="client_note" placeholder="Заметка" style="width:100%; margin-bottom:10px;"></textarea>
    ${btn("Создать", "createClient()")}
  `);
}

async function createClient() {
  const full_name = document.getElementById("client_name").value.trim();
  const phone = document.getElementById("client_phone").value.trim();
  const instagram = document.getElementById("client_instagram").value.trim();
  const note = document.getElementById("client_note").value.trim();

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
  document.getElementById("modal").innerHTML = `
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
        ${expenses.length
          ? expenses.map((x) => `
              ${card(`
                <div style="font-weight:700;">${escapeHtml(x.category || "")}</div>
                <div>${x.amount || 0} ${escapeHtml(x.currency || "UAH")}</div>
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
    <input id="exp_currency" placeholder="Валюта (UAH / USD)" style="width:100%; margin-bottom:10px;">
    <input id="exp_supplier" placeholder="Поставщик" style="width:100%; margin-bottom:10px;">
    <textarea id="exp_note" placeholder="Заметка" style="width:100%; margin-bottom:10px;"></textarea>
    ${btn("Создать", "createExpense()")}
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
window.openCreateSale = openCreateSale;
window.createSale = createSale;
window.openCreateClient = openCreateClient;
window.createClient = createClient;
window.openCreateExpense = openCreateExpense;
window.createExpense = createExpense;
window.openModal = openModal;
window.closeModal = closeModal;

document.addEventListener("DOMContentLoaded", initApp);
