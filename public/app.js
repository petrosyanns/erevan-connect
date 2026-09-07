const tg = window.Telegram?.WebApp;
if (tg) tg.expand();

let allEvents = [];
let categories = [];
let activeCategory = 'all';
let currentLang = 'ru';
let currentUser = null;

// Полный словарь перевода
const dict = {
  ru: {
    hello: "Привет",
    vipBadge: "VIP Участник",
    getVip: "Стать VIP 👑",
    create: "Создать",
    newEvent: "Новая встреча",
    empty: "Встреч не найдено",
    searchPlaceholder: "Поиск встреч или локации...",
    allCats: "Все",
    allFormats: "Все форматы",
    offline: "📍 Офлайн",
    online: "💻 Онлайн",
    allCities: "Все города",
    categoryLabel: "Категория",
    titleLabel: "Заголовок *",
    titlePlaceholder: "Например: Сыграть в настолки",
    descLabel: "Описание",
    descPlaceholder: "Подробности встречи...",
    locationLabel: "Локация / Адрес *",
    locationPlaceholder: "Ереван, кафе / место",
    formatLabel: "Формат",
    dateLabel: "Дата и время *",
    maxLabel: "Количество человек (мест)",
    submitBtn: "Опубликовать (на модерацию)",
    respondBtn: "Откликнуться",
    noDesc: "Без описания",
    timeNotSet: "Время не указано",
    organizer: "Организатор",
    vipTitle: "👑 VIP Объявление"
  },
  en: {
    hello: "Hello",
    vipBadge: "VIP Member",
    getVip: "Get VIP 👑",
    create: "Create",
    newEvent: "New Event",
    empty: "No events found",
    searchPlaceholder: "Search events or location...",
    allCats: "All",
    allFormats: "All formats",
    offline: "📍 Offline",
    online: "💻 Online",
    allCities: "All cities",
    categoryLabel: "Category",
    titleLabel: "Title *",
    titlePlaceholder: "e.g., Board games night",
    descLabel: "Description",
    descPlaceholder: "Event details...",
    locationLabel: "Location / Address *",
    locationPlaceholder: "Yerevan, cafe / place",
    formatLabel: "Format",
    dateLabel: "Date and time *",
    maxLabel: "Number of people (seats)",
    submitBtn: "Publish (for review)",
    respondBtn: "Contact",
    noDesc: "No description",
    timeNotSet: "Time not specified",
    organizer: "Organizer",
    vipTitle: "👑 VIP Event"
  },
  am: {
    hello: "Ողջույն",
    vipBadge: "VIP Մասնակից",
    getVip: "Ստանալ VIP 👑",
    create: "Ստեղծել",
    newEvent: "Նոր հանդիպում",
    empty: "Հանդիպումներ չեն գտնվել",
    searchPlaceholder: "Փնտրել հանդիպում կամ վայր...",
    allCats: "Բոլորը",
    allFormats: "Բոլոր ձևաչափերը",
    offline: "📍 Օֆլայն",
    online: "💻 Օնլայն",
    allCities: "Բոլոր քաղաքները",
    categoryLabel: "Կատեգորիա",
    titleLabel: "Վերնագիր *",
    titlePlaceholder: "Օրինակ՝ Սեղանի խաղեր",
    descLabel: "Նկարագրություն",
    descPlaceholder: "Մանրամասներ...",
    locationLabel: "Վայր / Հասցե *",
    locationPlaceholder: "Երևան, սրճարան",
    formatLabel: "Ձևաչափ",
    dateLabel: "Ամսաթիվ և ժամ *",
    maxLabel: "Մարդկանց քանակ (տեղեր)",
    submitBtn: "Հրապարակել (մոդերացիա)",
    respondBtn: "Գրել",
    noDesc: "Առանց նկարագրության",
    timeNotSet: "Ժամը նշված չէ",
    organizer: "Կազմակերպիչ",
    vipTitle: "👑 VIP Հայտարարություն"
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadCategories();
  
  if (tg?.initDataUnsafe?.user) {
    const user = tg.initDataUnsafe.user;
    currentUser = {
      telegram_id: user.id,
      first_name: user.first_name,
      username: user.username,
      language_code: user.language_code || 'ru',
      is_vip: false // по умолчанию
    };

    const userLang = (user.language_code || 'ru').toLowerCase();
    if (userLang.includes('hy') || userLang.includes('am')) currentLang = 'am';
    else if (userLang.includes('en')) currentLang = 'en';
    else currentLang = 'ru';

    await registerUser(user);
  } else {
    currentUser = { telegram_id: 12345, first_name: 'Гость', username: 'guest', is_vip: true };
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
  
  document.getElementById('hello').innerText = `${t.hello}, ${currentUser?.first_name || ''}!`;
  document.getElementById('lang-btn').innerText = currentLang === 'ru' ? 'EN' : currentLang === 'en' ? 'AM' : 'RU';
  document.getElementById('txt-create-btn').innerText = t.create;
  
  document.getElementById('search').placeholder = t.searchPlaceholder;
  document.getElementById('opt-all-formats').innerText = t.allFormats;
  document.getElementById('opt-offline').innerText = t.offline;
  document.getElementById('opt-online').innerText = t.online;
  document.getElementById('opt-all-cities').innerText = t.allCities;

  // Модальное окно
  document.getElementById('txt-modal-title').innerText = t.newEvent;
  document.getElementById('lbl-category').innerText = t.categoryLabel;
  document.getElementById('lbl-title').innerText = t.titleLabel;
  document.getElementById('event-title').placeholder = t.titlePlaceholder;
  document.getElementById('lbl-desc').innerText = t.descLabel;
  document.getElementById('event-desc').placeholder = t.descPlaceholder;
  document.getElementById('lbl-location').innerText = t.locationLabel;
  document.getElementById('event-location').placeholder = t.locationPlaceholder;
  document.getElementById('lbl-format').innerText = t.formatLabel;
  document.getElementById('lbl-date').innerText = t.dateLabel;
  document.getElementById('lbl-max').innerText = t.maxLabel;
  document.getElementById('btn-submit-event').innerText = t.submitBtn;

  renderCategoriesChips();
  renderCategoriesSelect();
  renderEvents();
}

async function registerUser(tgUser) {
  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: tgUser.id,
        username: tgUser.username,
        first_name: tgUser.first_name,
        language_code: currentLang
      })
    });
    const data = await res.json();
    if (data.success && data.user) {
      currentUser.is_vip = data.user.is_vip || false;
    }
  } catch (err) {
    console.error('Ошибка авторизации:', err);
  }
}

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const result = await res.json();
    if (result.success) {
      // Удаляем дубликаты категорий по имени
      const uniqueCats = [];
      const seenNames = new Set();

      (result.data || []).forEach(c => {
        const nameKey = (c.name_ru || '').trim().toLowerCase();
        if (nameKey && !seenNames.has(nameKey)) {
          seenNames.add(nameKey);
          uniqueCats.push(c);
        }
      });

      categories = uniqueCats;
      renderCategoriesChips();
      renderCategoriesSelect();
    }
  } catch (err) {
    console.error('Ошибка загрузки категорий:', err);
  }
}

