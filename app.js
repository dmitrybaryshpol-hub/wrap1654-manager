const tg = window.Telegram.WebApp;

const SUPABASE_URL = "https://hbciwqgfccdfnzrhiops.supabase.co";
const SUPABASE_KEY = "sb_publishable_nmVB1s_PXivfUNyoTaQWuQ_b5G_dYY9";

/*
  ВСТАВЬ СЮДА 3 РЕАЛЬНЫХ TELEGRAM ID
  Пример:
  const ALLOWED_TELEGRAM_IDS = [123456789, 987654321, 555555555];
*/
const tg = window.Telegram.WebApp;

const ALLOWED_TELEGRAM_IDS = [
  778403209,
  321760638,
  539387886
];

function showDenied() {
  document.getElementById("app-content").classList.add("hidden");
  document.getElementById("access-denied").classList.remove("hidden");
}

async function init() {
  const user = tg.initDataUnsafe?.user;
  const telegramId = user?.id;

  console.log("Telegram user:", user);
  console.log("Current telegram id:", telegramId);
  console.log("Allowed IDs:", ALLOWED_TELEGRAM_IDS);

  if (!telegramId || !ALLOWED_TELEGRAM_IDS.includes(telegramId)) {
    showDenied();
    return;
  }

  document.getElementById("access-denied").classList.add("hidden");
  document.getElementById("app-content").classList.remove("hidden");

  tg.expand();

  await loadData();
  renderCalendar();
  renderAll();
}


let allEvents = [];
let clients = [];
let storage = [];
let currentEditId = null;
let selectedDate = new Date().toISOString().split("T")[0];

function getHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: "Bearer " + SUPABASE_KEY,
    ...extra
  };
}

function safeAlert(message) {
  if (tg?.showAlert) tg.showAlert(message);
  else alert(message);
}

function haptic(type = "light") {
  try {
    tg?.HapticFeedback?.impactOccurred(type);
  } catch (_) {}
}

async function init() {
  if (!tg?.initDataUnsafe?.user?.id) {
    showDenied();
    return;
  }

  const telegramId = Number(tg.initDataUnsafe.user.id);
  if (!ALLOWED_TELEGRAM_IDS.includes(telegramId)) {
    showDenied();
    return;
  }

  document.getElementById("access-denied").classList.add("hidden");
  document.getElementById("app-content").classList.remove("hidden");

  try {
    tg.expand();
    tg.setHeaderColor?.("#0b0b0f");
    tg.setBackgroundColor?.("#0b0b0f");
  } catch (_) {}

  await loadData();
  renderCalendar();
  renderAll();
}

function showDenied() {
  document.getElementById("app-content").classList.add("hidden");
  document.getElementById("access-denied").classList.remove("hidden");
}

