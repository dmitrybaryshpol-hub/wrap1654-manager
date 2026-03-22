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

function renderEvents() {
    const el = document.getElementById("events");
    if(!el) return;
    el.innerHTML = allEvents.map(e => `
        <div class="card" onclick="editOrder(${e.id})">
            <div><b>${e.car_model}</b><br><small style="color:#888">${e.client_name || 'Клиент'}</small></div>
            <div style="color:#ff33cc; font-weight:900">$${e.amount}</div>
        </div>
    `).join('');
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

async function submitOrder() {
    const data = {
        client_name: document.getElementById("car-client").value,
        car_model: document.getElementById("car-model").value,
        amount: parseInt(document.getElementById("order-amount").value),
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

    if (res.ok) { closeModal("modal-order"); init(); }
}

// УДАЛЕНИЕ
async function deleteOrder() {
    if (!currentEditId || !confirm("Удалить этот заказ навсегда?")) return;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${currentEditId}`, {
        method: "DELETE",
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
    });

    if (res.ok) { closeModal("modal-order"); init(); }
}

// Остальные функции (Clients, Storage) оставляем без изменений...
function renderClients() {
    const el = document.getElementById("clients-list");
    if(!el) return;
    el.innerHTML = clients.map(c => `<div class="card"><div><b>${c.name}</b><br><small style="color:#888">${c.phone || ''}</small></div></div>`).join('');
}
function updateClientList() {
    const dl = document.getElementById('clients-list-options');
    if (dl) dl.innerHTML = clients.map(c => `<option value="${c.name}">`).join('');
}
function renderStorage() {
    const film = document.getElementById("film-list");
    const prod = document.getElementById("product-list");
    if (!film || !prod) return;
    film.innerHTML = storage.filter(s => s.type === 'film').map(s => `<div class="card"><span>${s.name}</span><b>${s.quantity}</b></div>`).join('');
    prod.innerHTML = storage.filter(s => s.type !== 'film').map(s => `<div class="card"><span>${s.name}</span><b>${s.quantity}</b></div>`).join('');
}
async function submitClient() {
    await fetch(`${SUPABASE_URL}/rest/v1/clients`, { method: "POST", headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ name: document.getElementById("client-name").value, phone: document.getElementById("client-phone").value, telegram_id: document.getElementById("client-tg").value })});
    closeModal("modal-client"); init();
}
async function submitStorage() {
    await fetch(`${SUPABASE_URL}/rest/v1/storage`, { method: "POST", headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ name: document.getElementById("st-name").value, quantity: parseFloat(document.getElementById("st-qty").value), type: document.getElementById("storage-type").value })});
    closeModal("modal-storage"); init();
}
function openOrderModal() { document.getElementById("modal-order").classList.add("open"); }
function openClientModal() { document.getElementById("modal-client").classList.add("open"); }
function openStorageModal() { document.getElementById("modal-storage").classList.add("open"); }
function closeModal(id) { 
    document.getElementById(id).classList.remove("open"); 
    currentEditId = null;
    if(id === "modal-order") {
        document.getElementById("btn-delete-order").style.display = "none";
        document.getElementById("order-modal-title").innerText = "Новый заказ";
        document.getElementById("car-client").value = "";
        document.getElementById("car-model").value = "";
        document.getElementById("order-amount").value = "";
        document.getElementById("services").value = "";
    }
}
function renderAll() { renderEvents(); renderClients(); renderStorage(); updateClientList(); }
function showPage(page) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById("page-" + page).classList.add("active");
}
init();
