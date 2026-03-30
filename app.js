const tg = window.Telegram?.WebApp;

const API_URL = "https://hbciwqgfccdfnzrhiops.supabase.co/functions/v1/smart-handler";

// ==============================
// INIT
// ==============================

tg.expand();
tg.setHeaderColor("#0f172a");

const state = {
  user: null,
  currentTab: "dashboard"
};

// ==============================
// API (через Edge Function)
// ==============================

async function api(action, data = {}) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action,
      initData: tg.initData,
      ...data
    })
  });

  const json = await res.json();

  if (!res.ok) {
    console.error("API error:", json);
    tg.showAlert(json.error || "Ошибка");
    throw new Error(json.error);
  }

  return json;
}

// ==============================
// NAVIGATION
// ==============================

function showTab(tab) {
  state.currentTab = tab;

  document.querySelectorAll(".tab").forEach(el => el.style.display = "none");
  document.getElementById(tab).style.display = "block";

  if (tab === "dashboard") loadDashboard();
  if (tab === "orders") loadOrders();
  if (tab === "inventory") loadInventory();
}

// ==============================
// INIT APP
// ==============================

async function initApp() {
  try {
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
    <div id="app">

      <div id="dashboard" class="tab"></div>
      <div id="orders" class="tab" style="display:none"></div>
      <div id="inventory" class="tab" style="display:none"></div>

    </div>

    <div id="bottom-nav">
      <button onclick="showTab('dashboard')">Главная</button>
      <button onclick="showTab('orders')">Заказы</button>
      <button onclick="showTab('inventory')">Склад</button>
    </div>

    <div id="modal"></div>
  `;
}

// ==============================
// DASHBOARD
// ==============================

async function loadDashboard() {
  const el = document.getElementById("dashboard");

  el.innerHTML = "Загрузка...";

  const data = await api("dashboard");

  el.innerHTML = `
    <h2>Dashboard</h2>

    <button onclick="openCreateOrder()">+ Заказ</button>
    <button onclick="openCreateClient()">+ Клиент</button>
    <button onclick="openCreateSale()">+ Продажа</button>

    <h3>Активные заказы</h3>
    ${data.orders.map(o => `
      <div onclick="openOrder('${o.id}')">
        ${o.order_number} — ${o.status}
      </div>
    `).join("")}

    <h3>Долги</h3>
    ${data.debts.map(d => `
      <div>${d.order_number} — ${d.due}</div>
    `).join("")}
  `;
}

// ==============================
// ORDERS
// ==============================

async function loadOrders() {
  const el = document.getElementById("orders");

  el.innerHTML = "Загрузка...";

  const orders = await api("get_orders");

  el.innerHTML = `
    <h2>Заказы</h2>

    <button onclick="openCreateOrder()">+ Новый заказ</button>

    ${orders.map(o => `
      <div onclick="openOrder('${o.id}')">
        <b>${o.order_number}</b><br>
        ${o.status}<br>
        ${o.total} ${o.currency}
      </div>
    `).join("")}
  `;
}

// ==============================
// ORDER VIEW
// ==============================

async function openOrder(id) {
  const order = await api("get_order", { id });

  let materialsHtml = "";
  if (order.materials && order.materials.length) {
    materialsHtml = `
      <h4>Материалы</h4>
      ${order.materials.map(m => `
        <div style="border-bottom:1px solid #333; padding:6px 0;">
          ${m.item_name || m.inventory_item_id} — ${m.quantity}
        </div>
      `).join("")}
    `;
  }

  openModal(`
    <h3>${order.order_number}</h3>

    <p>Статус: ${order.status}</p>
    <p>Сумма: ${order.total}</p>
    <p>Оплачено: ${order.paid || 0}</p>
    <p>Долг: ${order.due || 0}</p>

    <button onclick="addPayment('${id}')">+ Оплата</button>
    <button onclick="addMaterial('${id}')">+ Материал</button>

    <hr>
    ${materialsHtml}
  `);
}
// ==============================
// INVENTORY
// ==============================

async function loadInventory() {
  const el = document.getElementById("inventory");

  el.innerHTML = "Загрузка...";

  const items = await api("get_inventory");

  el.innerHTML = `
    <h2>Склад</h2>

    <button onclick="openAddStock()">+ Приход</button>

    ${items.map(i => `
  <div onclick="openItem('${i.id}')" style="padding:10px; border-bottom:1px solid #333;">
    <b>${i.name}</b><br>
    Остаток: ${i.quantity}<br>
    Резерв: ${i.reserved_quantity}<br>
    Доступно: ${i.available_quantity}
  </div>
`).join("")}
  `;
}

// ==============================
// MODAL
// ==============================

function openModal(html) {
  document.getElementById("modal").innerHTML = `
    <div class="modal">
      ${html}
      <br><br>
      <button onclick="closeModal()">Закрыть</button>
    </div>
  `;
}

function closeModal() {
  document.getElementById("modal").innerHTML = "";
}

// ==============================
// CREATE ORDER
// ==============================

function openCreateOrder() {
  openModal(`
    <h3>Новый заказ</h3>

    <input id="client" placeholder="Client ID"><br>
    <input id="total" placeholder="Сумма"><br>

    <button onclick="createOrder()">Создать</button>
  `);
}

async function createOrder() {
  const client_id = document.getElementById("client").value;
  const total = Number(document.getElementById("total").value);

  await api("create_order", {
    client_id,
    total
  });

  closeModal();
  loadOrders();
}

// ==============================
// ADD PAYMENT
// ==============================

async function addPayment(order_id) {
  const amount = prompt("Сумма");

  await api("add_payment", {
    order_id,
    amount: Number(amount)
  });

  tg.showAlert("Оплата добавлена");
}

// ==============================
// ADD MATERIAL
// ==============================

async function addMaterial(order_id) {
  const items = await api("get_inventory");

  openModal(`
    <h3>Добавить материал в заказ</h3>

    <input id="material-search" placeholder="Поиск товара" oninput="filterMaterialList()" style="width:100%; margin-bottom:10px;">

    <input type="hidden" id="selected_item_id">
    <div id="selected_item_name" style="margin-bottom:10px; color:#aaa;">Товар не выбран</div>

    <input id="material_qty" placeholder="Количество" type="number" step="0.1" style="width:100%; margin-bottom:10px;">

    <div id="material-list" style="max-height:220px; overflow:auto; border:1px solid #333; padding:6px; border-radius:8px;">
      ${items.map(i => `
        <div 
          class="material-row"
          data-name="${(i.name || "").toLowerCase()}"
          onclick="selectMaterial('${i.id}', \`${escapeHtml(i.name)}\`)"
          style="padding:8px; border-bottom:1px solid #333; cursor:pointer;"
        >
          <b>${escapeHtml(i.name)}</b><br>
          Остаток: ${i.quantity} | Резерв: ${i.reserved_quantity} | Доступно: ${i.available_quantity}
        </div>
      `).join("")}
    </div>

    <br>
    <button onclick="submitMaterialToOrder('${order_id}')">Списать в заказ</button>
  `);
}
function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function selectMaterial(id, name) {
  document.getElementById("selected_item_id").value = id;
  document.getElementById("selected_item_name").innerHTML = `Выбрано: <b>${name}</b>`;
}

function filterMaterialList() {
  const q = document.getElementById("material-search").value.trim().toLowerCase();
  document.querySelectorAll(".material-row").forEach(row => {
    const name = row.dataset.name || "";
    row.style.display = name.includes(q) ? "block" : "none";
  });
}

async function submitMaterialToOrder(order_id) {
  const item_id = document.getElementById("selected_item_id").value;
  const qty = Number(document.getElementById("material_qty").value);

  if (!item_id) {
    tg.showAlert("Сначала выбери товар");
    return;
  }

  if (!qty || qty <= 0) {
    tg.showAlert("Укажи корректное количество");
    return;
  }

  try {
    await api("writeoff_reserved_inventory", {
      order_id,
      item_id,
      quantity: qty
    });

    tg.showAlert("Материал списан");
    closeModal();
    openOrder(order_id);
    loadInventory();
  } catch (e) {
    console.error(e);
  }
}
// ==============================
// ADD STOCK
// ==============================

function openAddStock() {
  openModal(`
    <h3>Приход</h3>

    <input id="item_id" placeholder="ID товара"><br>
    <input id="qty" placeholder="Количество"><br>

    <button onclick="addStock()">Добавить</button>
  `);
}

// ==============================
// INVENTORY ITEM (карточка товара)
// ==============================

async function openItem(id) {
  const item = await api("get_inventory_item", { id });
  const movements = await api("get_inventory_movements", { item_id: id });

  openModal(`
    <h3>${item.name}</h3>

    <p>Остаток: ${item.quantity}</p>
    <p>Резерв: ${item.reserved_quantity}</p>
    <p>Доступно: ${item.available_quantity}</p>

    <p>Вход: ${item.purchase_price}</p>
    <p>Розница: ${item.retail_price}</p>

    <br>

    <button onclick="reserveItem('${id}')">🔒 Резерв</button>
    <button onclick="unreserveItem('${id}')">🔓 Снять резерв</button>
    <button onclick="adjustItem('${id}')">⚙️ Корректировка</button>

    <hr>

    <h4>История</h4>

    <div style="max-height:200px; overflow:auto;">
      ${movements.map(m => `
        <div style="border-bottom:1px solid #333; padding:5px;">
          ${m.movement_type} — ${m.quantity}
        </div>
      `).join("")}
    </div>
  `);
}
// ==============================
// RESERVE
// ==============================

async function reserveItem(id) {
  const qty = prompt("Сколько зарезервировать?");

  await api("reserve_inventory", {
    item_id: id,
    quantity: Number(qty),
    comment: "Резерв из приложения"
  });

  tg.showAlert("Зарезервировано");
  loadInventory();
}

// ==============================
// UNRESERVE
// ==============================

async function unreserveItem(id) {
  const qty = prompt("Сколько снять с резерва?");

  await api("unreserve_inventory", {
    item_id: id,
    quantity: Number(qty),
    comment: "Снятие резерва"
  });

  tg.showAlert("Резерв снят");
  loadInventory();
}

// ==============================
// ADJUST
// ==============================

async function adjustItem(id) {
  const qty = prompt("Изменение (+ или -)");

  await api("adjust_inventory", {
    item_id: id,
    quantity_delta: Number(qty),
    comment: "Корректировка"
  });

  tg.showAlert("Обновлено");
  loadInventory();
}

async function addStock() {
  const item_id = document.getElementById("item_id").value;
  const qty = Number(document.getElementById("qty").value);

  await api("add_stock", {
    item_id,
    quantity: qty
  });

  closeModal();
  loadInventory();
}
