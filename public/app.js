const tg = window.Telegram.WebApp;
tg.expand();

// Данные пользователя из Telegram (или тестовые для браузера)
const tgUser = tg.initDataUnsafe?.user || {
  id: 12345678,
  first_name: "Тест",
  username: "test_user"
};

document.getElementById('user-name').innerText = tgUser.first_name;

function switchTab(tab) {
  const feedSection = document.getElementById('section-feed');
  const createSection = document.getElementById('section-create');
  const feedBtn = document.getElementById('tab-feed');
  const createBtn = document.getElementById('tab-create');

  if (tab === 'feed') {
    feedSection.classList.remove('hidden');
    createSection.classList.add('hidden');
    feedBtn.className = 'flex-1 py-2 text-center font-medium text-indigo-600 border-b-2 border-indigo-600';
    createBtn.className = 'flex-1 py-2 text-center font-medium text-gray-500';
    loadEvents();
  } else {
    feedSection.classList.add('hidden');
    createSection.classList.remove('hidden');
    createBtn.className = 'flex-1 py-2 text-center font-medium text-indigo-600 border-b-2 border-indigo-600';
    feedBtn.className = 'flex-1 py-2 text-center font-medium text-gray-500';
  }
}

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const categories = await res.json();
    const select = document.getElementById('field-category');
    select.innerHTML = categories.map(c => `<option value="${c.id}">${c.icon} ${c.name_ru}</option>`).join('');
  } catch (e) {
    console.error('Ошибка загрузки категорий', e);
  }
}

async function loadEvents() {
  const container = document.getElementById('events-list');
  try {
    const res = await fetch('/api/events');
    const events = await res.json();

    if (!events.length) {
      container.innerHTML = '<p class="text-center text-gray-400 py-6">Пока нет активных объявлений</p>';
      return;
    }

    container.innerHTML = events.map(e => `
      <div class="bg-white p-4 rounded-xl shadow-sm space-y-2 border-l-4 border-indigo-500">
        <div class="flex justify-between items-start">
          <span class="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
            ${e.categories?.icon || '📍'} ${e.categories?.name_ru || ''}
          </span>
          <span class="text-xs text-gray-400">${new Date(e.event_date).toLocaleString('ru', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <h3 class="font-bold text-gray-900">${e.title}</h3>
        ${e.description ? `<p class="text-sm text-gray-600">${e.description}</p>` : ''}
        <div class="text-xs text-gray-500 flex justify-between pt-1 border-t">
          <span>📍 ${e.location}</span>
          <span>👥 Нужно: ${e.max_people}</span>
        </div>
        <a href="https://t.me/${e.users?.username}" target="_blank" class="block text-center w-full bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold py-2 rounded-lg mt-2">
          Откликнуться (@${e.users?.username || 'профиль'})
        </a>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = '<p class="text-center text-red-400 py-6">Не удалось загрузить данные</p>';
  }
}

async function submitEvent() {
  const data = {
    user: {
      telegram_id: tgUser.id,
      username: tgUser.username,
      first_name: tgUser.first_name
    },
    event: {
      category_id: document.getElementById('field-category').value,
      title: document.getElementById('field-title').value,
      location: document.getElementById('field-location').value,
      description: document.getElementById('field-description').value,
      event_date: document.getElementById('field-date').value || new Date().toISOString(),
      max_people: parseInt(document.getElementById('field-people').value) || 2
    }
  };

  if (!data.event.title || !data.event.location) {
    alert('Заполните заголовок и локацию');
    return;
  }

  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      switchTab('feed');
    } else {
      alert('Ошибка при публикации');
    }
  } catch (e) {
    alert('Ошибка соединения');
  }
}

loadCategories();
loadEvents();