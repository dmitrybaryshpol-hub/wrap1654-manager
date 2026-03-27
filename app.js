const tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand();
  tg.ready();
  try {
    tg.setHeaderColor("#0f172a");
  } catch (e) {}
}

const SUPABASE_URL = "https://hbciwqgfccdfnzrhiops.supabase.co";
const SUPABASE_KEY = "sb_publishable_nmVB1s_PXivfUNyoTaQWuQ_b5G_dYY9";

// если у тебя уже есть свой initData — оставь как есть
const TELEGRAM_INIT_DATA = tg?.initData || "";

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: "Bearer " + SUPABASE_KEY,
    ...extra
  };
}

function haptic(type = "success") {
  try {
    tg?.HapticFeedback?.notificationOccurred(type);
  } catch (e) {}
}

function showAlert(text) {
  if (tg?.showAlert) tg.showAlert(text);
  else alert(text);
}

function qs(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let currentStorageEditId = null;
let storageItems = [];

/* =========================
   UI
========================= */

function renderApp() {
  const app = qs("app");
  if (!app) return;

  app.innerHTML = `
    <style>
      :root {
        --bg: #0b1020;
        --card: rgba(255,255,255,0.06);
        --stroke: rgba(255,255,255,0.08);
        --text: #ffffff;
        --muted: rgba(255,255,255,0.68);
        --pink: #ff4da6;
        --yellow: #ffd54a;
        --green: #22c55e;
        --red: #ef4444;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: Arial, sans-serif;
      }

      #app {
        padding: 14px;
      }

      .title {
        font-size: 24px;
        font-weight: 800;
        margin-bottom: 14px;
      }

      .card {
        background: var(--card);
        border: 1px solid var(--stroke);
        border-radius: 18px;
        padding: 14px;
        margin-bottom: 14px;
        backdrop-filter: blur(10px);
      }

      .subtitle {
        font-size: 18px;
        font-weight: 700;
        margin-bottom: 12px;
      }

      .grid {
        display: grid;
        gap: 10px;
      }

      input, select, textarea, button {
        width: 100%;
        border: 1px solid var(--stroke);
        background: rgba(255,255,255,0.04);
        color: var(--text);
        border-radius: 14px;
        padding: 12px 14px;
        font-size: 15px;
        outline: none;
      }

      input::placeholder, textarea::placeholder {
        color: rgba(255,255,255,0.45);
      }

      button {
        cursor: pointer;
        font-weight: 700;
      }

      .btn-primary {
        background: linear-gradient(135deg, var(--pink), var(--yellow));
        color: #111827;
        border: 0;
      }

      .btn-secondary {
        background: rgba(255,255,255,0.06);
      }

      .btn-danger {
        background: rgba(239,68,68,0.14);
        border-color: rgba(239,68,68,0.35);
      }

      .row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      .muted {
        color: var(--muted);
        font-size: 13px;
      }

      .storage-item {
        padding: 12px;
        border: 1px solid var(--stroke);
        border-radius: 16px;
        margin-bottom: 10px;
        background: rgba(255,255,255,0.03);
      }

      .storage-top {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 10px;
      }

      .storage-name {
        font-size: 16px;
        font-weight: 800;
      }

      .storage-meta {
        color: var(--muted);
        font-size: 14px;
        margin-top: 4px;
      }

      .storage-prices {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
        margin-top: 10px;
      }

      .pill {
        border: 1px solid var(--stroke);
        background: rgba(255,255,255,0.04);
        border-radius: 12px;
        padding: 8px 10px;
        font-size: 13px;
      }

      .actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }

      .actions button {
        width: auto;
        flex: 1;
      }
    </style>

    <div class="title">Wrap 1654 Manager v1.2</div>

    <div class="card">
      <div class="subtitle">Склад</div>

      <div class="grid">
        <input id="storage_brand" placeholder="Бренд" list="brandList" />
        <input id="storage_name" placeholder="Название материала" />
        
        <div class="row">
          <input id="storage_quantity" placeholder="Количество" type="number" step="0.1" />
          <input id="storage_unit" placeholder="Ед. изм. (метры / шт)" value="метры" />
        </div>

        <div class="row">
          <input id="storage_price_in" placeholder="Цена вход" type="number" step="0.01" />
          <input id="storage_price_out" placeholder="Цена розница" type="number" step="0.01" />
        </div>

        <div class="row">
          <button id="storage_save_btn" class="btn-primary">Добавить</button>
          <button id="storage_cancel_btn" class="btn-secondary" type="button">Отмена</button>
        </div>

        <datalist id="brandList"></datalist>
      </div>
    </div>

    <div class="card">
      <div class="subtitle">Остатки на складе</div>
      <div id="storage_list"></div>
    </div>
  `;
}

/* =========================
   STORAGE FORM
========================= */

function storageFormData() {
  return {
    brand: qs("storage_brand")?.value.trim() || "",
    name: qs("storage_name")?.value.trim() || "",
    quantity: Number(qs("storage_quantity")?.value || 0),
    unit: qs("storage_unit")?.value.trim() || "метры",
    price_in: Number(qs("storage_price_in")?.value || 0),
    price_out: Number(qs("storage_price_out")?.value || 0)
  };
}

function clearStorageForm() {
  if (qs("storage_brand")) qs("storage_brand").value = "";
  if (qs("storage_name")) qs("storage_name").value = "";
  if (qs("storage_quantity")) qs("storage_quantity").value = "";
  if (qs("storage_unit")) qs("storage_unit").value = "метры";
  if (qs("storage_price_in")) qs("storage_price_in").value = "";
  if (qs("storage_price_out")) qs("storage_price_out").value = "";

  currentStorageEditId = null;

  const btn = qs("storage_save_btn");
  if (btn) btn.textContent = "Добавить";
}

function fillStorageForm(item) {
  if (qs("storage_brand")) qs("storage_brand").value = item.brand || "";
  if (qs("storage_name")) qs("storage_name").value = item.name || "";
  if (qs("storage_quantity")) qs("storage_quantity").value = item.quantity ?? "";
  if (qs("storage_unit")) qs("storage_unit").value = item.unit || "метры";
  if (qs("storage_price_in")) qs("storage_price_in").value = item.price_in ?? "";
  if (qs("storage_price_out")) qs("storage_price_out").value = item.price_out ?? "";

  currentStorageEditId = item.id;

  const btn = qs("storage_save_btn");
  if (btn) btn.textContent = "Обновить";

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* =========================
   API
========================= */

async function loadStorage() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/storage?select=*&order=id.desc`, {
      method: "GET",
      headers: headers()
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("loadStorage error:", txt);
      showAlert("Ошибка загрузки склада");
      return;
    }

    storageItems = await res.json();
    fillBrandDatalist(storageItems);
    renderStorageList(storageItems);
  } catch (err) {
    console.error(err);
    showAlert("Сеть недоступна");
  }
}

async function addStorageItem(data) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/smart-handler`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers()
      },
      body: JSON.stringify({
        action: "insert_storage",
        initData: TELEGRAM_INIT_DATA,
        ...data
      })
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("insert_storage error:", txt);
      showAlert("Ошибка при добавлении материала");
      return false;
    }

    haptic("success");
    return true;
  } catch (err) {
    console.error(err);
    showAlert("Сеть недоступна");
    return false;
  }
}

