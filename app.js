const SUPABASE_URL = "https://hbciwqgfccdfnzrhiops.supabase.co";
const SUPABASE_KEY = "sb_publishable_nmVB1s_PXivfUNyoTaQWuQ_b5G_dYY9";

const ALLOWED_USERS = ['wrap_1654', 'star_lord_od', 'vlad_wraping'];

let allEvents = [], clients = [], storage = [];

async function init() {
    const tg = window.Telegram.WebApp;
    const user = tg.initDataUnsafe?.user;
    const username = user?.username?.toLowerCase();

    if (!username || !ALLOWED_USERS.includes(username)) {
        document.getElementById('access-denied').style.display = 'flex';
        return;
    }

    document.getElementById('app-content').style.display = 'block';

    await loadData();
    renderAll();

    tg.expand();
}

async function loadData() {
    allEvents = await fetchTable("events");
    clients = await fetchTable("clients");
    storage = await fetchTable("storage");
}

async function fetchTable(table) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + SUPABASE_KEY
        }
    });
    return await res.json();
}

/* ---------- НАВИГАЦИЯ ---------- */
function showPage(p, el) {
    document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
    document.getElementById('page-' + p).classList.add('active');

    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    if (el) el.classList.add('active');
}

/* ---------- РЕНДЕР ---------- */
function renderAll() {
    renderEvents();
    renderClients();
    renderStorage();
}

function renderEvents() {
    const el = document.getElementById("events");
    el.innerHTML = allEvents.map(e => `
        <div class="card">
            <b>${e.car_model || 'Без авто'}</b>
            <span>${e.amount || 0}$</span>
        </div>
    `).join('');
}

function renderClients() {
    const el = document.getElementById("clients-list");
    el.innerHTML = clients.map(c => `
        <div class="card">${c.name}</div>
    `).join('');
}

function renderStorage() {
    const films = storage.filter(s => s.type === 'film');
    const prods = storage.filter(s => s.type !== 'film');

    document.getElementById("film-list").innerHTML =
        films.map(f => `<div class="card">${f.name} — ${f.quantity} м</div>`).join('');

    document.getElementById("product-list").innerHTML =
        prods.map(p => `<div class="card">${p.name} — ${p.quantity}</div>`).join('');
}

/* ---------- МОДАЛКИ (заглушка пока) ---------- */
function openOrderModal() {
    alert("Тут будет создание заказа");
}

function openClientModal() {
    alert("Тут будет создание клиента");
}

function openStorageModal() {
    alert("Тут будет склад");
}

init();