async function fetchTable(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=id.desc`, {
    headers: getHeaders()
  });
  if (!res.ok) return [];
  return await res.json();
}

async function loadData() {
  [allEvents, clients, storage] = await Promise.all([
    fetchTable("events"),
    fetchTable("clients"),
    fetchTable("storage")
  ]);
}

function renderAll() {
  renderEvents();
  renderClients();
  renderStorage();
  renderFilmsSelect();
  updateClientsDatalist();
  updateStats();
}

function renderCalendar() {
  const strip = document.getElementById("calendar-strip");
  if (!strip) return;

  strip.innerHTML = "";
  const dayNames = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

  for (let i = -2; i < 12; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);

    const iso = d.toISOString().split("T")[0];
    const card = document.createElement("button");
    card.className = `day-card ${iso === selectedDate ? "active" : ""}`;
    card.type = "button";
    card.onclick = () => {
      selectedDate = iso;
      renderCalendar();
      renderEvents();
      updateStats();
      haptic("light");
    };

    card.innerHTML = `
      <span class="day-name">${dayNames[d.getDay()]}</span>
      <span class="day-num">${d.getDate()}</span>
    `;
    strip.appendChild(card);
  }
}

function getStatusInfo(status) {
  switch (status) {
    case "in_progress":
      return { label: "В работе", cls: "status-in_progress" };
    case "done":
      return { label: "Готово", cls: "status-done" };
    default:
      return { label: "Новый", cls: "status-new" };
  }
}

function getSelectedDayEvents() {
  return allEvents.filter(e => {
    if (!e.start_date) return false;
    return String(e.start_date).startsWith(selectedDate);
  });
}

function updateStats() {
  const filtered = getSelectedDayEvents();

  const dayTotal = filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const profitDay = filtered.reduce((s, e) => s + (Number(e.profit) || 0), 0);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const weekTotal = allEvents
    .filter(e => e.start_date && new Date(e.start_date) > weekAgo)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  document.getElementById("money-day").innerText = `$${dayTotal}`;
  document.getElementById("profit-day").innerText = `$${profitDay}`;
  document.getElementById("money-week").innerText = `$${weekTotal}`;

  const cnt = filtered.length;
  document.getElementById("events-count").innerText =
    cnt === 1 ? "1 заказ" : `${cnt} заказ${cnt >= 2 && cnt <= 4 ? "а" : "ов"}`;
}

function renderEvents() {
  const container = document.getElementById("events");
  const filtered = getSelectedDayEvents();

  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state">На выбранный день записей нет</div>`;
    return;
  }

  container.innerHTML = filtered.map(e => {
    const st = getStatusInfo(e.status);
    const amount = Number(e.amount) || 0;
    const profit = Number(e.profit) || 0;
    const time = e.start_date ? String(e.start_date).split("T")[1]?.slice(0, 5) || "" : "";

    const mediaHtml = e.media_url
      ? `<img class="media-thumb" src="${e.media_url}" alt="media" />`
      : "";

    return `
      <div class="card order-card" onclick="editOrder(${e.id})">
        <div class="order-left">
          <b>${escapeHtml(e.car_model || "Без авто")}</b><br>
          <small>${escapeHtml(e.client_name || "Клиент")}</small><br>
          <span class="status-badge ${st.cls}">${st.label}</span>
          ${mediaHtml}
        </div>

        <div class="order-right">
          <div class="order-amount">$${amount}</div>
          <div class="order-profit ${profit >= 0 ? "profit" : "loss"}">${profit >= 0 ? "+" : ""}${profit}$</div>
          <div class="order-time">${time}</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderClients() {
  const list = document.getElementById("clients-list");

  if (!clients.length) {
    list.innerHTML = `<div class="empty-state">Клиентов пока нет</div>`;
    return;
  }

  list.innerHTML = clients.map(c => `
    <div class="card client-card" onclick="showHistory('${escapeJsString(c.name || "")}')">
      <div>
        <b>${escapeHtml(c.name || "Без имени")}</b><br>
        <small>${escapeHtml(c.phone || "")}</small>
      </div>
      <div class="client-arrow">→</div>
    </div>
  `).join("");
}

function renderStorage() {
  const films = storage.filter(s => s.type === "film");
  const prods = storage.filter(s => s.type !== "film");

  const filmList = document.getElementById("film-list");
  const productList = document.getElementById("product-list");

  filmList.innerHTML = films.length
    ? films.map(item => `
        <div class="card storage-card">
          <div class="storage-left">
            <b>${escapeHtml(item.name || "Плёнка")}</b>
          </div>
          <div class="storage-right">
            <div class="storage-qty">${Number(item.quantity || 0)} м</div>
            <div class="storage-price">$${Number(item.price_per_unit || 0)}/м</div>
          </div>
        </div>
      `).join("")
    : `<div class="empty-state">Плёнки пока нет</div>`;

  productList.innerHTML = prods.length
    ? prods.map(item => `
        <div class="card storage-card">
          <div class="storage-left">
            <b>${escapeHtml(item.name || "Товар")}</b>
          </div>
          <div class="storage-right">
            <div class="storage-qty">${Number(item.quantity || 0)} шт</div>
            <div class="storage-price">$${Number(item.price_per_unit || 0)}/шт</div>
          </div>
        </div>
      `).join("")
    : `<div class="empty-state">Товаров пока нет</div>`;
}

function renderFilmsSelect() {
  const select = document.getElementById("film-select");
  const films = storage.filter(s => s.type === "film");

  select.innerHTML = `<option value="">Без плёнки</option>` +
    films.map(f => `<option value="${escapeHtmlAttr(f.name || "")}">${escapeHtml(f.name || "")}</option>`).join("");
}

function updateClientsDatalist() {
  const dl = document.getElementById("clients-list-options");
  dl.innerHTML = clients.map(c => `<option value="${escapeHtmlAttr(c.name || "")}"></option>`).join("");
}

function showPage(page, el) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-" + page).classList.add("active");

  document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
  if (el) el.classList.add("active");

  haptic("light");
}

function openOrderModal() {
  resetOrderForm();
  document.getElementById("modal-order").classList.add("open");
  haptic("medium");
}

function openClientModal() {
  document.getElementById("modal-client").classList.add("open");
  haptic("medium");
}

function openStorageModal() {
  document.getElementById("modal-storage").classList.add("open");
  haptic("medium");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");

  if (id === "modal-order") {
    resetOrderForm();
  }

  if (id === "modal-client") {
    document.getElementById("client-name").value = "";
    document.getElementById("client-phone").value = "";
    document.getElementById("client-tg").value = "";
  }

  if (id === "modal-storage") {
    document.getElementById("storage-type").value = "film";
    document.getElementById("st-name").value = "";
    document.getElementById("st-qty").value = "";
    document.getElementById("st-price").value = "";
  }
}

function resetOrderForm() {
  currentEditId = null;

  document.getElementById("order-modal-title").innerText = "Новый заказ";
  document.getElementById("btn-delete-order").classList.add("hidden");

  document.getElementById("car-client").value = "";
  document.getElementById("car-model").value = "";
  document.getElementById("date-start").value = "";
  document.getElementById("date-end").value = "";
  document.getElementById("status").value = "new";
  document.getElementById("order-amount").value = "";
  document.getElementById("film-select").value = "";
  document.getElementById("film-qty").value = "0";
  document.getElementById("services").value = "";
  document.getElementById("media").value = "";
  document.getElementById("preview").innerHTML = "";
}

function previewMedia(event) {
  const file = event.target.files?.[0];
  const preview = document.getElementById("preview");
  preview.innerHTML = "";

  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    const isVideo = file.type.startsWith("video/");
    const el = document.createElement(isVideo ? "video" : "img");
    if (isVideo) el.controls = true;
    el.src = e.target.result;
    preview.appendChild(el);
  };
  reader.readAsDataURL(file);
}

async function uploadFile(file) {
  const fileName = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/cars/${fileName}`, {
    method: "POST",
    headers: getHeaders({
      "Content-Type": file.type,
      "x-upsert": "false"
    }),
    body: file
  });

  if (!res.ok) {
    throw new Error("Не удалось загрузить файл");
  }

  return `${SUPABASE_URL}/storage/v1/object/public/cars/${fileName}`;
}

