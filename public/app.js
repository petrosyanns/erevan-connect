const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

let currentUser = tg?.initDataUnsafe?.user || {
  id: 123456789,
  first_name: "Тестовый Юзер",
  username: "testuser"
};

let currentLang = 'ru';
let categoriesList = [];
let eventsList = [];
let selectedCategoryId = 'all';

// Переводы интерфейса
const translations = {
  ru: {
    createBtn: "Создать",
    searchPlaceholder: "Поиск встреч...",
    modalTitle: "Новая встреча",
    lblCategory: "Категория",
    lblTitle: "Заголовок *",
    lblDesc: "Описание",
    lblLocation: "Локация / Город *",
    lblDate: "Дата и время *",
    lblMax: "Количество человек",
    btnPublish: "Опубликовать",
    allCategories: "Все категории",
    writeAuthor: "Написать автору"
  },
  en: {
    createBtn: "Create",
    searchPlaceholder: "Search meetups...",
    modalTitle: "New Meetup",
    lblCategory: "Category",
    lblTitle: "Title *",
    lblDesc: "Description",
    lblLocation: "Location / City *",
    lblDate: "Date & Time *",
    lblMax: "Max People",
    btnPublish: "Publish",
    allCategories: "All Categories",
    writeAuthor: "Contact Author"
  },
  am: {
    createBtn: "Ստեղծել",
    searchPlaceholder: "Փնտրել հանդիպումներ...",
    modalTitle: "Նոր հանդիպում",
    lblCategory: "Կատեգորիա",
    lblTitle: "Վերնագիր *",
    lblDesc: "Նկարագրություն",
    lblLocation: "Վայրը / Քաղաքը *",
    lblDate: "Ամսաթիվ և ժամ *",
    lblMax: "Մարդկանց քանակը",
    btnPublish: "Հրապարակել",
    allCategories: "Բոլորը",
    writeAuthor: "Գրել հեղինակին"
  }
};

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', async () => {
  initUser();
  await loadCategories();
  await loadEvents();
  updateUiLanguage();
});

// Сохраняем профиль юзера
async function initUser() {
  const helloEl = document.getElementById('hello');
  if (helloEl) helloEl.textContent = `Привет, ${currentUser.first_name}!`;

  try {
    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        username: currentUser.username,
        first_name: currentUser.first_name,
        language_code: currentUser.language_code || 'ru'
      })
    });
  } catch (err) {
    console.error('Ошибка сохранения профиля:', err);
  }
}

// Загрузка категорий из базы
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const result = await res.json();
    if (result.success) {
      categoriesList = result.data;
      renderCategories();
      populateModalCategories();
    }
  } catch (err) {
    console.error('Ошибка загрузки категорий:', err);
  }
}

// Отрисовка чипсов категорий
function renderCategories() {
  const container = document.getElementById('category-chips');
  if (!container) return;

  const t = translations[currentLang];
  let html = `
    <button onclick="selectCategory('all')" 
      class="px-3 py-1.5 rounded-xl whitespace-nowrap transition text-xs font-medium ${selectedCategoryId === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-zinc-400 hover:bg-slate-700'}">
      ✨ ${t.allCategories}
    </button>
  `;

  categoriesList.forEach(cat => {
    const catName = cat[`name_${currentLang}`] || cat.name_ru;
    const isSelected = selectedCategoryId === String(cat.id);
    html += `
      <button onclick="selectCategory('${cat.id}')" 
        class="px-3 py-1.5 rounded-xl whitespace-nowrap transition text-xs font-medium ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-zinc-400 hover:bg-slate-700'}">
        ${cat.icon} ${catName}
      </button>
    `;
  });

  container.innerHTML = html;
}

function selectCategory(id) {
  selectedCategoryId = String(id);
  renderCategories();
  renderEvents();
}

function populateModalCategories() {
  const select = document.getElementById('event-category');
  if (!select) return;

  select.innerHTML = categoriesList.map(cat => {
    const name = cat[`name_${currentLang}`] || cat.name_ru;
    return `<option value="${cat.id}">${cat.icon} ${name}</option>`;
  }).join('');
}

// Загрузка объявлений
async function loadEvents() {
  try {
    const res = await fetch('/api/events');
    const result = await res.json();
    if (result.success) {
      eventsList = result.data;
      renderEvents();
    }
  } catch (err) {
    console.error('Ошибка загрузки объявлений:', err);
  }
}

