const tg = window.Telegram?.WebApp;
if (tg) tg.expand();

let allEvents = [];
let categories = [];
let activeCategory = 'all';
let currentLang = 'ru';
let currentUser = null;

const dict = {
  ru: { hello: "Привет", create: "Создать", newEvent: "Новая встреча", empty: "Встреч не найдено" },
  en: { hello: "Hello", create: "Create", newEvent: "New Event", empty: "No events found" },
  am: { hello: "Ողջույն", create: "Ստեղծել", newEvent: "Նոր հանդիպում", empty: "Գրառումներ չկան" }
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadCategories();
  
  if (tg?.initDataUnsafe?.user) {
    const user = tg.initDataUnsafe.user;
    currentUser = {
      telegram_id: user.id,
      first_name: user.first_name,
      username: user.username,
      language_code: user.language_code || 'ru'
    };
    currentLang = ['ru', 'en', 'am'].includes(user.language_code) ? user.language_code : 'ru';
    await registerUser(user);
  } else {
    currentUser = { telegram_id: 12345, first_name: 'Гость', username: 'guest' };
  }

  updateUIStrings();
  loadEvents();
});

function switchLanguage() {
  const langs = ['ru', 'en', 'am'];
  const nextIdx = (langs.indexOf(currentLang) + 1) % langs.length;
  currentLang = langs[nextIdx];
  updateUIStrings();
}

function updateUIStrings() {
  const t = dict[currentLang] || dict.ru;
  document.getElementById('hello').innerText = `${t.hello}, ${currentUser?.first_name || 'Друг'}!`;
  document.getElementById('lang-indicator').innerText = `Язык: ${currentLang.toUpperCase()}`;
  document.getElementById('lang-btn').innerText = currentLang === 'ru' ? 'EN' : currentLang === 'en' ? 'AM' : 'RU';
  document.getElementById('txt-create-btn').innerText = t.create;
  document.getElementById('txt-modal-title').innerText = t.newEvent;
  renderEvents();
}

async function registerUser(tgUser) {
  try {
    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: tgUser.id,
        username: tgUser.username,
        first_name: tgUser.first_name,
        language_code: tgUser.language_code || 'ru'
      })
    });
  } catch (err) {
    console.error('Ошибка авторизации:', err);
  }
}

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const result = await res.json();
    if (result.success) {
      categories = result.data;
      renderCategoriesChips();
      renderCategoriesSelect();
    }
  } catch (err) {
    console.error('Ошибка загрузки категорий:', err);
  }
}

function renderCategoriesChips() {
  const container = document.getElementById('category-chips');
  let html = `<button onclick="filterCategory('all')" class="cat-btn ${activeCategory === 'all' ? 'bg-indigo-600 text-white' : 'glass text-zinc-300'} px-3 py-1.5 rounded-xl font-medium whitespace-nowrap">Все</button>`;
  
  html += categories.map(c => `
    <button onclick="filterCategory('${c.id}')" class="cat-btn ${String(activeCategory) === String(c.id) ? 'bg-indigo-600 text-white' : 'glass text-zinc-300'} px-3 py-1.5 rounded-xl font-medium whitespace-nowrap">
      ${c.icon} ${c.name_ru}
    </button>
  `).join('');

  container.innerHTML = html;
}

function renderCategoriesSelect() {
  const select = document.getElementById('event-category');
  if (!select) return;
  select.innerHTML = categories.map(c => `<option value="${c.id}">${c.icon} ${c.name_ru}</option>`).join('');
}

function filterCategory(catId) {
  activeCategory = catId;
  renderCategoriesChips();
  renderEvents();
}

async function loadEvents() {
  try {
    const res = await fetch('/api/events');
    const result = await res.json();

    if (result.success) {
      allEvents = result.data || [];
      renderEvents();
    }
  } catch (err) {
    document.getElementById('events-list').innerHTML = `<div class="text-center text-xs text-rose-400 py-4">Ошибка загрузки</div>`;
  }
}

function renderEvents() {
  const container = document.getElementById('events-list');
  const search = document.getElementById('search').value.toLowerCase();
  const formatFilter = document.getElementById('filter-format').value;
  const locationFilter = document.getElementById('filter-location').value;

  const filtered = allEvents.filter(ev => {
    const matchSearch = ev.title.toLowerCase().includes(search) || 
                        (ev.description && ev.description.toLowerCase().includes(search)) ||
                        ev.location.toLowerCase().includes(search);
    
    const matchCategory = activeCategory === 'all' || String(ev.category_id) === String(activeCategory);
    
    const matchFormat = formatFilter === 'all' || 
      (formatFilter === 'online' && ev.location.toLowerCase().includes('онлайн')) ||
      (formatFilter === 'offline' && !ev.location.toLowerCase().includes('онлайн'));

    const matchLocation = locationFilter === 'all' || ev.location.toLowerCase().includes(locationFilter.toLowerCase());

    return matchSearch && matchCategory && matchFormat && matchLocation;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="glass rounded-2xl p-8 text-center fade-in">
        <div class="text-xs text-zinc-400">${dict[currentLang]?.empty || 'Встреч не найдено'}</div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(ev => {
    const categoryName = ev.categories ? `${ev.categories.icon} ${ev.categories.name_ru}` : '🔥 Встреча';
    const dateStr = ev.event_date ? new Date(ev.event_date).toLocaleString('ru', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Время не указано';

    return `
      <div class="glass rounded-[22px] p-4 relative fade-in">
        <div class="flex items-start justify-between gap-2 mb-2">
          <div>
            <span class="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">${categoryName}</span>
            <h3 class="text-sm font-extrabold text-white mt-0.5">${escapeHtml(ev.title)}</h3>
          </div>
        </div>

        <p class="text-xs text-zinc-300 line-clamp-2 mb-3">${escapeHtml(ev.description || 'Без описания')}</p>

        <div class="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 mb-3">
          <div class="flex items-center gap-1 text-rose-400">
            <i class="fa-solid fa-location-dot"></i>
            <span class="truncate max-w-[120px]">${escapeHtml(ev.location)}</span>
          </div>
          <div class="flex items-center gap-1 text-indigo-300">
            <i class="fa-regular fa-clock"></i>
            <span>${dateStr}</span>
          </div>
        </div>

        <div class="pt-3 border-t border-white/5 flex items-center justify-between">
          <span class="text-xs font-bold text-zinc-300">${escapeHtml(ev.users?.first_name || 'Организатор')}</span>
          <a href="https://t.me/${ev.users?.username || ''}" target="_blank" 
             class="bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-[11px] font-bold px-3 py-1.5 rounded-xl transition">
            Откликнуться
          </a>
        </div>
      </div>
    `;
  }).join('');
}

async function submitEvent() {
  const title = document.getElementById('event-title').value.trim();
  const description = document.getElementById('event-desc').value.trim();
  const location = document.getElementById('event-location').value.trim();
  const event_date = document.getElementById('event-date').value;
  const max_people = document.getElementById('event-max').value;
  const category_id = document.getElementById('event-category').value;

  if (!title || !location || !event_date) {
    alert('Заполните обязательные поля');
    return;
  }

  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.telegram_id,
        category_id,
        title,
        description,
        location,
        event_date,
        max_people
      })
    });

    const data = await res.json();
    if (data.success) {
      alert('⏳ Объявление отправлено на модерацию!');
      closeModal();
      loadEvents();
    }
  } catch (err) {
    alert('Ошибка при создании встречи');
  }
}

function openModal() { document.getElementById('modal').classList.remove('hidden'); }
function closeModal() { document.getElementById('modal').classList.add('hidden'); }
function escapeHtml(text) { return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }