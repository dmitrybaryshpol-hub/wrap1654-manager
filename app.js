const tg = window.Telegram?.WebApp;

const SUPABASE_URL = "https://hbciwqgfccdfnzrhiops.supabase.co";
const SUPABASE_KEY = "sb_publishable_nmVB1s_PXivfUNyoTaQWuQ_b5G_dYY9";

let allEvents = [];
let clients = [];
let storage = [];
let currentEditId = null;
let selectedDate = new Date().toISOString().split("T")[0];
let currentTelegramUser = null;

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: "Bearer " + SUPABASE_KEY,
    ...extra
  };
}

function showDenied(extraText = "") {
  const appContent = document.getElementById("app-content");
  const denied = document.getElementById("access-denied");

  if (appContent) appContent.classList.add("hidden");
  if (denied) denied.classList.remove("hidden");

  const oldDebug = document.getElementById("debug-access");
  if (oldDebug) oldDebug.remove();

  if (extraText) {
    const box = document.querySelector(".denied-box");
    if (box) {
      const p = document.createElement("p");
      p.id = "debug-access";
      p.style.marginTop = "14px";
      p.style.fontSize = "12px";
      p.style.color = "#8a8a95";
      p.style.whiteSpace = "pre-line";
      p.textContent = extraText;
      box.appendChild(p);
    }
  }
}

function showApp() {
  const denied = document.getElementById("access-denied");
  const appContent = document.getElementById("app-content");

  if (denied) denied.classList.add("hidden");
  if (appContent) appContent.classList.remove("hidden");
}

function msg(text) {
  if (tg?.showAlert) tg.showAlert(text);
  else alert(text);
}

