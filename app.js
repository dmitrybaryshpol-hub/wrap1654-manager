const SUPABASE_URL = "https://hbciwqgfccdfnzrhiops.supabase.co";
const SUPABASE_KEY = "sb_publishable_nmVB1s_PXivfUNyoTaQWuQ_b5G_dYY9"; 

const ALLOWED_USERS = ['wrap_1654', 'star_lord_od', 'vlad_wraping'];

let allEvents = [], clients = [], storage = [], currentEditId = null;
const today = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

async function init() {
    const tg = window.Telegram.WebApp;
    const user = tg.initDataUnsafe?.user;
    const username = user?.username ? user.username.toLowerCase() : null;

    if (username && ALLOWED_USERS.includes(username)) {
        document.getElementById('access-denied').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        await loadData();
        renderAll();
        tg.expand();
        tg.setHeaderColor('#0b0b0f');
    } else {
        document.getElementById('app-content').innerHTML = "";
    }
}

async function loadData() {
    allEvents = await fetchTable("events");
    clients = await fetchTable("clients");
    storage = await fetchTable("storage");
}

async function fetchTable(table) {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=id.desc`, {
            headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
        });
        return await res.json();
    } catch (e) { return []; }
}

// СОХРАНЕНИЕ ЗАКАЗА + АВТОСОЗДАНИЕ КЛИЕНТА
async function submitOrder() {
    const clientName = document.getElementById("car-client").value.trim();
    const carModel = document.getElementById("car-model").value.trim();
    const amount = parseInt(document.getElementById("order-amount").value);

    if(!clientName || !carModel || isNaN(amount)) return alert("Заполни данные!");

    // 1. Проверяем, есть ли такой клиент в базе (игнорируя пробелы и регистр)
    const exists = clients.some(c => c.name.toLowerCase().trim() === clientName.toLowerCase());
    
    if (!exists) {
        // Если клиента нет - создаем его и ЖДЕМ завершения (await)
        const createRes = await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
            method: "POST",
            headers: { 
                "apikey": SUPABASE_KEY, 
                "Authorization": "Bearer " + SUPABASE_KEY, 
                "Content-Type": "application/json",
                "Prefer": "return=minimal" 
            },
            body: JSON.stringify({ name: clientName, phone: "", telegram_id: "" })
        });
        
        if (!createRes.ok) {
            console.error("Ошибка при автосоздании клиента");
        }
    }

    // 2. Сохраняем сам заказ
    const data = {
        client_name: clientName,
        car_model: carModel,
        amount: amount,
        services: document.getElementById("services").value,
        day: today
    };

    const method = currentEditId ? "PATCH" : "POST";
    const url = currentEditId ? `${SUPABASE_URL}/rest/v1/events?id=eq.${currentEditId}` : `${SUPABASE_URL}/rest/v1/events`;

    const res = await fetch(url, {
        method: method,
        headers: { 
            "apikey": SUPABASE_KEY, 
            "Authorization": "Bearer " + SUPABASE_KEY, 
            "Content-Type": "application/json",
            "Prefer": "return=minimal" 
        },
        body: JSON.stringify(data)
    });

    if (res.ok) { 
        closeModal("modal-order"); 
        // ВАЖНО: перегружаем данные, чтобы клиент точно появился в списке
        await loadData(); 
        renderAll(); 
    }
}

    const method = currentEditId ? "PATCH" : "POST";
    const url = currentEditId ? `${SUPABASE_URL}/rest/v1/events?id=eq.${currentEditId}` : `${SUPABASE_URL}/rest/v1/events`;

    const res = await fetch(url, {
        method: method,
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json", "Prefer": "return=minimal" },
        body: JSON.stringify(data)
    });

    if (res.ok) { closeModal("modal-order"); await init(); }
}

// УДАЛЕНИЕ ЗАКАЗА
async function deleteOrder() {
    if (!currentEditId || !confirm("Удалить этот заказ?")) return;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${currentEditId}`, {
        method: "DELETE",
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
    });
    if (res.ok) { closeModal("modal-order"); await init(); }
}

// РЕДАКТИРОВАНИЕ
function editOrder(id) {
    const order = allEvents.find(e => e.id === id);
    if (!order) return;
    currentEditId = id;
    document.getElementById("car-client").value = order.client_name;
    document.getElementById("car-model").value = order.car_model;
    document.getElementById("order-amount").value = order.amount;
    document.getElementById("services").value = order.services || "";
    document.getElementById("btn-delete-order").style.display = "block";
    document.getElementById("order-modal-title").innerText = "Правка заказа";
    openOrderModal();
}

// ОСТАЛЬНЫЕ ФУНКЦИИ РЕНДЕРА
function renderEvents() {
    const el = document.getElementById("events");
    el.innerHTML = allEvents.map(e => `
        <div class="card" onclick="editOrder(${e.id})">
            <div><b>${e.car_model}</b><br><small style="color:#888">${e.client_name || 'Клиент'}</small></div>
            <div style="color:#ff33cc; font-weight:900">$${e.amount}</div>
        </div>
    `).join('');
}

function renderClients() {
    const el = document.getElementById("clients-list");
    el.innerHTML = clients.map(c => `<div class="card"><div><b>${c.name}</b><br><small style="color:#888">${c.phone || ''}</small></div></div>`).join('');
}

function updateClientList() {
    const dl = document.getElementById('clients-list-options');
    if (dl) dl.innerHTML = clients.map(c => `<option value="${c.name}">`).join('');
}

function renderStorage() {
    const film = document.getElementById("film-list");
    const prod = document.getElementById("product-list");
    film.innerHTML = storage.filter(s => s.type === 'film').map(s => `<div class="card"><span>${s.name}</span><b style="color:#fefe01">${s.quantity}</b></div>`).join('');
    prod.innerHTML = storage.filter(s => s.type !== 'film').map(s => `<div class="card"><span>${s.name}</span><b style="color:#fefe01">${s.quantity}</b></div>`).join('');
}

async function submitClient() {
    await fetch(`${SUPABASE_URL}/rest/v1/clients`, { method: "POST", headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ name: document.getElementById("client-name").value, phone: document.getElementById("client-phone").value, telegram_id: document.getElementById("client-tg").value })});
    closeModal("modal-client"); await init();
}

async function submitStorage() {
    await fetch(`${SUPABASE_URL}/rest/v1/storage`, { method: "POST", headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ name: document.getElementById("st-name").value, quantity: parseFloat(document.getElementById("st-qty").value), type: document.getElementById("storage-type").value })});
    closeModal("modal-storage"); await init();
}

function openOrderModal() { document.getElementById("modal-order").classList.add("open"); }
function openClientModal() { document.getElementById("modal-client").classList.add("open"); }
function openStorageModal() { document.getElementById("modal-storage").classList.add("open"); }
function closeModal(id) { 
    document.getElementById(id).classList.remove("open"); 
    currentEditId = null;
    if(id === "modal-order") {
        document.getElementById("btn-delete-order").style.display = "none";
        document.getElementById("order-modal
