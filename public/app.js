// 1. Инициализация Telegram SDK с фоллбэком для браузера
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// Получаем пользователя или ставим тестовые данные, если открыто в браузере
const user = tg?.initDataUnsafe?.user || {
  telegram_id: 12345678,
  username: 'test_user',
  first_name: 'Ереванец'
};

document.getElementById('user-name').innerText = user.first_name;

// 2. Переключение вкладок
function switchTab(tab) {
  const feedSec = document.getElementById('section-feed');
  const createSec = document.getElementById('section-create');
  const tabFeed = document.getElementById('tab-feed');
  const tabCreate = document.getElementById('tab-create');

  if (tab === 'feed') {
    feedSec.classList.remove('hidden');
    createSec.classList.add('hidden');
    tabFeed.className = 'flex-1 py-2 text-center font-medium text-indigo-600 border-b-2 border-indigo-600';
    tabCreate.className = 'flex-1 py-2 text-center font-medium text-gray-500';
    loadEvents();
  } else {
    feedSec.classList.add('hidden');
    createSec.classList.remove('hidden');
    tabCreate.className = 'flex-1 py-2 text-center font-medium text-indigo-600 border-b-2 border-indigo-600';
    tabFeed.className = 'flex-1 py-2 text-center font-medium text-gray-500';
    loadCategories();
  }
}

// 3. Загрузка категорий
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const categories = await res.json();
    const select = document.getElementById('field-category');
    select.innerHTML = categories.map(c => `<option value="${c.id}">${c.icon || ''} ${c.name_ru}</option>`).join('');
  } catch (err) {
    console.error('Ошибка загрузки категорий:', err);
  }
}

// 4. Загрузка объявлений
async function loadEvents() {
  const list = document.getElementById('events-list');
  try {
    const res = await fetch('/api/events');
    const events = await res.json();

    if (!events.length) {
      list.innerHTML = '<p class="text-center text-gray-400 py-6">Пока нет объявлений. Будьте первыми!</p>';
      return;
    }

    list.innerHTML = events.map(e => `
      <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-2">
        <div class="flex justify-between items-start">
          <span class="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md font-medium">
            ${e.categories?.icon || '📌'} ${e.categories?.name_ru || 'Общее'}
          </span>
          <span class="text-xs text-gray-400">${new Date(e.event_date).toLocaleString('ru-RU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <h3 class="font-bold text-gray-800">${e.title}</h3>
        <p class="text-sm text-gray-600">${e.description || ''}</p>
        <div class="flex justify-between items-center text-xs text-gray-500 pt-2 border-t border-gray-50">
          <span>📍 ${e.location}</span>
          <span>👥 Нужно: ${e.max_people} чел.</span>
        </div>
        ${e.users?.username ? `
          <a href="https://t.me/${e.users.username}" target="_blank" class="block text-center w-full bg-indigo-50 text-indigo-600 font-medium py-1.5 rounded-lg text-xs mt-2 hover:bg-indigo-100 transition">
            Написать @${e.users.username}
          </a>
        ` : ''}
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = '<p class="text-center text-red-500 py-6">Не удалось загрузить объявления</p>';
  }
}

// 5. Отправка формы
async function submitEvent() {
  const eventData = {
    category_id: document.getElementById('field-category').value,
    title: document.getElementById('field-title').value,
    location: document.getElementById('field-location').value,
    description: document.getElementById('field-description').value,
    event_date: document.getElementById('field-date').value,
    max_people: parseInt(document.getElementById('field-people').value)
  };

  if (!eventData.title || !eventData.location || !eventData.event_date) {
    alert('Заполните заголовок, локацию и дату!');
    return;
  }

  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, event: eventData })
    });

    const result = await res.json();
    if (result.success) {
      alert('Объявление опубликовано!');
      switchTab('feed');
    } else {
      alert('Ошибка при сохранении: ' + result.error);
    }
  } catch (err) {
    alert('Ошибка сети при отправке!');
  }
}

// Запуск при старте
loadEvents();