const tg = window.Telegram?.WebApp || null;

const API_URL = "https://hbciwqgfccdfnzrhiops.supabase.co/functions/v1/smart-handler";

const state = {
  user: null,
  currentTab: "dashboard",

  orders: [],
  clients: [],
  inventory: [],

  orderSearch: "",
  orderStatus: "all",

  inventorySearch: "",
  inventoryCategory: "all",

  editingOrderId: null,
  editingClientId: null,
  editingInventoryId: null,
};

document.addEventListener("DOMContentLoaded", initApp);

// ==============================
// INIT
// ==============================

async function initApp() {
  try {
    if (tg) {
      tg.expand();
      tg.ready();
      tg.setHeaderColor("#0f172a");
      tg.setBackgroundColor("#0b1120");
    }

    bindGlobalEvents();
    setupTabs();
    setActiveTab(state.currentTab);
    fillDefaultDates();

    await bootstrap();
  } catch (err) {
    console.error("INIT ERROR:", err);
    safeAlert("Ошибка запуска приложения");
  }
}

async function bootstrap() {
  showGlobalLoader(true);

  try {
    const initData = tg?.initData || "";

    if (!initData) {
      console.warn("Telegram initData is empty");
    }

    const auth = await api("auth", { initData }, true);

    if (auth?.ok) {
      state.user = auth.user || null;
      renderUserInfo();
    } else {
      throw new Error(auth?.error || "Auth failed");
    }

    await loadAllData();
  } catch (err) {
    console.error("BOOTSTRAP ERROR:", err);
    safeAlert(err.message || "Ошибка авторизации");
  } finally {
    showGlobalLoader(false);
  }
}

// ==============================
// API
// ==============================

async function api(action, payload = {}, useInitData = false) {
  const body = {
    action,
    ...payload,
  };

  if (useInitData && tg?.initData) {
    body.initData = tg.initData;
  } else if (tg?.initData && !body.initData) {
    body.initData = tg.initData;
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { ok: false, error: text || "Некорректный ответ сервера" };
  }

  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }

  return data;
}

// ==============================
// LOADERS
// ==============================

async function loadAllData() {
  await Promise.all([
    loadOrders(),
    loadClients(),
    loadInventory(),
  ]);

  renderAll();
}

async function loadOrders() {
  const data = await api("list_orders");
  state.orders = Array.isArray(data.items) ? data.items : [];
}

async function loadClients() {
  const data = await api("list_clients");
  state.clients = Array.isArray(data.items) ? data.items : [];
}

async function loadInventory() {
  const data = await api("list_inventory");
  state.inventory = Array.isArray(data.items) ? data.items : [];
}

// ==============================
// EVENTS
// ==============================

function bindGlobalEvents() {
  // Tabs
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      setActiveTab(tab);
    });
  });

  // Orders search/filter
  const orderSearch = $("#orderSearch");
  const orderStatus = $("#orderStatusFilter");

  if (orderSearch) {
    orderSearch.addEventListener("input", (e) => {
      state.orderSearch = e.target.value.trim().toLowerCase();
      renderOrders();
    });
  }

  if (orderStatus) {
    orderStatus.addEventListener("change", (e) => {
      state.orderStatus = e.target.value || "all";
      renderOrders();
    });
  }

  // Inventory search/filter
  const inventorySearch = $("#inventorySearch");
  const inventoryCategory = $("#inventoryCategoryFilter");

  if (inventorySearch) {
    inventorySearch.addEventListener("input", (e) => {
      state.inventorySearch = e.target.value.trim().toLowerCase();
      renderInventory();
    });
  }

  if (inventoryCategory) {
    inventoryCategory.addEventListener("change", (e) => {
      state.inventoryCategory = e.target.value || "all";
      renderInventory();
    });
  }

  // Forms
  $("#orderForm")?.addEventListener("submit", handleOrderSubmit);
  $("#clientForm")?.addEventListener("submit", handleClientSubmit);
  $("#inventoryForm")?.addEventListener("submit", handleInventorySubmit);

  // Cancel edit buttons
  $("#cancelOrderEdit")?.addEventListener("click", resetOrderForm);
  $("#cancelClientEdit")?.addEventListener("click", resetClientForm);
  $("#cancelInventoryEdit")?.addEventListener("click", resetInventoryForm);

  // Delegation: Orders
  $("#ordersList")?.addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-action='edit-order']");
    const deleteBtn = e.target.closest("[data-action='delete-order']");

    if (editBtn) {
      const id = editBtn.dataset.id;
      startEditOrder(id);
      return;
    }

    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      await deleteOrder(id);
    }
  });

  // Delegation: Clients
  $("#clientsList")?.addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-action='edit-client']");
    const deleteBtn = e.target.closest("[data-action='delete-client']");

    if (editBtn) {
      const id = editBtn.dataset.id;
      startEditClient(id);
      return;
    }

    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      await deleteClient(id);
    }
  });

  // Delegation: Inventory
  $("#inventoryList")?.addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-action='edit-inventory']");
    const deleteBtn = e.target.closest("[data-action='delete-inventory']");

    if (editBtn) {
      const id = editBtn.dataset.id;
      startEditInventory(id);
      return;
    }

    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      await deleteInventory(id);
    }
  });
}

