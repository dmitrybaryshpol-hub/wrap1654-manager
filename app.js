const SUPABASE_URL = "https://hbciwqgfccdfnzrhiops.supabase.co";
const SUPABASE_KEY = "ВСТАВЬ_СВОЙ_КЛЮЧ_ЗДЕСЬ"; 

// Список разрешенных ников
const ALLOWED_USERS = ['wrap_1654', 'star_lord_od', 'vlad_wraping'];

let allEvents = [], clients = [], storage = [], currentEditId = null;
const today = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

async function init() {
    const tg = window.Telegram.WebApp;
    const user = tg.initDataUnsafe?.user;
    const username = user?.username ? user.username.toLowerCase() : null;

    // Проверка доступа (если зашел один из админов или есть данные юзера)
    if ((username && ALLOWED_USERS.includes(username)) || !tg.initDataUnsafe.query_id) {
        document.getElementById('access-denied').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        
        await loadData();
        renderAll();
        
        if(tg.expand) tg.expand();
        if(tg.setHeaderColor) tg.setHeaderColor('#0b0b0f');
    } else {
        document.getElementById('app-content').innerHTML = "";
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
        // order=id.desc делает так, чтобы новые записи были сверху
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=id.desc`, {
            headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
        });
        return await res.json();
    } catch (e) { 
        console.error("Ошибка загрузки таблицы " + table, e);
        return []; 
    }
}

// СОХРАНЕНИЕ ЗАКАЗА + АВТОСОЗДАНИЕ КЛИЕНТА
async function submitOrder() {
    const clientName = document.getElementById("car-client").value.trim();
    const carModel = document.getElementById("car-model").value.trim();
    const amount = parseInt(document.getElementById("order-amount").value);

    if(!clientName || !carModel || isNaN(amount)) return alert("Заполни данные!");

    // 1. Проверяем, есть ли такой клиент в базе
    const exists = clients.some(c => c.name.toLowerCase().trim() === clientName.toLowerCase());
    
    if (!exists) {
        // Если клиента нет - создаем его
        await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
            method: "POST",
            headers: { 
                "apikey": SUPABASE_KEY, 
                "Authorization": "Bearer " + SUPABASE_KEY, 
                "Content-Type": "application/json",
                "Prefer": "return=minimal" 
            },
            body: JSON.stringify({ name: clientName, phone: "", telegram_id: "" })
        });
    }

    // 2. Сохраняем или обновляем заказ
    const data = {
        client_name: clientName,
        car_model: carModel,
        amount: amount,
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

    if (res.ok) { 
        closeModal("modal-order"); 
        await loadData(); 
        renderAll(); 
    } else {
        const err = await res.json();
        alert("Ошибка сохранения: " + err.message);
    }
}

// УДАЛЕНИЕ ЗАКАЗА
async function deleteOrder() {
    if (!currentEditId || !confirm("Удалить этот заказ?")) return;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${currentEditId}`, {
        method: "DELETE",
        headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
    });
    if (res.ok) { 
        closeModal("modal-order"); 
        await loadData(); 
        renderAll(); 
    }
}

// РЕДАКТИРОВАНИЕ (при нажатии на карточку)
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

function renderEvents() {
    const el = document.getElementById("events");
    if(!el) return;
    el.innerHTML = allEvents.map(e => `
        <div class="card" onclick="editOrder(${e.id})">
            <div><b>${e.car_model}</b><br><small style
