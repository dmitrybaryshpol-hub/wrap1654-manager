const SUPABASE_URL = "https://hbciwqgfccdfnzrhiops.supabase.co";
const SUPABASE_KEY = "sb_publishable_nmVB1s_PXivfUNyoTaQWuQ_b5G_dYY9"; 

const ALLOWED_USERS = ['wrap_1654', 'star_lord_od', 'vlad_wraping'];

let allEvents = [], clients = [], storage = [], currentEditId = null;
const today = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

async function init() {
    const tg = window.Telegram.WebApp;
    const user = tg.initDataUnsafe?.user;
    const username = user?.username ? user.username.toLowerCase() : null;

    // Проверка доступа: если ник в списке ИЛИ если это не Telegram (для отладки)
    if ((username && ALLOWED_USERS.includes(username)) || !tg.initDataUnsafe.query_id) {
        document.getElementById('access-denied').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        await loadData();
        renderAll();
        if(tg.expand) tg.expand();
    } else {
        document.getElementById('access-denied').style.display = 'flex';
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

async function submitOrder() {
    const clientName = document.getElementById("car-client").value.trim();
    const carModel = document.getElementById("car-model").value.trim();
    const amount = parseInt(document.getElementById("order-amount").value);

    if(!clientName || !carModel || isNaN(amount)) return alert("Заполни данные!");

    // 1. Автосоздание клиента
    const exists = clients.some(c => c.name.toLowerCase().trim() === clientName.toLowerCase());
    if (!exists) {
        await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
            method: "POST",
            headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer "+SUPABASE_KEY, "Content-Type": "application/json", "Prefer": "return=minimal" },
            body: JSON.stringify({ name: clientName, phone: "", telegram_id: "" })
        });
    }

    // 2. Сохранение заказа
    const data = {
        client_name: clientName,
        car_model: carModel,
        amount: amount,
        services: document.getElementById("services").value,
        day: today // Отправляем как число 0-6
    };

    const method = currentEditId ? "PATCH" : "POST";
    const url = currentEditId ? `${SUPABASE_URL}/rest/v1/events?id=eq.${currentEditId}` : `${SUPABASE_URL}/rest/v1/events`;

    const res = await fetch(url, {
        method: method,
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer "+SUPABASE_KEY, "Content-Type": "application/json", "Prefer": "return=minimal" },
        body: JSON.stringify(data)
    });

    if (res.ok) { 
        closeModal("modal-order"); 
        await loadData(); 
        renderAll(); 
    } else {
        const err = await res.json();
        alert("Ошибка: " + err.message);
    }
}

async function deleteOrder() {
    if (!currentEditId || !confirm("Удалить заказ?")) return;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${currentEditId}`, {
        method: "DELETE",
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
    });
    if (res.ok) { closeModal("modal-order"); await loadData(); renderAll(); }
}

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

function renderAll() {
    const evEl = document.getElementById("events");
    evEl.innerHTML = allEvents.map(e => `
        <div class="card" onclick="editOrder(${e.id})">
            <div><b>${e.car_model}</b><br><small>${e.client_name}</small></div>
            <div style="color:#ff33cc; font-weight:900">$${e.amount}</div>
        </div>
    `).join('');

    const clEl = document.getElementById("clients-list");
    clEl.innerHTML = clients.map(c => `<div class="card"><b>${c.name}</b></div>`).join('');

    const film = document.getElementById("film-list");
    const prod = document.getElementById("product-list");
    film.innerHTML = storage.filter(s => s.type === 'film').map(s => `<div class="card"><span>${s.name}</span><b>${s.quantity}</b></div>`).join('');
    prod.innerHTML = storage.filter(s => s.type !== 'film').map(s => `<div class="card"><span>${s.name}</span><b>${s.quantity}</b></div>`).join('');
    
    const dl = document.getElementById('clients-list-options');
    dl.innerHTML = clients.map(c => `<option value="${c.name}">`).join('');
}

// Функции управления модалками
function openOrderModal() { document.getElementById("modal-order").classList.add("open"); }
function openClientModal() { document.getElementById("modal-client").classList.add("open"); }
function openStorageModal() { document.getElementById("modal-storage").classList.add("open"); }
function closeModal(id) { 
    document.getElementById(id).classList.remove("open"); 
    currentEditId = null;
    if(id === "modal-order") {
        document.getElementById("btn-delete-order").style.display = "none";
        document.getElementById("order-modal-title").innerText = "Новый заказ";
        document.querySelectorAll("#modal-order input, #modal-order textarea").forEach(i => i.value = "");
    }
}
function showPage(page) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById("page-" + page).classList.add("active");
}

init();
