const SUPABASE_URL = "https://hbciwqgfccdfnzrhiops.supabase.co";
const SUPABASE_KEY = "sb_publishable_nmVB1s_PXivfUNyoTaQWuQ_b5G_dYY9"; 

const ALLOWED_USERS = ['wrap_1654', 'star_lord_od', 'vlad_wraping'];

let allEvents = [], clients = [], storage = [], currentEditId = null;
let selectedDate = new Date().toISOString().split('T')[0];

async function init() {
    const tg = window.Telegram.WebApp;
    const user = tg.initDataUnsafe?.user;
    const username = user?.username?.toLowerCase();

    // Разрешаем вход, если пользователь в списке
    if (username && ALLOWED_USERS.includes(username)) {
        document.getElementById('access-denied').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        await loadData();
        renderCalendar();
        renderAll();
        tg.expand();
    } else {
        // Если зашли через браузер (не через ТГ), временно пускаем для теста
        document.getElementById('access-denied').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        await loadData();
        renderCalendar();
        renderAll();
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
    if(!strip) return;
    strip.innerHTML = "";
    const days = ['вс','пн','вт','ср','чт','пт','сб'];
    
    for (let i = -2; i < 12; i++) {
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

// СОХРАНЕНИЕ ЗАКАЗА
async function submitOrder() {
    const clientName = document.getElementById("car-client").value.trim();
    const filmName = document.getElementById("film-select").value;
    const filmQty = parseFloat(document.getElementById("film-qty").value) || 0;
    const dateStart = document.getElementById("date-start").value;
    const dateEnd = document.getElementById("date-end").value;

    if(!clientName) return alert("Введите имя клиента");

    // Авто-создание клиента
    if (!clients.some(c => c.name.toLowerCase() === clientName.toLowerCase())) {
        await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
            method: "POST",
            headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ name: clientName })
        });
    }

    // Списание плёнки (только при создании нового)
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

    const data = {
        client_name: clientName,
        car_model: document.getElementById("car-model").value,
        amount: parseInt(document.getElementById("order-amount").value) || 0,
        start_date: dateStart || null, // Штрих: если пусто, шлем null, чтобы не было ошибки
        end_date: dateEnd || null,
        film_used: filmName,
        film_amount: filmQty,
        services: document.getElementById("services").value
    };

    const method = currentEditId ? "PATCH" : "POST";
    const url = currentEditId ? `${SUPABASE_URL}/rest/v1/events?id=eq.${currentEditId}` : `${SUPABASE_URL}/rest/v1/events`;

    const res = await fetch(url, {
        method: method,
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });

    if(res.ok) { closeModal("modal-order"); await init(); }
    else { const err = await res.json(); alert("Ошибка: " + err.message); }
}

function renderEvents() {
    const el = document.getElementById("events");
    const filtered = allEvents.filter(e => e.start_date && e.start_date.startsWith(selectedDate));
    
    el.innerHTML = filtered.length ? filtered.map(e => `
        <div class="card" onclick="editOrder(${e.id})">
            <div><b>${e.car_model || 'Без авто'}</b><br><small style="color:#888">${e.client_name}</small></div>
            <div style="text-align:right">
                <div style="color:#ff33cc; font-weight:900">$${e.amount}</div>
                <small style="font-size:10px; color:#555">${e.start_date ? e.start_date.split('T')[1].slice(0,5) : ''}</small>
            </div>
        </div>
    `).join('') : '<p style="text-align:center; opacity:0.3; padding:20px;">Нет записей</p>';
}

function renderClients() {
    const list = document.getElementById("clients-list");
    list.innerHTML = clients.map(c => `
        <div class="card" onclick="showHistory('${c.name}')">
            <b>${c.name}</b>
            <span style="color:#ff33cc">→</span>
        </div>
    `).join('');
    document.getElementById('clients-list-options').innerHTML = clients.map(c => `<option value="${c.name}">`).join('');
}

function showHistory(name) {
    const history = allEvents.filter(e => e.client_name === name);
    document.getElementById("history-name").innerText = name;
    document.getElementById("history-list").innerHTML = history.length ? history.map(h => `
        <div class="history-item" style="padding:10px; border-bottom:1px solid #222;">
            <small>${h.start_date ? h.start_date.split('T')[0] : 'Нет даты'}</small><br>
            <b>${h.car_model}</b> — $${h.amount}
        </div>
    `).join('') : "Истории пока нет";
    document.getElementById("modal-client-history").classList.add("open");
}

function renderStorage() {
    const films = storage.filter(s => s.type === 'film');
    const prods = storage.filter(s => s.type !== 'film');
    
    document.getElementById("film-list").innerHTML = films.map(s => `<div class="card"><span>${s.name}</span><b style="color:#fefe01">${s.quantity} м.</b></div>`).join('');
    document.getElementById("product-list").innerHTML = prods.map(s => `<div class="card"><span>${s.name}</span><b style="color:#fefe01">${s.quantity} шт.</b></div>`).join('');
    
    document.getElementById("film-select").innerHTML = '<option value="">Без плёнки</option>' + films.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
}

// КНОПКИ ОТКРЫТИЯ МОДАЛОК
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
        document.getElementById("film-qty").value = 0;
    }
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
    document.getElementById("order-modal-title").innerText = "Правка заказа";
    openOrderModal();
}

async function submitClient() {
    const name = document.getElementById("client-name").value;
    await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone: document.getElementById("client-phone").value, telegram_id: document.getElementById("client-tg").value })
    });
    closeModal("modal-client"); await init();
}

async function submitStorage() {
    await fetch(`${SUPABASE_URL}/rest/v1/storage`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ name: document.getElementById("st-name").value, quantity: parseFloat(document.getElementById("st-qty").value), type: document.getElementById("storage-type").value })
    });
    closeModal("modal-storage"); await init();
}

async function deleteOrder() {
    if (!confirm("Удалить заказ?")) return;
    await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${currentEditId}`, { method: "DELETE", headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY } });
    closeModal("modal-order"); await init();
}

function renderAll() { renderEvents(); renderClients(); renderStorage(); }
function showPage(p) { document.querySelectorAll('.page').forEach(x=>x.classList.remove('active')); document.getElementById('page-'+p).classList.add('active'); }

init();
