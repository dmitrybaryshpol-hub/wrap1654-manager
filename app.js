const tg = window.Telegram.WebApp;
const SUPABASE_URL = "https://hbciwqgfccdfnzrhiops.supabase.co";
const SUPABASE_KEY = "sb_publishable_nmVB1s_PXivfUNyoTaQWuQ_b5G_dYY9";

let allEvents = [], storage = [], clients = [], selectedDate = new Date().toISOString().split('T')[0];

async function init() {
    const user = tg.initDataUnsafe?.user;
    
    // БЛОКИРОВКА БРАУЗЕРА: Если нет Telegram ID, сразу стираем всё
    if (!user) {
        document.body.innerHTML = ""; 
        return;
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${user.id}`, {
        headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY }
    });
    const data = await res.json();

    if (data && data.length > 0) {
        // Если доступ есть — показываем интерфейс
        document.getElementById("app-content").classList.remove("hidden");
        tg.expand();
        await loadData();
        renderCalendar();
        renderEvents();
        renderFilms();
        renderStorage();
        renderClients();
    } else {
        // Если ID нет в таблице users — черный экран
        document.body.innerHTML = ""; 
    }
}

async function loadData() {
    const [eRes, sRes, cRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/events?select=*&order=start_date.desc`, { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } }),
        fetch(`${SUPABASE_URL}/rest/v1/storage?select=*`, { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } }),
        fetch(`${SUPABASE_URL}/rest/v1/clients?select=*`, { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } })
    ]);
    allEvents = await eRes.json();
    storage = await sRes.json();
    clients = await cRes.json();
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + pageId).classList.add('active');
}

// ГЛАВНЫЙ ЭКРАН: ОТОБРАЖЕНИЕ ЗАКАЗОВ
function renderEvents() {
    const el = document.getElementById("events");
    // Фильтруем заказы именно по выбранной дате из календаря
    const filtered = allEvents.filter(e => e.start_date && e.start_date.startsWith(selectedDate));
    
    document.getElementById("money-day").innerText = filtered.reduce((s, e) => s + (e.amount || 0), 0) + "$";
    document.getElementById("profit-day").innerText = filtered.reduce((s, e) => s + (e.profit || 0), 0) + "$";
    
    el.innerHTML = filtered.length ? filtered.map(e => `
        <div class="card">
            <div>
                <b>${e.car_model || 'Заказ'}</b><br>
                <small>${e.client_name || 'Без имени'}</small>
                ${e.media_url ? `<br><img src="${e.media_url}" style="width:100%; border-radius:10px; margin-top:5px;">` : ''}
            </div>
            <div style="text-align:right">
                <b>$${e.amount}</b><br>
                <small style="color:${e.profit >= 0 ? '#00cc66' : '#ff4444'}">${e.profit}$</small>
            </div>
        </div>
    `).join('') : '<p style="text-align:center; opacity:0.2; margin-top:50px;">На этот день записей нет</p>';
}

// ДОБАВЛЕНИЕ КЛИЕНТА
async function addClient() {
    const name = document.getElementById("new-client-name").value;
    const phone = document.getElementById("new-client-phone").value;
    if(!name) return;

    await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone })
    });
    closeModal('modal-client');
    await loadData();
    renderClients();
}

// ДОБАВЛЕНИЕ НА СКЛАД
async function addStorage() {
    const name = document.getElementById("st-name").value;
    const price = parseFloat(document.getElementById("st-price").value) || 0;
    const qty = parseFloat(document.getElementById("st-qty").value) || 0;
    const type = document.getElementById("st-type").value;

    await fetch(`${SUPABASE_URL}/rest/v1/storage`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ name, price_per_unit: price, quantity: qty, type })
    });
    closeModal('modal-storage');
    await loadData();
    renderStorage();
}

// КАЛЕНДАРЬ
function renderCalendar() {
    const el = document.getElementById("calendar-strip");
    el.innerHTML = "";
    for (let i = -3; i < 12; i++) {
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

function renderFilms() {
    document.getElementById("film-select").innerHTML = '<option value="">Без плёнки</option>' + 
        storage.filter(s => s.type === "film").map(s => `<option value="${s.name}">${s.name}</option>`).join('');
}

function renderStorage() {
    document.getElementById("storage-list").innerHTML = storage.map(s => `
        <div class="card">
            <span>${s.name}</span>
            <b>${s.quantity} ${s.type === 'film' ? 'м' : 'шт'}</b>
        </div>
    `).join('') || '<p style="text-align:center; opacity:0.2;">Склад пуст</p>';
}

function renderClients() {
    document.getElementById("clients-list").innerHTML = clients.map(c => `
        <div class="card">
            <b>${c.name}</b>
            <span>${c.phone || ''}</span>
        </div>
    `).join('') || '<p style="text-align:center; opacity:0.2;">Клиентов нет</p>';
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
        start_date: document.getElementById("date-start").value || new Date().toISOString(),
        film_used: filmName,
        film_amount: filmQty
    };

    await fetch(`${SUPABASE_URL}/rest/v1/events`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    closeModal("modal-order");
    await loadData();
    renderEvents();
}

function openModal(id) { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

init();