async function updateStorageItem(id, data) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/smart-handler`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers()
      },
      body: JSON.stringify({
        action: "update_storage",
        initData: TELEGRAM_INIT_DATA,
        id,
        ...data
      })
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("update_storage error:", txt);
      showAlert("Ошибка при обновлении материала");
      return false;
    }

    haptic("success");
    return true;
  } catch (err) {
    console.error(err);
    showAlert("Сеть недоступна");
    return false;
  }
}

async function deleteStorageItem(id) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/smart-handler`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers()
      },
      body: JSON.stringify({
        action: "delete_storage",
        initData: TELEGRAM_INIT_DATA,
        id
      })
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("delete_storage error:", txt);
      showAlert("Ошибка при удалении материала");
      return false;
    }

    haptic("success");
    return true;
  } catch (err) {
    console.error(err);
    showAlert("Сеть недоступна");
    return false;
  }
}

/* =========================
   RENDER STORAGE LIST
========================= */

function fillBrandDatalist(items) {
  const datalist = qs("brandList");
  if (!datalist) return;

  const uniqueBrands = [...new Set(
    items.map(item => (item.brand || "").trim()).filter(Boolean)
  )];

  datalist.innerHTML = uniqueBrands
    .map(brand => `<option value="${escapeHtml(brand)}"></option>`)
    .join("");
}

