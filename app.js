const SUPABASE_URL = "https://hbciwqgfccdfnzrhiops.supabase.co";
const SUPABASE_KEY = "sb_publishable_nmVB1s_PXivfUNyoTaQWuQ_b5G_dYY9"; 
const ALLOWED_USERS = ['wrap_1654', 'star_lord_od', 'vlad_wraping'];

let allEvents = [], clients = [], storage = [], currentEditId = null;
let selectedDate = new Date().toISOString().split('T')[0];

async function init() {
    const tg = window.Telegram.WebApp;
    const user = tg.initDataUnsafe?.user;
    const username = user?.username?.toLowerCase();

    // Мягкая проверка (если не из ТГ, но в списке - пускаем)
    if (username && ALLOWED_USERS.includes(username) || window.location.hostname === "localhost") {
        document.getElementById('access-denied').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        await loadData();
        renderCalendar();
        renderAll();
        tg.expand();
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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=id.desc`, {
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
    });
    return await res.json();
}

// КАЛЕНДАРЬ
function renderCalendar() {
    const strip = document.getElementById('calendar-strip');
    strip.innerHTML = "";
    const days = ['вс','пн','вт','ср','чт','пт','сб'];
    
    for (let i = -2; i < 10; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const iso = d.toISOString().split('T')[0];
        const card = document.createElement('div');
        card.className = `day-card ${iso === selectedDate ? 'active' : ''}`;
        card.onclick = () => { selectedDate = iso; renderCalendar(); renderEvents(); };
        card.innerHTML = `<span>${days[d.getDay()]}</span><span>${d.getDate()}</span>`;
        strip.appendChild(card);
    }
}

// СОХРАНЕНИЕ ЗАКАЗА + АВТО-СПИСАНИЕ
async function submitOrder() {
    const clientName = document.getElementById("car-client").value;
    const filmName = document.getElementById("film-select").value;
    const filmQty = parseFloat(document.getElementById("film-qty").value);

    // 1. Авто-создание клиента
    if (!clients.some(c => c.name === clientName)) {
        await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
            method: "POST",
            headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ name: clientName })
        });
    }

    // 2. Списание плёнки (только если это новый заказ)
    if (filmName && filmQty > 0 && !currentEditId) {
        const item = storage.find(s => s.name === filmName);
        if (item) {
            await fetch(`${SUPABASE_URL}/rest/v1/storage?id=eq.${item.id}`, {
                method: "PATCH",
                headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
                body: JSON.stringify({ quantity: item.quantity - filmQty })
            });
        }
    }

    // 3. Сохранение заказа
    const data = {
        client_name: clientName,
        car_model: document.getElementById("car-model").value,
        amount: parseInt(document.getElementById("order-amount").value),
        start_date: document.getElementById("date-start").value,
        end_date: document.getElementById("date-end").value,
        film_used: filmName,
        film_amount: filmQty,
        services: document.getElementById("services").value
    };

    const method = currentEditId ? "PATCH" : "POST";
    const url = currentEditId ? `${SUPABASE_URL}/rest/v1/events?id=eq.${currentEditId}` : `${SUPABASE_URL}/rest/v1/events`;

    await fetch(url, {
        method: method,
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });

    closeModal("modal-order");
    await init();
}

function renderEvents() {
    const el = document.getElementById("events");
    // Фильтруем заказы, которые попадают на выбранную дату
    const filtered = allEvents.filter(e => e.start_date && e.start_date.startsWith(selectedDate));
    
    el.innerHTML = filtered.length ? filtered.map(e => `
        <div class="card" onclick="editOrder(${e.id})">
            <div><b>${e.car_model}</b><br><small>${e.client_name}</small></div>
            <div style="text-align:right">
                <div style="color:#ff33cc; font-weight:900">$${e.amount}</div>
                <small style="font-size:10px; color:#555">${e.start_date.split('T')[1].slice(0,5)}</small>
            </div>
        </div>
    `).join('') : '<p style="text-align:center; opacity:0.3; margin-top:20px;">Нет записей на этот день</p>';
}

function renderClients() {
    document.getElementById("clients-list").innerHTML = clients.map(c => `
        <div class="card" onclick="showHistory('${c.name}')">
            <b>${c.name}</b>
            <span>→</span>
        </div>
    `).join('');
    document.getElementById('clients-list-options').innerHTML = clients.map(c => `<option value="${c.name}">`).join('');
}

function showHistory(name) {
    const history = allEvents.filter(e => e.client_name === name);
    document.getElementById("history-name").innerText = name;
    document.getElementById("history-list").innerHTML = history.map(h => `
        <div class="history-item">
            ${h.start_date ? h.start_date.split('T')[0] : ''} — <b>${h.car_model}</b> ($${h.amount})
        </div>
    `).join('') || "Нет истории заказов";
    document.getElementById("modal-client-history").classList.add("open");
}

function renderStorage() {
    const films = storage.filter(s => s.type === 'film');
    document.getElementById("film-list").innerHTML = films.map(s => `<div class="card"><span>${s.name}</span><b>${s.quantity} м.</b></div>`).join('');
    document.getElementById("film-select").innerHTML = '<option value="">Без плёнки</option>' + films.map(s => `<option value="${s.name}">${s.name} (ост. ${s.quantity}м)</option>`).join('');
}

function editOrder(id) {
    const e = allEvents.find(x => x.id === id);
    currentEditId = id;
    document.getElementById("car-client").value = e.client_name;
    document.getElementById("car-model").value = e.car_model;
    document.getElementById("order-amount").value = e.amount;
    document.getElementById("date-start").value = e.start_date ? e.start_date.slice(0,16) : "";
    document.getElementById("date-end").value = e.end_date ? e.end_date.slice(0,16) : "";
    document.getElementById("film-select").value = e.film_used || "";
    document.getElementById("film-qty").value = e.film_amount || 0;
    document.getElementById("services").value = e.services || "";
    document.getElementById("btn-delete-order").style.display = "block";
    openOrderModal();
}

async function deleteOrder() {
    if (!confirm("Удалить?")) return;
    await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${currentEditId}`, { method: "DELETE", headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY } });
    closeModal("modal-order"); await init();
}

function openOrderModal() { document.getElementById("modal-order").classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); currentEditId = null; }
function renderAll() { renderEvents(); renderClients(); renderStorage(); }
function showPage(p) { document.querySelectorAll('.page').forEach(x=>x.classList.remove('active')); document.getElementById('page-'+p).classList.add('active'); }

init();