function getCategoryName(c) {
  if (!c) return '';
  if (currentLang === 'en') return c.name_en || c.name_ru;
  if (currentLang === 'am') return c.name_am || c.name_ru;
  return c.name_ru;
}

function renderCategoriesChips() {
  const container = document.getElementById('category-chips');
  const t = dict[currentLang] || dict.ru;
  
  let html = `<button onclick="filterCategory('all')" class="cat-btn ${activeCategory === 'all' ? 'bg-indigo-600 text-white shadow-md' : 'glass text-zinc-300'} px-3.5 py-1.5 rounded-xl font-medium whitespace-nowrap text-xs transition">${t.allCats}</button>`;
  
  html += categories.map(c => `
    <button onclick="filterCategory('${c.id}')" class="cat-btn ${String(activeCategory) === String(c.id) ? 'bg-indigo-600 text-white shadow-md' : 'glass text-zinc-300'} px-3.5 py-1.5 rounded-xl font-medium whitespace-nowrap text-xs transition">
      ${c.icon || '📌'} ${getCategoryName(c)}
    </button>
  `).join('');

  container.innerHTML = html;
}

function renderCategoriesSelect() {
  const select = document.getElementById('event-category');
  if (!select) return;
  select.innerHTML = categories.map(c => `<option value="${c.id}">${c.icon || '📌'} ${getCategoryName(c)}</option>`).join('');
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
  const t = dict[currentLang] || dict.ru;

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
        <div class="text-xs text-zinc-400">${t.empty}</div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(ev => {
    const categoryName = ev.categories ? `${ev.categories.icon || '📌'} ${getCategoryName(ev.categories)}` : '🔥';
    const dateStr = ev.event_date ? new Date(ev.event_date).toLocaleString(currentLang === 'am' ? 'hy-AM' : currentLang, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : t.timeNotSet;
    
    // Проверка VIP статуса автора встречи
    const isVip = ev.users?.is_vip || ev.is_vip || false;

    return `
      <div class="glass rounded-[22px] p-4 relative fade-in ${isVip ? 'border-2 border-amber-400/80 bg-amber-500/5 shadow-lg shadow-amber-500/10' : ''}">
        
        ${isVip ? `
          <div class="absolute -top-3 right-4 bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-[10px] px-2.5 py-0.5 rounded-full shadow-md flex items-center gap-1">
            <span>👑</span> VIP
          </div>
        ` : ''}

        <div class="flex items-start justify-between gap-2 mb-2">
          <div>
            <span class="text-[10px] font-bold ${isVip ? 'text-amber-400' : 'text-indigo-400'} uppercase tracking-wider">${categoryName}</span>
            <h3 class="text-sm font-extrabold text-white mt-0.5">${escapeHtml(ev.title)}</h3>
          </div>
        </div>

        <p class="text-xs text-zinc-300 line-clamp-2 mb-3">${escapeHtml(ev.description || t.noDesc)}</p>

        <div class="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 mb-3">
          <div class="flex items-center gap-1 text-rose-400">
            <i class="fa-solid fa-location-dot"></i>
            <span class="truncate max-w-[130px]">${escapeHtml(ev.location)}</span>
          </div>
          <div class="flex items-center gap-1 text-indigo-300">
            <i class="fa-regular fa-clock"></i>
            <span>${dateStr}</span>
          </div>
          <div class="flex items-center gap-1 text-emerald-400">
            <i class="fa-solid fa-users"></i>
            <span>${ev.max_people || 2} чел.</span>
          </div>
        </div>

        <div class="pt-3 border-t border-white/5 flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-bold text-zinc-200">${escapeHtml(ev.users?.first_name || t.organizer)}</span>
            ${isVip ? '<span class="text-[10px] text-amber-400">👑</span>' : ''}
          </div>
          <a href="https://t.me/${ev.users?.username || ''}" target="_blank" 
             class="${isVip ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300' : 'bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300'} text-[11px] font-bold px-3 py-1.5 rounded-xl transition">
            ${t.respondBtn}
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
        max_people,
        is_vip: currentUser.is_vip || false
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