async function checkTelegramAccess() {
  if (!tg) {
    throw new Error("Приложение должно быть открыто внутри Telegram.");
  }

  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.("#0b0b0f");
    tg.setBackgroundColor?.("#0b0b0f");
  } catch (_) {}

  if (!tg.initData || typeof tg.initData !== "string" || !tg.initData.trim()) {
    throw new Error("Не найден Telegram initData. Открой приложение именно внутри Telegram.");
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/smart-handler`, {
    method: "POST",
    headers: headers({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({
      initData: tg.initData
    })
  });

  let result = null;

  try {
    result = await res.json();
  } catch (_) {
    throw new Error("Функция авторизации вернула некорректный ответ.");
  }

  if (!res.ok || !result?.ok) {
    throw new Error(result?.error || "Доступ запрещён.");
  }

  return result;
}

async function init() {
  try {
    const authResult = await checkTelegramAccess();

    currentTelegramUser = {
      telegram_id: authResult.telegram_id,
      name: authResult.name
    };

    console.log("Авторизация успешна:", authResult);

    showApp();
    await loadData();
    renderCalendar();
    renderAll();
  } catch (e) {
    console.error("Ошибка инициализации:", e);
    showDenied(`Ошибка запуска:\n${e?.message || "unknown error"}`);
  }
}

async function fetchTable(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=id.desc`, {
    headers: headers()
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Ошибка загрузки таблицы ${table}:`, text);
    return [];
  }

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
  const days = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

  for (let i = -2; i < 12; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);

    const iso = d.toISOString().split("T")[0];

    const card = document.createElement("button");
    card.className = `day-card ${iso === selectedDate ? "active" : ""}`;
    card.onclick = () => {
      selectedDate = iso;
      renderCalendar();
      renderEvents();
      updateStats();
    };

    card.innerHTML = `
      <span class="day-name">${days[d.getDay()]}</span>
      <span class="day-num">${d.getDate()}</span>
    `;

    strip.appendChild(card);
  }
}

function selectedEvents() {
  return allEvents.filter(e => e.start_date && String(e.start_date).startsWith(selectedDate));
}

function updateStats() {
  const filtered = selectedEvents();
  const dayTotal = filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const profitDay = filtered.reduce((s, e) => s + (Number(e.profit) || 0), 0);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const weekTotal = allEvents
    .filter(e => e.start_date && new Date(e.start_date) > weekAgo)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const moneyDay = document.getElementById("money-day");
  const profitDayEl = document.getElementById("profit-day");
  const moneyWeek = document.getElementById("money-week");
  const eventsCount = document.getElementById("events-count");

  if (moneyDay) moneyDay.innerText = `$${dayTotal}`;
  if (profitDayEl) profitDayEl.innerText = `$${profitDay}`;
  if (moneyWeek) moneyWeek.innerText = `$${weekTotal}`;

  const count = filtered.length;
  if (eventsCount) {
    eventsCount.innerText =
      count === 1 ? "1 заказ" : `${count} заказ${count >= 2 && count <= 4 ? "а" : "ов"}`;
  }
}

function statusInfo(status) {
  if (status === "in_progress") return ["В работе", "status-in_progress"];
  if (status === "done") return ["Готово", "status-done"];
  return ["Новый", "status-new"];
}

function renderEvents() {
  const container = document.getElementById("events");
  if (!container) return;

  const filtered = selectedEvents();

  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state">На выбранный день записей нет</div>`;
    return;
  }

  container.innerHTML = filtered.map(e => {
    const [label, cls] = statusInfo(e.status);
    const time = e.start_date ? String(e.start_date).split("T")[1]?.slice(0, 5) || "" : "";
    const amount = Number(e.amount) || 0;
    const profit = Number(e.profit) || 0;

    return `
      <div class="card order-card" onclick="editOrder(${e.id})">
        <div class="order-left">
          <b>${escapeHtml(e.car_model || "Без авто")}</b><br>
          <small>${escapeHtml(e.client_name || "Клиент")}</small><br>
          <span class="status-badge ${cls}">${label}</span>
          ${e.media_url ? `<img class="media-thumb" src="${e.media_url}" alt="media">` : ""}
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
  const el = document.getElementById("clients-list");
  if (!el) return;

  if (!clients.length) {
    el.innerHTML = `<div class="empty-state">Клиентов пока нет</div>`;
    return;
  }

  el.innerHTML = clients.map(c => `
    <div class="card client-card" onclick="showHistory('${escapeJs(c.name || "")}')">
      <div>
        <b>${escapeHtml(c.name || "Без имени")}</b><br>
        <small>${escapeHtml(c.phone || "")}</small>
      </div>
      <div class="client-arrow">→</div>
    </div>
  `).join("");
}

function renderStorage() {
  const filmList = document.getElementById("film-list");
  const productList = document.getElementById("product-list");
  if (!filmList || !productList) return;

  const films = storage.filter(s => s.type === "film");
  const prods = storage.filter(s => s.type !== "film");

  filmList.innerHTML = films.length
    ? films.map(s => `
      <div class="card storage-card">
        <div>
          <b>${escapeHtml(s.name || "Плёнка")}</b>
        </div>
        <div>
          <div class="storage-qty">${Number(s.quantity || 0)} м</div>
          <div class="storage-price">$${Number(s.price_per_unit || 0)}/м</div>
        </div>
      </div>
    `).join("")
    : `<div class="empty-state">Плёнки пока нет</div>`;

  productList.innerHTML = prods.length
    ? prods.map(s => `
      <div class="card storage-card">
        <div>
          <b>${escapeHtml(s.name || "Товар")}</b>
        </div>
        <div>
          <div class="storage-qty">${Number(s.quantity || 0)} шт</div>
          <div class="storage-price">$${Number(s.price_per_unit || 0)}/шт</div>
        </div>
      </div>
    `).join("")
    : `<div class="empty-state">Товаров пока нет</div>`;
}

function renderFilmsSelect() {
  const select = document.getElementById("film-select");
  if (!select) return;

  const films = storage.filter(s => s.type === "film");

  select.innerHTML = `<option value="">Без плёнки</option>` +
    films.map(f => `<option value="${escapeAttr(f.name || "")}">${escapeHtml(f.name || "")}</option>`).join("");
}

function updateClientsDatalist() {
  const dl = document.getElementById("clients-list-options");
  if (!dl) return;

  dl.innerHTML = clients.map(c => `<option value="${escapeAttr(c.name || "")}"></option>`).join("");
}

function showPage(page, el) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-" + page)?.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
  if (el) el.classList.add("active");
}

function openOrderModal() {
  resetOrderForm();
  document.getElementById("modal-order")?.classList.add("open");
}

function openClientModal() {
  document.getElementById("modal-client")?.classList.add("open");
}

function openStorageModal() {
  document.getElementById("modal-storage")?.classList.add("open");
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove("open");

  if (id === "modal-order") resetOrderForm();

  if (id === "modal-client") {
    const name = document.getElementById("client-name");
    const phone = document.getElementById("client-phone");
    const tgInput = document.getElementById("client-tg");
    if (name) name.value = "";
    if (phone) phone.value = "";
    if (tgInput) tgInput.value = "";
  }

  if (id === "modal-storage") {
    const type = document.getElementById("storage-type");
    const stName = document.getElementById("st-name");
    const stQty = document.getElementById("st-qty");
    const stPrice = document.getElementById("st-price");
    if (type) type.value = "film";
    if (stName) stName.value = "";
    if (stQty) stQty.value = "";
    if (stPrice) stPrice.value = "";
  }
}

function resetOrderForm() {
  currentEditId = null;

  const title = document.getElementById("order-modal-title");
  const delBtn = document.getElementById("btn-delete-order");
  const carClient = document.getElementById("car-client");
  const carModel = document.getElementById("car-model");
  const dateStart = document.getElementById("date-start");
  const dateEnd = document.getElementById("date-end");
  const status = document.getElementById("status");
  const amount = document.getElementById("order-amount");
  const filmSelect = document.getElementById("film-select");
  const filmQty = document.getElementById("film-qty");
  const services = document.getElementById("services");
  const media = document.getElementById("media");
  const preview = document.getElementById("preview");

  if (title) title.innerText = "Новый заказ";
  if (delBtn) delBtn.classList.add("hidden");
  if (carClient) carClient.value = "";
  if (carModel) carModel.value = "";
  if (dateStart) dateStart.value = "";
  if (dateEnd) dateEnd.value = "";
  if (status) status.value = "new";
  if (amount) amount.value = "";
  if (filmSelect) filmSelect.value = "";
  if (filmQty) filmQty.value = "0";
  if (services) services.value = "";
  if (media) media.value = "";
  if (preview) preview.innerHTML = "";
}

function previewMedia(event) {
  const file = event.target.files?.[0];
  const preview = document.getElementById("preview");
  if (!preview) return;

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
    headers: headers({
      "Content-Type": file.type,
      "x-upsert": "false"
    }),
    body: file
  });

  if (!res.ok) throw new Error("Ошибка загрузки файла");

  return `${SUPABASE_URL}/storage/v1/object/public/cars/${fileName}`;
}

async function submitOrder() {
  const clientName = document.getElementById("car-client")?.value.trim() || "";
  const carModel = document.getElementById("car-model")?.value.trim() || "";
  const amount = parseInt(document.getElementById("order-amount")?.value, 10) || 0;
  const startDate = document.getElementById("date-start")?.value || null;
  const endDate = document.getElementById("date-end")?.value || null;
  const status = document.getElementById("status")?.value || "new";
  const filmName = document.getElementById("film-select")?.value || "";
  const filmQty = parseFloat(document.getElementById("film-qty")?.value) || 0;
  const services = document.getElementById("services")?.value.trim() || "";

  if (!clientName) return msg("Введите имя клиента");
  if (!carModel) return msg("Введите авто");
  if (!startDate) return msg("Укажи дату начала");

  try {
    let mediaUrl = null;
    const file = document.getElementById("media")?.files?.[0];
    if (file) mediaUrl = await uploadFile(file);

    if (!clients.some(c => String(c.name).toLowerCase() === clientName.toLowerCase())) {
      await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
        method: "POST",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name: clientName, telegram_id: Number(currentTelegramUser.telegram_id) })
      });
    }

    let cost = 0;
    const film = storage.find(s => s.type === "film" && s.name === filmName);
    if (film && filmQty > 0) {
      cost = (Number(film.price_per_unit) || 0) * filmQty;
    }

    const profit = amount - cost;

    if (!currentEditId && film && filmQty > 0) {
      const newQty = (Number(film.quantity) || 0) - filmQty;
      await fetch(`${SUPABASE_URL}/rest/v1/storage?id=eq.${film.id}`, {
        method: "PATCH",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ quantity: newQty, telegram_id: Number(currentTelegramUser.telegram_id) })
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
      media_url: mediaUrl || oldEvent?.media_url || null,
      telegram_id: Number(currentTelegramUser.telegram_id)
    };

    const method = currentEditId ? "PATCH" : "POST";
    const url = currentEditId
      ? `${SUPABASE_URL}/rest/v1/events?id=eq.${currentEditId}`
      : `${SUPABASE_URL}/rest/v1/events`;

    const res = await fetch(url, {
      method,
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error("Не удалось сохранить заказ");

    closeModal("modal-order");
    await loadData();
    renderAll();
  } catch (e) {
    console.error(e);
    msg("Ошибка сохранения заказа");
  }
}

function editOrder(id) {
  const e = allEvents.find(x => x.id === id);
  if (!e) return;

  currentEditId = id;

  const title = document.getElementById("order-modal-title");
  const delBtn = document.getElementById("btn-delete-order");
  const carClient = document.getElementById("car-client");
  const carModel = document.getElementById("car-model");
  const dateStart = document.getElementById("date-start");
  const dateEnd = document.getElementById("date-end");
  const status = document.getElementById("status");
  const amount = document.getElementById("order-amount");
  const filmSelect = document.getElementById("film-select");
  const filmQty = document.getElementById("film-qty");
  const services = document.getElementById("services");
  const preview = document.getElementById("preview");

  if (title) title.innerText = "Правка заказа";
  if (delBtn) delBtn.classList.remove("hidden");
  if (carClient) carClient.value = e.client_name || "";
  if (carModel) carModel.value = e.car_model || "";
  if (dateStart) dateStart.value = e.start_date ? String(e.start_date).slice(0, 16) : "";
  if (dateEnd) dateEnd.value = e.end_date ? String(e.end_date).slice(0, 16) : "";
  if (status) status.value = e.status || "new";
  if (amount) amount.value = e.amount || "";
  if (filmSelect) filmSelect.value = e.film_used || "";
  if (filmQty) filmQty.value = e.film_amount || 0;
  if (services) services.value = e.services || "";
  if (preview) preview.innerHTML = e.media_url ? `<img src="${e.media_url}" alt="preview">` : "";

  document.getElementById("modal-order")?.classList.add("open");
}

async function deleteOrder() {
  if (!currentEditId) return;
  if (!confirm("Удалить заказ?")) return;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${currentEditId}`, {
      method: "DELETE",
      headers: headers()
    });

    if (!res.ok) throw new Error("Не удалось удалить");

    closeModal("modal-order");
    await loadData();
    renderAll();
  } catch (e) {
    console.error(e);
    msg("Ошибка удаления заказа");
  }
}

