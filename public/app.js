// Замените только функцию loadEvents в вашей app.js:
async function loadEvents() {
  const list = document.getElementById('events-list');
  try {
    const res = await fetch('/api/events');
    const events = await res.json();

    if (!events.length) {
      list.innerHTML = `
        <div class="glass-card p-8 rounded-2xl text-center space-y-2">
          <div class="text-3xl">🇦🇲</div>
          <p class="text-sm font-semibold text-slate-300">Пока нет объявлений</p>
          <p class="text-xs text-slate-500">Будьте первым, кто создаст встречу!</p>
        </div>
      `;
      return;
    }

    list.innerHTML = events.map(e => `
      <div class="glass-card p-4 rounded-2xl space-y-3 hover:border-indigo-500/30 transition-all">
        <div class="flex justify-between items-center">
          <span class="text-[11px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-1 rounded-lg flex items-center space-x-1.5">
            <span>${e.categories?.icon || '📌'}</span>
            <span>${e.categories?.name_ru || 'Событие'}</span>
          </span>
          <span class="text-[11px] font-medium text-slate-400">
            <i class="fa-regular fa-clock mr-1"></i>
            ${new Date(e.event_date).toLocaleString('ru-RU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div>
          <h3 class="font-bold text-slate-100 text-base leading-snug">${e.title}</h3>
          ${e.description ? `<p class="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">${e.description}</p>` : ''}
        </div>

        <div class="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-white/5">
          <div class="flex items-center space-x-1">
            <i class="fa-solid fa-location-dot text-indigo-400 text-xs"></i>
            <span class="truncate max-w-[150px]">${e.location}</span>
          </div>
          <div class="flex items-center space-x-1 font-medium text-slate-300">
            <i class="fa-solid fa-users text-xs text-indigo-400"></i>
            <span>Нужно: ${e.max_people}</span>
          </div>
        </div>

        ${e.users?.username ? `
          <a href="https://t.me/${e.users.username}" target="_blank" class="btn-gradient w-full py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center space-x-2 mt-2">
            <i class="fa-brands fa-telegram text-sm"></i>
            <span>Написать @${e.users.username}</span>
          </a>
        ` : ''}
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `
      <div class="glass-card p-6 rounded-2xl text-center text-rose-400 text-xs">
        Не удалось загрузить данные. Проверьте соединение.
      </div>
    `;
  }
}