async function submitOrder() {
  const clientName = document.getElementById("car-client").value.trim();
  const carModel = document.getElementById("car-model").value.trim();
  const amount = parseInt(document.getElementById("order-amount").value, 10) || 0;
  const startDate = document.getElementById("date-start").value || null;
  const endDate = document.getElementById("date-end").value || null;
  const status = document.getElementById("status").value;
  const filmName = document.getElementById("film-select").value;
  const filmQty = parseFloat(document.getElementById("film-qty").value) || 0;
  const services = document.getElementById("services").value.trim();

  if (!clientName) return safeAlert("Введите имя клиента");
  if (!carModel) return safeAlert("Введите авто");
  if (!startDate) return safeAlert("Укажи дату начала");

  let mediaUrl = null;
  const file = document.getElementById("media").files?.[0];

  try {
    if (file) {
      mediaUrl = await uploadFile(file);
    }

    // автосоздание клиента
    if (!clients.some(c => String(c.name).toLowerCase() === clientName.toLowerCase())) {
      await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
        method: "POST",
        headers: getHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name: clientName
        })
      });
    }

    // себестоимость
    let cost = 0;
    const selectedFilm = storage.find(s => s.type === "film" && s.name === filmName);
    if (selectedFilm && filmQty > 0) {
      cost = (Number(selectedFilm.price_per_unit) || 0) * filmQty;
    }

    const profit = amount - cost;

    // списание плёнки только при создании нового заказа
    if (!currentEditId && selectedFilm && filmQty > 0) {
      const newQty = (Number(selectedFilm.quantity) || 0) - filmQty;

      await fetch(`${SUPABASE_URL}/rest/v1/storage?id=eq.${selectedFilm.id}`, {
        method: "PATCH",
        headers: getHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          quantity: newQty
        })
      });
    }

    const oldEvent = currentEditId ? allEvents.find(x => x.id === currentEditId) : null;

    const payload = {
      client_name: clientName,
      car_model: carModel,
      amount,
      cost,
      profit,
      start_date: startDate,
      end_date: endDate,
      status,
      film_used: filmName || null,
      film_amount: filmQty || 0,
      services,
      media_url: mediaUrl || oldEvent?.media_url || null
    };

    const method = currentEditId ? "PATCH" : "POST";
    const url = currentEditId
      ? `${SUPABASE_URL}/rest/v1/events?id=eq.${currentEditId}`
      : `${SUPABASE_URL}/rest/v1/events`;

    const res = await fetch(url, {
      method,
      headers: getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || "Ошибка сохранения заказа");
    }

    closeModal("modal-order");
    await loadData();
    renderAll();
    haptic("medium");
  } catch (err) {
    safeAlert(err.message || "Не удалось сохранить заказ");
  }
}