function setupTabs() {
  document.querySelectorAll(".tab-content").forEach((el) => {
    el.style.display = "none";
  });
}

function setActiveTab(tab) {
  state.currentTab = tab || "dashboard";

  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === state.currentTab);
  });

  document.querySelectorAll(".tab-content").forEach((el) => {
    const match = el.dataset.tabContent === state.currentTab;
    el.style.display = match ? "block" : "none";
  });
}

// ==============================
// ORDERS
// ==============================

async function handleOrderSubmit(e) {
  e.preventDefault();

  const form = e.currentTarget;
  const submitBtn = form.querySelector("button[type='submit']");

  const payload = {
    client_name: val("#orderClientName"),
    car_model: val("#orderCarModel"),
    services: val("#orderServices"),
    amount: num("#orderAmount"),
    currency: val("#orderCurrency") || "UAH",
    status: val("#orderStatus") || "new",
    day: val("#orderDay"),
    comment: val("#orderComment"),
  };

  if (!payload.client_name || !payload.car_model) {
    safeAlert("Заполни имя клиента и машину");
    return;
  }

  toggleButtonLoading(submitBtn, true);

  try {
    if (state.editingOrderId) {
      await api("update_order", {
        id: state.editingOrderId,
        ...payload,
      });
      safeHaptic("success");
      safeAlert("Заказ обновлён");
    } else {
      await api("create_order", payload);
      safeHaptic("success");
      safeAlert("Заказ добавлен");
    }

    resetOrderForm();
    await loadOrders();
    renderOrders();
    renderDashboard();
  } catch (err) {
    console.error("ORDER SUBMIT ERROR:", err);
    safeAlert(err.message || "Ошибка сохранения заказа");
  } finally {
    toggleButtonLoading(submitBtn, false);
  }
}

function startEditOrder(id) {
  const item = state.orders.find((x) => String(x.id) === String(id));
  if (!item) return;

  state.editingOrderId = item.id;

  setVal("#orderClientName", item.client_name);
  setVal("#orderCarModel", item.car_model);
  setVal("#orderServices", item.services);
  setVal("#orderAmount", item.amount);
  setVal("#orderCurrency", item.currency || "UAH");
  setVal("#orderStatus", item.status || "new");
  setVal("#orderDay", normalizeDateForInput(item.day));
  setVal("#orderComment", item.comment);

  $("#cancelOrderEdit")?.classList.remove("hidden");
  $("#orderSubmitText") && ($("#orderSubmitText").textContent = "Сохранить");

  scrollToElement("#orderFormCard");
}