function renderStorageList(items) {
  const box = qs("storage_list");
  if (!box) return;

  if (!items.length) {
    box.innerHTML = `<div class="muted">Склад пуст</div>`;
    return;
  }

  box.innerHTML = items.map(item => {
    const qty = Number(item.quantity ?? 0);
    const priceIn = Number(item.price_in ?? 0);
    const priceOut = Number(item.price_out ?? 0);
    const margin = priceOut - priceIn;

    return `
      <div class="storage-item">
        <div class="storage-top">
          <div>
            <div class="storage-name">${escapeHtml(item.brand || "")} ${escapeHtml(item.name || "")}</div>
            <div class="storage-meta">Количество: ${qty} ${escapeHtml(item.unit || "")}</div>
          </div>
          <div class="muted">ID: ${escapeHtml(item.id)}</div>
        </div>

        <div class="storage-prices">
          <div class="pill">Вход: ${priceIn}</div>
          <div class="pill">Розница: ${priceOut}</div>
          <div class="pill">Маржа: ${margin}</div>
        </div>

        <div class="actions">
          <button class="btn-secondary" onclick="editStorageById(${item.id})">Редактировать</button>
          <button class="btn-danger" onclick="removeStorageById(${item.id})">Удалить</button>
        </div>
      </div>
    `;
  }).join("");
}

/* =========================
   ACTIONS
========================= */

async function handleStorageSave() {
  const data = storageFormData();

  if (!data.brand) {
    showAlert("Укажи бренд");
    return;
  }

  if (!data.name) {
    showAlert("Укажи название материала");
    return;
  }

  if (Number.isNaN(data.quantity)) {
    showAlert("Проверь количество");
    return;
  }

  if (Number.isNaN(data.price_in)) {
    showAlert("Проверь цену вход");
    return;
  }

  if (Number.isNaN(data.price_out)) {
    showAlert("Проверь цену розница");
    return;
  }

  let ok = false;

  if (currentStorageEditId) {
    ok = await updateStorageItem(currentStorageEditId, data);
  } else {
    ok = await addStorageItem(data);
  }

  if (ok) {
    clearStorageForm();
    await loadStorage();
  }
}

function editStorageById(id) {
  const item = storageItems.find(x => Number(x.id) === Number(id));
  if (!item) return;
  fillStorageForm(item);
}

async function removeStorageById(id) {
  const yes = confirm("Удалить этот материал со склада?");
  if (!yes) return;

  const ok = await deleteStorageItem(id);
  if (ok) {
    if (currentStorageEditId === id) clearStorageForm();
    await loadStorage();
  }
}

function initStorageActions() {
  const saveBtn = qs("storage_save_btn");
  const cancelBtn = qs("storage_cancel_btn");

  if (saveBtn) saveBtn.onclick = handleStorageSave;
  if (cancelBtn) cancelBtn.onclick = clearStorageForm;
}

/* =========================
   INIT
========================= */

async function initApp() {
  renderApp();
  initStorageActions();
  await loadStorage();
}

window.editStorageById = editStorageById;
window.removeStorageById = removeStorageById;

document.addEventListener("DOMContentLoaded", initApp);
