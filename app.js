const tg = window.Telegram.WebApp;
const SUPABASE_URL = "https://hbciwqgfccdfnzrhiops.supabase.co";
const SUPABASE_KEY = "sb_publishable_nmVB1s_PXivfUNyoTaQWuQ_b5G_dYY9";

let allEvents = [], storage = [], clients = [], selectedDate = new Date().toISOString().split('T')[0];

async function init() {
    const user = tg.initDataUnsafe?.user;
    
    // Если запуск в браузере — даем доступ для разработки
    if (!user) {
        console.log("Dev Mode");
        await startApp();
        return;
    }

    // Проверка доступа по ID
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${user.id}`, {
        headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY }
    });
    const data = await res.json();

    if (data && data.length > 0) {
        await startApp();
    } else {
        // Черный экран для всех остальных
        document.body.innerHTML = ""; 
        document.body.style.background = "black";
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
        fetch(`${SUPABASE_URL}/rest/v1/events?select=*&order=id.desc`, { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } }),
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
    // Снимаем прозрачность с иконок (опционально)
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
    
    // Статистика
    const dayTotal = filtered.reduce((s, e) => s + (e.amount || 0), 0);
    const dayProfit = filtered.reduce((s, e) => s + (e.profit || 0), 0);
    const weekTotal = allEvents.filter(e => {
        const d = new Date(e.start_date);
        const diff = (new Date() - d) / (1000*60*60*24);
        return diff <= 7;
    }).reduce((s, e) => s + (e.amount || 0), 0);

    document.getElementById("money-day").innerText = dayTotal + "$";
    document.getElementById("profit-day").innerText = dayProfit + "$";
    document.getElementById("money-week").innerText = weekTotal + "$";
    
    el.innerHTML = filtered.map(e => `
        <div class="card">
            <div>
                <b>${e.car_model || 'Без авто'}</b><br>
                <small>${e.client_name}</small><br>
                ${e.media_url ? `<img src="${e.media_url}">` : ''}
            </div>
            <div style="text-align:right">
                <b>$${e.amount}</b><br>
                <small style="color:${e.profit >= 0 ? '#00cc66' : '#ff4444'}">${e.profit}$</small>
            </div>
        </div>
    `).join('') || '<p style="text-align:center; opacity:0.2; padding-top:40px;">Нет записей</p>';
}

function renderFilms() {
    document.getElementById("film-select").innerHTML = '<option value="">Без плёнки</option>' + 
        storage.filter(s => s.type === "film").map(s => `<option value="${s.name}">${s.name}</option>`).join('');
}

function renderStorage() {
    document.getElementById("storage-list").innerHTML = storage.map(s => `
        <div class="card">
            <span>${s.name}</span>
            <b>${s.quantity} ${s.type === 'film' ? 'м.' : 'шт.'}</b>
        </div>
    `).join('');
}

function renderClients() {
    document.getElementById("clients-list").innerHTML = clients.map(c => `
        <div class="card">
            <b>${c.name}</b>
            <span>${c.phone || '—'}</span>
        </div>
    `).join('');
}

async function uploadFile(file) {
    const fileName = Date.now() + "_" + file.name;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/cars/${fileName}`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": file.type },
        body: file
    });
    return res.ok ? `${SUPABASE_URL}/storage/v1/object/public/cars/${fileName}` : null;
}

async function submitOrder() {
    const filmName = document.getElementById("film-select").value;
    const filmQty = parseFloat(document.getElementById("film-qty").value) || 0;
    const amount = parseInt(document.getElementById("order-amount").value) || 0;
    const file = document.getElementById("media").files[0];
    
    let mediaUrl = file ? await uploadFile(file) : null;
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
        film_amount: filmQty,
        media_url: mediaUrl
    };

    await fetch(`${SUPABASE_URL}/rest/v1/events`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });

    closeModal("modal-order");
    await startApp(); // Обновляем данные
}

function openOrderModal() { document.getElementById("modal-order").classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

init();