async function deleteOrder(id) {
  const ok = confirm("Удалить заказ?");
  if (!ok) return;

  try {
    await api("delete_order", { id });
    state.orders = state.orders.filter((x) => String(x.id) !== String(id));
    renderOrders();
    renderDashboard();
    safeHaptic("success");
  } catch (err) {
    console.error("DELETE ORDER ERROR:", err);
    safeAlert(err.message || "Ошибка удаления заказа");
  }
}

function resetOrderForm() {
  state.editingOrderId = null;
  $("#orderForm")?.reset();
  fillDefaultDates();
  $("#cancelOrderEdit")?.classList.add("hidden");
  $("#orderSubmitText") && ($("#orderSubmitText").textContent = "Добавить");
}

function getFilteredOrders() {
  return [...state.orders]
    .filter((item) => {
      const search = state.orderSearch;
      if (!search) return true;

      const text = [
        item.client_name,
        item.car_model,
        item.services,
        item.comment,
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(search);
    })
    .filter((item) => {
      if (state.orderStatus === "all") return true;
      return String(item.status || "").toLowerCase() === state.orderStatus.toLowerCase();
    })
    .sort((a, b) => {
      const da = new Date(a.day || 0).getTime();
      const db = new Date(b.day || 0).getTime();
      return db - da;
    });
}

// ==============================
// CLIENTS
// ==============================

async function handleClientSubmit(e) {
  e.preventDefault();

  const form = e.currentTarget;
  const submitBtn = form.querySelector("button[type='submit']");

  const payload = {
    name: val("#clientName"),
    phone: val("#clientPhone"),
    telegram_id: val("#clientTelegram"),
    note: val("#clientNote"),
  };

  if (!payload.name) {
    safeAlert("Введите имя клиента");
    return;
  }

  toggleButtonLoading(submitBtn, true);

  try {
    if (state.editingClientId) {
      await api("update_client", {
        id: state.editingClientId,
        ...payload,
      });
      safeAlert("Клиент обновлён");
    } else {
      await api("create_client", payload);
      safeAlert("Клиент добавлен");
    }

    resetClientForm();
    await loadClients();
    renderClients();
    renderDashboard();
    fillClientsDatalist();
    safeHaptic("success");
  } catch (err) {
    console.error("CLIENT SUBMIT ERROR:", err);
    safeAlert(err.message || "Ошибка сохранения клиента");
  } finally {
    toggleButtonLoading(submitBtn, false);
  }
}

function startEditClient(id) {
  const item = state.clients.find((x) => String(x.id) === String(id));
  if (!item) return;

  state.editingClientId = item.id;

  setVal("#clientName", item.name);
  setVal("#clientPhone", item.phone);
  setVal("#clientTelegram", item.telegram_id);
  setVal("#clientNote", item.note);

  $("#cancelClientEdit")?.classList.remove("hidden");
  $("#clientSubmitText") && ($("#clientSubmitText").textContent = "Сохранить");

  scrollToElement("#clientFormCard");
}

async function deleteClient(id) {
  const ok = confirm("Удалить клиента?");
  if (!ok) return;

  try {
    await api("delete_client", { id });
    state.clients = state.clients.filter((x) => String(x.id) !== String(id));
    renderClients();
    renderDashboard();
    fillClientsDatalist();
    safeHaptic("success");
  } catch (err) {
    console.error("DELETE CLIENT ERROR:", err);
    safeAlert(err.message || "Ошибка удаления клиента");
  }
}

function resetClientForm() {
  state.editingClientId = null;
  $("#clientForm")?.reset();
  $("#cancelClientEdit")?.classList.add("hidden");
  $("#clientSubmitText") && ($("#clientSubmitText").textContent = "Добавить");
}

// ==============================
// INVENTORY
// ==============================

async function handleInventorySubmit(e) {
  e.preventDefault();

  const form = e.currentTarget;
  const submitBtn = form.querySelector("button[type='submit']");

  const payload = {
    category: val("#inventoryCategory") || "other",
    brand: val("#inventoryBrand"),
    name: val("#inventoryName"),
    code: val("#inventoryCode"),
    quantity: num("#inventoryQuantity"),
    unit: val("#inventoryUnit") || "м",
    purchase_price: num("#inventoryPurchasePrice"),
    retail_price: num("#inventoryRetailPrice"),
    currency: val("#inventoryCurrency") || "UAH",
    comment: val("#inventoryComment"),
  };

  if (!payload.name) {
    safeAlert("Введите название товара");
    return;
  }

  toggleButtonLoading(submitBtn, true);

  try {
    if (state.editingInventoryId) {
      await api("update_inventory", {
        id: state.editingInventoryId,
        ...payload,
      });
      safeAlert("Товар обновлён");
    } else {
      await api("create_inventory", payload);
      safeAlert("Товар добавлен");
    }

    resetInventoryForm();
    await loadInventory();
    renderInventory();
    renderDashboard();
    safeHaptic("success");
  } catch (err) {
    console.error("INVENTORY SUBMIT ERROR:", err);
    safeAlert(err.message || "Ошибка сохранения товара");
  } finally {
    toggleButtonLoading(submitBtn, false);
  }
}

function startEditInventory(id) {
  const item = state.inventory.find((x) => String(x.id) === String(id));
  if (!item) return;

  state.editingInventoryId = item.id;

  setVal("#inventoryCategory", item.category || "other");
  setVal("#inventoryBrand", item.brand);
  setVal("#inventoryName", item.name);
  setVal("#inventoryCode", item.code);
  setVal("#inventoryQuantity", item.quantity);
  setVal("#inventoryUnit", item.unit || "м");
  setVal("#inventoryPurchasePrice", item.purchase_price);
  setVal("#inventoryRetailPrice", item.retail_price);
  setVal("#inventoryCurrency", item.currency || "UAH");
  setVal("#inventoryComment", item.comment);

  $("#cancelInventoryEdit")?.classList.remove("hidden");
  $("#inventorySubmitText") && ($("#inventorySubmitText").textContent = "Сохранить");

  scrollToElement("#inventoryFormCard");
}

async function deleteInventory(id) {
  const ok = confirm("Удалить товар?");
  if (!ok) return;

  try {
    await api("delete_inventory", { id });
    state.inventory = state.inventory.filter((x) => String(x.id) !== String(id));
    renderInventory();
    renderDashboard();
    safeHaptic("success");
  } catch (err) {
    console.error("DELETE INVENTORY ERROR:", err);
    safeAlert(err.message || "Ошибка удаления товара");
  }
}

function resetInventoryForm() {
  state.editingInventoryId = null;
  $("#inventoryForm")?.reset();
  setVal("#inventoryCurrency", "UAH");
  setVal("#inventoryUnit", "м");
  $("#cancelInventoryEdit")?.classList.add("hidden");
  $("#inventorySubmitText") && ($("#inventorySubmitText").textContent = "Добавить");
}

function getFilteredInventory() {
  return [...state.inventory]
    .filter((item) => {
      const search = state.inventorySearch;
      if (!search) return true;

      const text = [
        item.brand,
        item.name,
        item.code,
        item.category,
        item.comment,
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(search);
    })
    .filter((item) => {
      if (state.inventoryCategory === "all") return true;
      return String(item.category || "").toLowerCase() === state.inventoryCategory.toLowerCase();
    })
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ru"));
}

// ==============================
// RENDER
// ==============================

function renderAll() {
  fillClientsDatalist();
  renderUserInfo();
  renderDashboard();
  renderOrders();
  renderClients();
  renderInventory();
}

function renderUserInfo() {
  const el = $("#userInfo");
  if (!el) return;

  const user = state.user || {};
  const name =
    user.first_name ||
    user.username ||
    "Пользователь";

  el.textContent = `👋 ${name}`;
}

function renderDashboard() {
  const totalOrders = state.orders.length;
  const activeOrders = state.orders.filter((x) => !["done", "completed", "closed"].includes(String(x.status || "").toLowerCase())).length;
  const totalClients = state.clients.length;
  const totalInventory = state.inventory.length;

  setText("#statTotalOrders", String(totalOrders));
  setText("#statActiveOrders", String(activeOrders));
  setText("#statTotalClients", String(totalClients));
  setText("#statInventoryItems", String(totalInventory));

  const recentBox = $("#recentOrders");
  if (!recentBox) return;

  const recent = [...state.orders]
    .sort((a, b) => new Date(b.day || 0) - new Date(a.day || 0))
    .slice(0, 5);

  if (!recent.length) {
    recentBox.innerHTML = `<div class="empty-state">Пока нет заказов</div>`;
    return;
  }

  recentBox.innerHTML = recent
    .map((item) => {
      return `
        <div class="list-row">
          <div class="list-row-main">
            <div class="list-row-title">${escapeHtml(item.client_name || "Без клиента")}</div>
            <div class="list-row-sub">${escapeHtml(item.car_model || "-")} · ${escapeHtml(item.services || "-")}</div>
          </div>
          <div class="list-row-side">
            <div class="badge-status status-${safeStatusClass(item.status)}">${escapeHtml(item.status || "new")}</div>
            <div class="list-row-date">${formatDate(item.day)}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderOrders() {
  const box = $("#ordersList");
  if (!box) return;

  const items = getFilteredOrders();

  if (!items.length) {
    box.innerHTML = `<div class="empty-state">Заказов не найдено</div>`;
    return;
  }

  box.innerHTML = items
    .map((item) => {
      return `
        <div class="item-card">
          <div class="item-head">
            <div>
              <div class="item-title">${escapeHtml(item.client_name || "Без клиента")}</div>
              <div class="item-subtitle">${escapeHtml(item.car_model || "-")}</div>
            </div>
            <div class="badge-status status-${safeStatusClass(item.status)}">${escapeHtml(item.status || "new")}</div>
          </div>

          <div class="item-body">
            <div class="item-line"><b>Услуги:</b> ${escapeHtml(item.services || "-")}</div>
            <div class="item-line"><b>Сумма:</b> ${formatMoney(item.amount, item.currency)}</div>
            <div class="item-line"><b>Дата:</b> ${formatDate(item.day)}</div>
            ${item.comment ? `<div class="item-line"><b>Комментарий:</b> ${escapeHtml(item.comment)}</div>` : ""}
          </div>

          <div class="item-actions">
            <button class="action-btn edit-btn" data-action="edit-order" data-id="${escapeHtml(item.id)}">Редактировать</button>
            <button class="action-btn delete-btn" data-action="delete-order" data-id="${escapeHtml(item.id)}">Удалить</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderClients() {
  const box = $("#clientsList");
  if (!box) return;

  const items = [...state.clients].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), "ru")
  );

  if (!items.length) {
    box.innerHTML = `<div class="empty-state">Клиентов пока нет</div>`;
    return;
  }

  box.innerHTML = items
    .map((item) => {
      return `
        <div class="item-card">
          <div class="item-head">
            <div>
              <div class="item-title">${escapeHtml(item.name || "-")}</div>
              <div class="item-subtitle">${escapeHtml(item.phone || "Без телефона")}</div>
            </div>
          </div>

          <div class="item-body">
            ${item.telegram_id ? `<div class="item-line"><b>Telegram ID:</b> ${escapeHtml(item.telegram_id)}</div>` : ""}
            ${item.note ? `<div class="item-line"><b>Заметка:</b> ${escapeHtml(item.note)}</div>` : ""}
          </div>

          <div class="item-actions">
            <button class="action-btn edit-btn" data-action="edit-client" data-id="${escapeHtml(item.id)}">Редактировать</button>
            <button class="action-btn delete-btn" data-action="delete-client" data-id="${escapeHtml(item.id)}">Удалить</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderInventory() {
  const box = $("#inventoryList");
  if (!box) return;

  box.style.maxHeight = "70vh";
  box.style.overflowY = "auto";
  box.style.webkitOverflowScrolling = "touch";

  const items = getFilteredInventory();

  if (!items.length) {
    box.innerHTML = `<div class="empty-state">Товаров не найдено</div>`;
    return;
  }

  box.innerHTML = items
    .map((item) => {
      return `
        <div class="item-card">
          <div class="item-head">
            <div>
              <div class="item-title">${escapeHtml(item.name || "-")}</div>
              <div class="item-subtitle">${escapeHtml(item.brand || "-")} ${item.code ? "· " + escapeHtml(item.code) : ""}</div>
            </div>
            <div class="badge-status">${escapeHtml(item.category || "other")}</div>
          </div>

          <div class="item-body">
            <div class="item-line"><b>Количество:</b> ${escapeHtml(item.quantity ?? 0)} ${escapeHtml(item.unit || "")}</div>
            <div class="item-line"><b>Вход:</b> ${formatMoney(item.purchase_price, item.currency)}</div>
            <div class="item-line"><b>Розница:</b> ${formatMoney(item.retail_price, item.currency)}</div>
            ${item.comment ? `<div class="item-line"><b>Комментарий:</b> ${escapeHtml(item.comment)}</div>` : ""}
          </div>

          <div class="item-actions">
            <button class="action-btn edit-btn" data-action="edit-inventory" data-id="${escapeHtml(item.id)}">Редактировать</button>
            <button class="action-btn delete-btn" data-action="delete-inventory" data-id="${escapeHtml(item.id)}">Удалить</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function fillClientsDatalist() {
  const list = $("#clientsDatalist");
  if (!list) return;

  list.innerHTML = state.clients
    .map((c) => `<option value="${escapeHtml(c.name || "")}"></option>`)
    .join("");
}

// ==============================
// HELPERS
// ==============================

function $(selector) {
  return document.querySelector(selector);
}

function setText(selector, text) {
  const el = $(selector);
  if (el) el.textContent = text;
}

function val(selector) {
  const el = $(selector);
  return el ? String(el.value || "").trim() : "";
}

function setVal(selector, value) {
  const el = $(selector);
  if (el) el.value = value ?? "";
}

function num(selector) {
  const raw = val(selector).replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value, currency = "UAH") {
  const n = Number(value || 0);
  const formatted = Number.isFinite(n)
    ? n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })
    : "0";

  if (currency === "USD") return `$${formatted}`;
  return `${formatted} грн`;
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return escapeHtml(String(dateStr));

  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function normalizeDateForInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fillDefaultDates() {
  const orderDay = $("#orderDay");
  if (orderDay && !orderDay.value) {
    orderDay.value = normalizeDateForInput(new Date());
  }
}

function showGlobalLoader(show) {
  const el = $("#globalLoader");
  if (!el) return;
  el.style.display = show ? "flex" : "none";
}

function toggleButtonLoading(btn, loading) {
  if (!btn) return;
  btn.disabled = !!loading;
  btn.dataset.prevText ??= btn.textContent || "";
  btn.textContent = loading ? "Сохраняю..." : btn.dataset.prevText;
}

function safeAlert(text) {
  if (tg?.showAlert) tg.showAlert(String(text));
  else alert(String(text));
}

function safeHaptic(type = "light") {
  try {
    if (!tg?.HapticFeedback) return;

    if (type === "success") {
      tg.HapticFeedback.notificationOccurred("success");
      return;
    }

    if (type === "error") {
      tg.HapticFeedback.notificationOccurred("error");
      return;
    }

    tg.HapticFeedback.impactOccurred("light");
  } catch (e) {
    console.warn("HAPTIC ERROR:", e);
  }
}

function scrollToElement(selector) {
  const el = $(selector);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function safeStatusClass(status = "") {
  const s = String(status || "").trim().toLowerCase();

  if (["new", "новый"].includes(s)) return "new";
  if (["in_progress", "progress", "work", "в работе"].includes(s)) return "in-progress";
  if (["done", "completed", "finish", "готово"].includes(s)) return "done";
  if (["cancelled", "canceled", "отмена"].includes(s)) return "cancelled";

  return s.replace(/[^a-z0-9-_]/g, "") || "default";
}