function editOrder(id) {
  const e = allEvents.find(x => x.id === id);
  if (!e) return;

  currentEditId = id;

  document.getElementById("order-modal-title").innerText = "Редактирование заказа";
  document.getElementById("btn-delete-order").classList.remove("hidden");

  document.getElementById("car-client").value = e.client_name || "";
  document.getElementById("car-model").value = e.car_model || "";
  document.getElementById("date-start").value = e.start_date ? String(e.start_date).slice(0, 16) : "";
  document.getElementById("date-end").value = e.end_date ? String(e.end_date).slice(0, 16) : "";
  document.getElementById("status").value = e.status || "new";
  document.getElementById("order-amount").value = e.amount || "";
  document.getElementById("film-select").value = e.film_used || "";
  document.getElementById("film-qty").value = e.film_amount || 0;
  document.getElementById("services").value = e.services || "";

  const preview = document.getElementById("preview");
  preview.innerHTML = e.media_url ? `<img src="${e.media_url}" alt="preview" />` : "";

  document.getElementById("modal-order").classList.add("open");
  haptic("medium");
}

async function deleteOrder() {
  if (!currentEditId) return;

  const ok = confirm("Удалить заказ?");
  if (!ok) return;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${currentEditId}`, {
      method: "DELETE",
      headers: getHeaders()
    });

    if (!res.ok) throw new Error("Не удалось удалить заказ");

    closeModal("modal-order");
    await loadData();
    renderAll();
    haptic("medium");
  } catch (err) {
    safeAlert(err.message || "Ошибка удаления");
  }
}

async function submitClient() {
  const name = document.getElementById("client-name").value.trim();
  const phone = document.getElementById("client-phone").value.trim();
  const telegramId = document.getElementById("client-tg").value.trim();

  if (!name) return safeAlert("Введите имя клиента");

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
      method: "POST",
      headers: getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name,
        phone,
        telegram_id: telegramId || null
      })
    });

    if (!res.ok) throw new Error("Не удалось сохранить клиента");

    closeModal("modal-client");
    await loadData();
    renderAll();
    haptic("medium");
  } catch (err) {
    safeAlert(err.message || "Ошибка сохранения клиента");
  }
}

async function submitStorage() {
  const type = document.getElementById("storage-type").value;
  const name = document.getElementById("st-name").value.trim();
  const quantity = parseFloat(document.getElementById("st-qty").value) || 0;
  const pricePerUnit = parseFloat(document.getElementById("st-price").value) || 0;

  if (!name) return safeAlert("Введите название материала");

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/storage`, {
      method: "POST",
      headers: getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        type,
        name,
        quantity,
        price_per_unit: pricePerUnit
      })
    });

    if (!res.ok) throw new Error("Не удалось добавить материал");

    closeModal("modal-storage");
    await loadData();
    renderAll();
    haptic("medium");
  } catch (err) {
    safeAlert(err.message || "Ошибка добавления материала");
  }
}

function showHistory(name) {
  const history = allEvents.filter(e => e.client_name === name);

  document.getElementById("history-name").innerText = name;

  document.getElementById("history-list").innerHTML = history.length
    ? history.map(h => `
        <div class="history-item">
          <small>${h.start_date ? String(h.start_date).split("T")[0] : "Без даты"}</small><br>
          <b>${escapeHtml(h.car_model || "Без авто")}</b><br>
          <small>$${Number(h.amount || 0)} | прибыль: ${Number(h.profit || 0)}$</small>
        </div>
      `).join("")
    : `<div class="empty-state">Истории пока нет</div>`;

  document.getElementById("modal-client-history").classList.add("open");
  haptic("medium");
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeHtmlAttr(str) {
  return escapeHtml(str).replaceAll("`", "");
}

function escapeJsString(str) {
  return String(str).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

init();
