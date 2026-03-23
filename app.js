const tg = window.Telegram.WebApp;
const SUPABASE_URL = "https://hbciwqgfccdfnzrhiops.supabase.co";
const SUPABASE_KEY = "sb_publishable_nmVB1s_PXivfUNyoTaQWuQ_b5G_dYY9";

let allEvents = [], storage = [], selectedDate = new Date().toISOString().split('T')[0];

async function init() {
    const user = tg.initDataUnsafe?.user;
    
    // Если открыли в браузере (не ТГ) — показываем контент для теста
    if (!user) {
        await startApp();
        return;
    }

    // Если в ТГ — проверяем ID в таблице users
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users?telegram_id=eq.${user.id}`, {
        headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY }
    });
    const data = await res.json();

    if (data && data.length > 0) {
        await startApp();
    } else {
        document.getElementById("access-denied").classList.remove("hidden");
    }
}

async function startApp() {
    document.getElementById("app-content").classList.remove("hidden");
    tg.expand();
    await loadData();
    renderCalendar();
    renderEvents();
    renderFilms();
}

async function loadData() {
    const [eRes, sRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/events?select=*`, { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } }),
        fetch(`${SUPABASE_URL}/rest/v1/storage?select=*`, { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } })
    ]);
    allEvents = await eRes.json();
    storage = await sRes.json();
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
    
    // Считаем статистику
    const dayTotal = filtered.reduce((s, e) => s + (e.amount || 0), 0);
    const profitTotal = filtered.reduce((s, e) => s + (e.profit || 0), 0);
    
    document.getElementById("money-day").innerText = dayTotal + "$";
    document.getElementById("profit-day").innerText = profitTotal + "$";
    
    el.innerHTML = filtered.length ? filtered.map(e => `
        <div class="card">
            <div><b>${e.car_model || 'Без авто'}</b><br><small>${e.client_name || ''}</small></div>
            <div style="text-align:right"><b>$${e.amount || 0}</b><br><small style="color:${e.profit >= 0 ? '#00cc66' : '#ff4444'}">${e.profit || 0}$</small></div>
        </div>
    `).join('') : '<p style="text-align:center; opacity:0.2; margin-top:50px;">Записей нет</p>';
}

function renderFilms() {
    const select = document.getElementById("film-select");
    select.innerHTML = '<option value="">Без плёнки</option>' + 
        storage.filter(s => s.type === "film").map(s => `<option value="${s.name}">${s.name}</option>`).join('');
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

    const res = await fetch(`${SUPABASE_URL}/rest/v1/events`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });

    if (res.ok) { closeModal("modal-order"); init(); }
}

function openOrderModal() { document.getElementById("modal-order").classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

init();
