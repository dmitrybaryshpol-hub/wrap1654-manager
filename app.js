// =========================
// SUPABASE CONFIG
// =========================
const SUPABASE_URL = 'https://hbcivwqfcdofnzrhiops.supabase.co';
const SUPABASE_ANON_KEY = 'sb_secret_Cg0vPCkFknD8QQgEPExRJg_GSORa-dQ';

// =========================
// INIT SUPABASE
// =========================
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =========================
// TELEGRAM APP INIT
// =========================
const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

// =========================
// UI HELPERS
// =========================
function showAccessDenied(message = 'У вас нет доступа к приложению') {
  document.body.innerHTML = `
    <div style="
      min-height:100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      background:#0f0f0f;
      color:white;
      font-family:Arial,sans-serif;
      padding:24px;
      box-sizing:border-box;
      text-align:center;
    ">
      <div style="
        max-width:420px;
        width:100%;
        background:#1b1b1b;
        border:1px solid #333;
        border-radius:16px;
        padding:24px;
        box-shadow:0 10px 30px rgba(0,0,0,0.35);
      ">
        <h2 style="margin:0 0 12px 0;">Нет доступа</h2>
        <p style="margin:0; color:#cfcfcf; line-height:1.5;">
          ${message}
        </p>
      </div>
    </div>
  `;
}

function showFatalError(message = 'Произошла ошибка при запуске приложения') {
  document.body.innerHTML = `
    <div style="
      min-height:100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      background:#0f0f0f;
      color:white;
      font-family:Arial,sans-serif;
      padding:24px;
      box-sizing:border-box;
      text-align:center;
    ">
      <div style="
        max-width:480px;
        width:100%;
        background:#1b1b1b;
        border:1px solid #333;
        border-radius:16px;
        padding:24px;
        box-shadow:0 10px 30px rgba(0,0,0,0.35);
      ">
        <h2 style="margin:0 0 12px 0;">Ошибка запуска</h2>
        <p style="margin:0; color:#cfcfcf; line-height:1.5;">
          ${message}
        </p>
      </div>
    </div>
  `;
}

// =========================
// TELEGRAM AUTH CHECK
// =========================
async function checkTelegramAccess() {
  if (!tg) {
    throw new Error('Приложение должно быть открыто внутри Telegram');
  }

  if (!tg.initData || typeof tg.initData !== 'string' || !tg.initData.trim()) {
    throw new Error('Telegram initData не найден');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/telegram-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY
    },
    body: JSON.stringify({
      initData: tg.initData
    })
  });

  let result = null;

  try {
    result = await response.json();
  } catch (_) {
    throw new Error('Сервер вернул некорректный ответ');
  }

  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || 'Доступ запрещён');
  }

  return result;
}

// =========================
// LOAD DATA
// =========================
async function loadClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('id', { ascending: false });

  if (error) {
    throw new Error(`Ошибка загрузки клиентов: ${error.message}`);
  }

  console.log('Clients loaded:', data);
  return data;
}

async function loadEvents() {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('day', { ascending: true });

  if (error) {
    throw new Error(`Ошибка загрузки событий: ${error.message}`);
  }

  console.log('Events loaded:', data);
  return data;
}

async function loadUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('id', { ascending: true });

  if (error) {
    throw new Error(`Ошибка загрузки пользователей: ${error.message}`);
  }

  console.log('Users loaded:', data);
  return data;
}

// =========================
// APP START
// =========================
async function startApp() {
  try {
    const authResult = await checkTelegramAccess();

    console.log('Access granted:', authResult);

    // Можешь использовать эти данные дальше в приложении
    window.currentTelegramUser = {
      telegram_id: authResult.telegram_id,
      name: authResult.name
    };

    // Загружаем данные только после успешной проверки
    const [clients, events, users] = await Promise.all([
      loadClients(),
      loadEvents(),
      loadUsers()
    ]);

    // Если у тебя уже есть своя функция рендера интерфейса —
    // просто вызови её здесь
    if (typeof renderApp === 'function') {
      renderApp({ clients, events, users, auth: authResult });
      return;
    }

    // Временный вывод, если renderApp пока нет
    console.log('App data ready:', {
      auth: authResult,
      clients,
      events,
      users
    });
  } catch (error) {
    console.error('App start error:', error);

    const msg = String(error?.message || '');

    if (
      msg.toLowerCase().includes('access denied') ||
      msg.toLowerCase().includes('forbidden') ||
      msg.toLowerCase().includes('доступ запрещ')
    ) {
      showAccessDenied(msg);
      return;
    }

    showFatalError(msg || 'Не удалось запустить приложение');
  }
}

// =========================
// RUN
// =========================
startApp();
