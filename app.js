const SUPABASE_URL = "https://hbciwqgfccdfnzrhiops.supabase.co";
const SUPABASE_KEY = "sb_publishable_nmVB1s_PXivfUNyoTaQWuQ_b5G_dYY9"; // Твой ключ!

// СПИСОК РАЗРЕШЕННЫХ ПОЛЬЗОВАТЕЛЕЙ

// [Остальные функции подгрузки и рендера остаются прежними]
async function loadData() {
    allEvents = await fetchTable("events");
    clients = await fetchTable("clients");
    storage = await fetchTable("storage");
}

async function fetchTable(table) {
    try {
        let res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
            headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY }
        });
        return await res.json();
    } catch (e) { return []; }
}

function renderAll() {
    renderEvents();
    renderClients();
    renderStorage();
    updateClientList();
}

function renderEvents() {
    let el = document.getElementById("events");
    el.innerHTML = "";
    allEvents.forEach(e => {
        let d = document.createElement("div");
        d.className = "card";
        d.innerHTML = `<div><b>${e.car_model}</b><br><small style="color:#888">${e.client_name || 'Клиент'}</small></div><div style="color:#ff33cc; font-weight:900">$${e.amount}</div>`;
        el.appendChild(d);
    });
}

function renderClients() {
    let el = document.getElementById("clients-list");
    el.innerHTML = "";
    clients.forEach(c => {
        let d = document.createElement("div");
        d.className = "card";
        d.innerHTML = `<div><b>${c.name}</b><br><small style="color:#888">${c.phone || ''}</small></div><div style="color:#fefe01; font-size:12px">${c.telegram_id || ''}</div>`;
        el.appendChild(d);
    });
}

function updateClientList() {
    const dl = document.getElementById('clients-list-options');
    if(dl) dl.innerHTML = clients.map(c => `<option value="${c.name}">`).join('');
}

function renderStorage() {
    let film = document.getElementById("film-list");
    let prod = document.getElementById("product-list");
    if(!film || !prod) return;
    film.innerHTML = ""; prod.innerHTML = "";
    storage.forEach(s => {
        let d = document.createElement("div");
        d.className = "card";
        d.innerHTML = `<span>${s.name}</span><b style="color:#fefe01">${s.quantity}</b>`;
        (s.type === "film" ? film : prod).appendChild(d);
    });
}

// Исправленная функция сохранения заказа
async function submitOrder() {
    const client = document.getElementById("car-client").value;
    const model = document.getElementById("car-model").value;
    const amt = document.getElementById("order-amount").value;
    
    if(!client || !model || !amt) return alert("Заполни данные!");

    const res = await fetch(`${SUPABASE_URL}/rest/v1/events`, {
        method: "POST",
        headers: { 
            apikey: SUPABASE_KEY, 
            Authorization: "Bearer " + SUPABASE_KEY, 
            "Content-Type": "application/json",
            "Prefer": "return=minimal" // Важно для стабильности
        },
        body: JSON.stringify({
            client_name: client,
            car_model: model,
            amount: parseInt(amt),
            services: document.getElementById("services").value,
            day: today
        })
    });
    
    if (res.ok) {
        closeModal("modal-order");
        await init();
    } else {
        const err = await res.json();
        alert("Ошибка базы: " + err.message);
    }
}

// Исправленная функция клиента
async function submitClient() {
    const name = document.getElementById("client-name").value;
    if(!name) return alert("Введите имя!");

    const res = await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
        method: "POST",
        headers: { 
            apikey: SUPABASE_KEY, 
            Authorization: "Bearer " + SUPABASE_KEY, 
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        },
        body: JSON.stringify({
            name: name,
            phone: document.getElementById("client-phone").value,
            telegram_id: document.getElementById("client-tg").value
        })
    });

    if (res.ok) {
        closeModal("modal-client");
        await init();
    } else {
        alert("Ошибка: проверьте колонки в таблице clients");
    }
}

async function submitStorage() {
    const name = document.getElementById("st-name").value;
    const qty = document.getElementById("st-qty").value;
    if(!name || !qty) return alert("Заполни данные!");
    await fetch(`${SUPABASE_URL}/rest/v1/storage`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, quantity: parseFloat(qty), type: document.getElementById("storage-type").value })
    });
    closeModal("modal-storage");
    await init();
}

function openOrderModal() { document.getElementById("modal-order").classList.add("open"); }
function openClientModal() { document.getElementById("modal-client").classList.add("open"); }
function openStorageModal() { document.getElementById("modal-storage").classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

function showPage(page) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById("page-" + page).classList.add("active");
    if(window.Telegram.WebApp.HapticFeedback) window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
}

function previewMedia(event) {
    const reader = new FileReader();
    reader.onload = () => { document.getElementById('preview').innerHTML = `<img src="${reader.result}">`; }
    reader.readAsDataURL(event.target.files[0]);
}

init();
