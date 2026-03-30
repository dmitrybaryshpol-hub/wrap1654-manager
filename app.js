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

  openModal(`
    <h3>${order.order_number}</h3>

    <p>Статус: ${order.status}</p>
    <p>Сумма: ${order.total}</p>

    <button onclick="addPayment('${id}')">+ Оплата</button>
    <button onclick="addMaterial('${id}')">+ Материал</button>
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
      <div onclick="openItem('${i.id}')">
        ${i.name} — ${i.quantity}
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
  const item_id = prompt("ID товара");
  const qty = prompt("Количество");

  await api("writeoff_inventory", {
    order_id,
    item_id,
    quantity: Number(qty)
  });

  tg.showAlert("Списано");
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