// Рендер объявлений в ленту
window.renderEvents = function() {
  const container = document.getElementById('events-list');
  if (!container) return;

  const searchVal = document.getElementById('search')?.value.toLowerCase() || '';
  const filterLoc = document.getElementById('filter-location')?.value || 'all';

  const filtered = eventsList.filter(item => {
    // Фильтр по категории
    if (selectedCategoryId !== 'all' && String(item.category_id) !== selectedCategoryId) return false;
    
    // Фильтр по поиску
    if (searchVal && !item.title.toLowerCase().includes(searchVal) && !(item.description || '').toLowerCase().includes(searchVal)) {
      return false;
    }

    // Фильтр по городу
    if (filterLoc !== 'all' && !item.location.toLowerCase().includes(filterLoc.toLowerCase())) {
      return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-center text-xs text-zinc-500 py-8">Объявлений пока нет</div>`;
    return;
  }

  const t = translations[currentLang];

  container.innerHTML = filtered.map(ev => {
    const cat = ev.categories || {};
    const author = ev.users || {};
    const catName = cat[`name_${currentLang}`] || cat.name_ru || 'Разное';
    const catIcon = cat.icon || '📌';

    const dateStr = new Date(ev.event_date).toLocaleString(currentLang, {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });

    const authorUsername = author.username ? `@${author.username}` : '';
    const tgLink = author.username ? `https://t.me/${author.username}` : `https://t.me/c/${author.telegram_id}`;

    return `
      <div class="glass p-4 rounded-2xl space-y-3 fade-in relative ${ev.is_vip ? 'border border-amber-500/40 bg-amber-500/5' : ''}">
        ${ev.is_vip ? '<span class="absolute top-3 right-3 text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">⭐ VIP</span>' : ''}
        
        <div class="flex items-center gap-2">
          <span class="text-base">${catIcon}</span>
          <span class="text-[11px] font-semibold text-indigo-400">${catName}</span>
        </div>

        <div>
          <h3 class="text-sm font-bold text-white mb-1">${escapeHtml(ev.title)}</h3>
          ${ev.description ? `<p class="text-xs text-zinc-300 leading-relaxed">${escapeHtml(ev.description)}</p>` : ''}
        </div>

        <div class="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 pt-1 border-t border-slate-700/40">
          <span>📍 ${escapeHtml(ev.location)}</span>
          <span>📅 ${dateStr}</span>
          <span>👥 до ${ev.max_people} чел.</span>
        </div>

        <div class="flex items-center justify-between pt-2">
          <div class="text-[11px] text-zinc-400">
            Автор: <span class="text-white font-medium">${escapeHtml(author.first_name || 'Пользователь')}</span> 
            ${authorUsername ? `<span class="text-indigo-400">${authorUsername}</span>` : ''}
          </div>
          <a href="${tgLink}" target="_blank" 
             class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-md transition active:scale-95 flex items-center gap-1">
            <i class="fa-paper-plane text-[10px]"></i> ${t.writeAuthor}
          </a>
        </div>
      </div>
    `;
  }).join('');
};

// Отправка новой формы
window.submitEvent = async function() {
  const category_id = document.getElementById('event-category')?.value;
  const title = document.getElementById('event-title')?.value.trim();
  const description = document.getElementById('event-desc')?.value.trim();
  const location = document.getElementById('event-location')?.value.trim();
  const event_date = document.getElementById('event-date')?.value;
  const max_people = document.getElementById('event-max')?.value;

  if (!title || !location || !event_date) {
    alert('Заполните обязательные поля: Заголовок, Локация и Дата!');
    return;
  }

  const btn = document.getElementById('btn-submit-event');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        first_name: currentUser.first_name,
        username: currentUser.username,
        category_id,
        title,
        description,
        location,
        event_date,
        max_people
      })
    });

    const result = await res.json();
    if (result.success) {
      closeModal();
      // Очистка формы
      document.getElementById('event-title').value = '';
      document.getElementById('event-desc').value = '';
      document.getElementById('event-location').value = '';
      document.getElementById('event-date').value = '';

      await loadEvents(); // Перезагружаем список
    } else {
      alert('Ошибка: ' + result.error);
    }
  } catch (err) {
    console.error('Ошибка отправки:', err);
    alert('Произошла ошибка при отправке!');
  } finally {
    if (btn) btn.disabled = false;
  }
};

// Переключение языков
window.switchLanguage = function() {
  const langs = ['ru', 'en', 'am'];
  const nextIdx = (langs.indexOf(currentLang) + 1) % langs.length;
  currentLang = langs[nextIdx];

  document.getElementById('lang-btn').textContent = currentLang.toUpperCase();
  updateUiLanguage();
  renderCategories();
  populateModalCategories();
  renderEvents();
};

function updateUiLanguage() {
  const t = translations[currentLang];

  const setTxt = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setTxt('txt-create-btn', t.createBtn);
  setTxt('txt-modal-title', t.modalTitle);
  setTxt('lbl-category', t.lblCategory);
  setTxt('lbl-title', t.lblTitle);
  setTxt('lbl-desc', t.lblDesc);
  setTxt('lbl-location', t.lblLocation);
  setTxt('lbl-date', t.lblDate);
  setTxt('lbl-max', t.lblMax);
  setTxt('btn-submit-event', t.btnPublish);

  const searchEl = document.getElementById('search');
  if (searchEl) searchEl.placeholder = t.searchPlaceholder;
}

// Модальное окно
window.openModal = function() {
  document.getElementById('modal')?.classList.remove('hidden');
};

window.closeModal = function() {
  document.getElementById('modal')?.classList.add('hidden');
};

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}