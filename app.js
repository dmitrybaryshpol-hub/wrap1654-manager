const SUPABASE_URL = "https://hbciwqgfccdfnzrhiops.supabase.co";
const SUPABASE_KEY = "sb_publishable_nmVB1s_PXivfUNyoTaQWuQ_b5G_dYY9"; 

let allEvents = [], clients = [], storage = [];
const today = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

// ВРЕМЕННО: Доступ разрешен всем для отладки
async function init() {
    console.log("App Initialization...");
    document.getElementById('app-content').style.display = 'block';
    
    await loadData();
    renderAll();
    
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.expand();
        window.Telegram.WebApp.setHeaderColor('#0b0b0f');
    }
}

async function loadData() {
    allEvents = await fetchTable("events");
    clients = await fetchTable("clients");
    storage = await fetchTable("storage");
}

async function fetchTable(table) {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
            headers: { 
                "apikey": SUPABASE_KEY, 
                "Authorization": "Bearer " + SUPABASE_KEY 
            }
        });
        if (!res.ok) throw new Error(`Ошибка загрузки ${table}`);
        return await res.json();
    } catch (e) { 
        console.error(e); 
        return []; 
    }
}

function renderAll() {
    renderEvents();
    renderClients();
    renderStorage();
    updateClientList();
}

function renderEvents() {
    const el = document.getElementById("events");
    el.innerHTML = allEvents.map(e => `
        <div class="card">
            <div><b>${e.car_model}</b><br><small style="color:#888">${e.client_name || 'Клиент'}</small></div>
            <div style="color:#ff33cc; font-weight:900">$${e.amount}</div>
        </div>
    `).join('');
}

function renderClients() {
    const el = document.getElementById("clients-list");
    el.innerHTML = clients.map(c => `
        <div class="card">
            <div><b>${c.name}</b><br><small style="color:#888">${c.phone || ''}</small></div>
            <div style="color:#fefe01; font-size:12px">${c.telegram_id || ''}</div>
        </div>
    `).join('');
}

function updateClientList() {
    const dl = document.getElementById('clients-list-options');
    if (dl) dl.innerHTML = clients.map(c => `<option value="${c.name}">`).join('');
}

function renderStorage() {
    const film = document.getElementById("film-list");
    const prod = document.getElementById("product-list");
    if (!film || !prod) return;
    film.innerHTML = storage.filter(s => s.type === 'film').map(s => `<div class="card"><span>${s.name}</span><b style="color:#fefe01">${s.quantity}</b></div>`).join('');
    prod.innerHTML = storage.filter(s => s.type !== 'film').map(s => `<div class="card"><span>${s.name}</span><b style="color:#fefe01">${s.quantity}</b></div>`).join('');
}

async function submitOrder() {
    const data = {
        client_name: document.getElementById("car-client").value,
        car_model: document.getElementById("car-model").value,
        amount: parseInt(document.getElementById("order-amount").value),
        services: document.getElementById("services").value,
        day: today
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/events`, {
        method: "POST",
        headers: { 
            "apikey": SUPABASE_KEY, 
            "Authorization": "Bearer " + SUPABASE_KEY, 
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        },
        body: JSON.stringify(data)
    });

    if (res.ok) { closeModal("modal-order"); init(); } 
    else { const err = await res.json(); alert("Ошибка заказа: " + err.message); }
}

async function submitClient() {
    const data = {
        name: document.getElementById("client-name").value,
        phone: document.getElementById("client-phone").value,
        telegram_id: document.getElementById("client-tg").value
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });

    if (res.ok) { closeModal("modal-client"); init(); } 
    else { alert("Ошибка при сохранении клиента. Проверьте колонки в Supabase."); }
}

async function submitStorage() {
    const data = {
        name: document.getElementById("st-name").value,
        quantity: parseFloat(document.getElementById("st-qty").value),
        type: document.getElementById("storage-type").value
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/storage`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });

    if (res.ok) { closeModal("modal-storage"); init(); } 
    else { alert("Ошибка склада."); }
}

function openOrderModal() { document.getElementById("modal-order").classList.add("open"); }
function openClientModal() { document.getElementById("modal-client").classList.add("open"); }
function openStorageModal() { document.getElementById("modal-storage").classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

function showPage(page) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById("page-" + page).classList.add("active");
}

init();
