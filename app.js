const tg = window.Telegram.WebApp;
const SUPABASE_URL = "https://hbciwqgfccdfnzrhiops.supabase.co";
const SUPABASE_KEY = "sb_publishable_nmVB1s_PXivfUNyoTaQWuQ_b5G_dYY9";

let allEvents = [], storage = [], selectedDate = new Date().toISOString().split('T')[0];

async function init() {
    const user = tg.initDataUnsafe?.user;
    
    // Если открыли в браузере (не ТГ) — показываем для разработки
    if (!user) {
        await startApp();
        return;
    }

    // Проверка в базе
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${user.id}`, {
        headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY }
    });
    const data = await res.json();

    // Если пользователя НЕТ в базе — просто ничего не делаем (экран останется черным)
    if (data && data.length > 0) {
        await startApp();
    } else {
        console.log("Доступ запрещен для ID:", user.id);
        // Можно оставить экран абсолютно пустым
        document.body.innerHTML = ""; 
    }
}

async function startApp() {
    document.getElementById("app-content").classList.remove("hidden");
    tg.expand();
    await loadData();
    renderCalendar();
    renderEvents();
    renderFilms();
    renderStorage();
    renderClients();
}

async function loadData() {
    const [eRes, sRes, cRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/events?select=*`, { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } }),
        fetch(`${SUPABASE_URL}/rest/v1/storage?select=*`, { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } }),
        fetch(`${SUPABASE_URL}/rest/v1/clients?select=*`, { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } })
    ]);
    allEvents = await eRes.json();
    storage = await sRes.json();
    clients = await cRes.json();
}

// Переключение страниц
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + pageId).classList.add('active');
}

function renderCalendar() {
    const el = document.getElementById("calendar-strip");
    el.innerHTML = "";
    for (let i = -3; i < 10; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const iso = d.toISOString().split('T')[0];
        const div = document.createElement("div");
        div.className = `day ${iso === selectedDate ? 'active' : ''}`;
        div.innerText = d.getDate();
        div.onclick = () => { selectedDate = iso; renderCalendar(); renderEvents(); };
        el.appendChild(div);
    }
}

function renderEvents() {
    const el = document.getElementById("events");
    const filtered = allEvents.filter(e => e.start_date && e.start_date.startsWith(selectedDate));
    
    document.getElementById("money-day").innerText = filtered.reduce((s, e) => s + (e.amount || 0), 0) + "$";
    document.getElementById("profit-day").innerText = filtered.reduce((s, e) => s + (e.profit || 0), 0) + "$";
    
    el.innerHTML = filtered.map(e => `
        <div class="card">
            <div><b>${e.car_model || 'Авто'}</b><br><small>${e.client_name}</small></div>
            <div style="text-align:right"><b>$${e.amount}</b></div>
        </div>
    `).join('') || '<p style="text-align:center; opacity:0.2; padding-top:30px;">Нет записей</p>';
}

function renderFilms() {
    document.getElementById("film-select").innerHTML = '<option value="">Без плёнки</option>' + 
        storage.filter(s => s.type === "film").map(s => `<option value="${s.name}">${s.name}</option>`).join('');
}

function renderStorage() {
    const el = document.getElementById("storage-list");
    el.innerHTML = storage.map(s => `
        <div class="card">
            <span>${s.name}</span>
            <b>${s.quantity} ${s.type === 'film' ? 'м.' : 'шт.'}</b>
        </div>
    `).join('');
}

function renderClients() {
    const el = document.getElementById("clients-list");
    el.innerHTML = clients.map(c => `<div class="card"><b>${c.name}</b><span>${c.phone || ''}</span></div>`).join('');
}

async function submitOrder() {
    const filmName = document.getElementById("film-select").value;
    const filmQty = parseFloat(document.getElementById("film-qty").value) || 0;
    const amount = parseInt(document.getElementById("order-amount").value) || 0;
    
    let cost = 0;
    if (filmName && filmQty) {
        const film = storage.find(s => s.name === filmName);
        if (film?.price_per_unit) cost = film.price_per_unit * filmQty;
    }

    const data = {
        client_name: document.getElementById("car-client").value,
        car_model: document.getElementById("car-model").value,
        amount: amount,
        profit: amount - cost,
        start_date: document.getElementById("date-start").value || null,
        film_used: filmName,
        film_amount: filmQty
    };

    await fetch(`${SUPABASE_URL}/rest/v1/events`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    closeModal("modal-order");
    init();
}

function openOrderModal() { document.getElementById("modal-order").classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

init();