async function submitClient() {
  const name = document.getElementById("client-name")?.value.trim() || "";
  const phone = document.getElementById("client-phone")?.value.trim() || "";
  const telegramId = document.getElementById("client-tg")?.value.trim() || "";

  if (!name) return msg("Введите имя клиента");

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name,
        phone,
        telegram_id: telegramId ? Number(telegramId) : Number(currentTelegramUser.telegram_id)
      })
    });

    if (!res.ok) throw new Error("Не удалось сохранить клиента");

    closeModal("modal-client");
    await loadData();
    renderAll();
  } catch (e) {
    console.error(e);
    msg("Ошибка сохранения клиента");
  }
}

async function submitStorage() {
  const type = document.getElementById("storage-type")?.value || "film";
  const name = document.getElementById("st-name")?.value.trim() || "";
  const qty = parseFloat(document.getElementById("st-qty")?.value) || 0;
  const pricePerUnit = parseFloat(document.getElementById("st-price")?.value) || 0;

  if (!name) return msg("Введите название материала");

  if (!currentTelegramUser?.telegram_id) {
    console.error("currentTelegramUser:", currentTelegramUser);
    return msg("Не найден telegram_id текущего пользователя");
  }

  const payload = {
  type,
  name,
  quantity: qty,
  price_per_unit: pricePerUnit,
  telegram_id: Number(currentTelegramUser.telegram_id)
};
  
  console.log("submitStorage payload:", payload);

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/storage`, {
      method: "POST",
      headers: headers({
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      }),
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    console.log("submitStorage response status:", res.status);
    console.log("submitStorage response body:", text);

    if (!res.ok) {
      throw new Error(text || `HTTP ${res.status}`);
    }

    closeModal("modal-storage");
    await loadData();
    renderAll();
    msg("Материал добавлен");
  } catch (e) {
    console.error("submitStorage error:", e);
    msg(`Ошибка добавления материала:\n${e.message}`);
  }
}

function showHistory(name) {
  const history = allEvents.filter(e => e.client_name === name);

  const historyName = document.getElementById("history-name");
  const historyList = document.getElementById("history-list");

  if (historyName) historyName.innerText = name;

  if (historyList) {
    historyList.innerHTML = history.length
      ? history.map(h => `
        <div class="history-item">
          <small>${h.start_date ? String(h.start_date).split("T")[0] : "Без даты"}</small><br>
          <b>${escapeHtml(h.car_model || "Без авто")}</b><br>
          <small>$${Number(h.amount || 0)} | прибыль: ${Number(h.profit || 0)}$</small>
        </div>
      `).join("")
      : `<div class="empty-state">Истории пока нет</div>`;
  }

  document.getElementById("modal-client-history")?.classList.add("open");
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(str) {
  return escapeHtml(str).replaceAll("`", "");
}

function escapeJs(str) {
  return String(str).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

init();
