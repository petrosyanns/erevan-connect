const express = require('express');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ADMIN_ID = process.env.ADMIN_ID;

const bot = new Telegraf(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Вспомогательная функция для безопасности Markdown
function escapeMarkdown(text) {
  if (!text) return '';
  return String(text).replace(/[_*`\[\]]/g, '\\$&');
}

// ==========================================
// 1. КОМАНДЫ TELEGRAM БОТА
// ==========================================

bot.start((ctx) => {
  ctx.reply(
    `Привет, ${ctx.from.first_name || 'друг'}! 👋\nНажми кнопку ниже, чтобы открыть приложение досуга:`,
    Markup.inlineKeyboard([
      [Markup.button.webApp('Открыть приложение', process.env.WEBAPP_URL || 'https://erevan-connect.onrender.com')]
    ])
  );
});

// Команда /users с проверкой прав админа и датой регистрации
bot.command('users', async (ctx) => {
  const userId = ctx.from.id;

  // 1. Проверка прав (только для ADMIN_ID)
  if (ADMIN_ID && String(userId) !== String(ADMIN_ID)) {
    return ctx.reply('❌ У вас нет доступа к этой команде.');
  }

  try {
    // 2. Запрос пользователей из Supabase
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) return ctx.reply('👥 Список пользователей пуст.');

    // 3. Форматирование текста
    let message = `👥 *Всего пользователей:* ${data.length}\n\n`;

    data.forEach((u, index) => {
      const username = u.username ? `@${escapeMarkdown(u.username)}` : 'нет username';
      const firstName = escapeMarkdown(u.first_name || 'Без имени');
      const vip = u.is_vip ? ' ⭐ VIP' : '';

      // Форматирование даты
      let dateStr = 'Дата неизвестна';
      if (u.created_at) {
        dateStr = new Date(u.created_at).toLocaleString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }

      message += `${index + 1}. *${firstName}* (${username})${vip}\n`;
      message += `   🆔 \`${u.telegram_id}\` | 📅 ${dateStr}\n\n`;
    });

    // Ограничение длины сообщения Telegram (4096 символов)
    if (message.length > 4000) {
      message = message.substring(0, 4000) + '\n\n...список обрезан из-за лимита длины.';
    }

    ctx.replyWithMarkdown(message);
  } catch (err) {
    console.error('Ошибка /users в боте:', err);
    ctx.reply(`❌ Ошибка получения пользователей: ${err.message}`);
  }
});

// ==========================================
// 2. HTTP ЭНДПОИНТЫ API
// ==========================================

// Получить список категорий
app.get('/api/categories', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Профиль пользователя (сохранение/обновление)
app.post('/api/profile', async (req, res) => {
  const { user_id, username, first_name, language_code } = req.body;
  if (!user_id) return res.status(400).json({ success: false, error: 'user_id обязателен' });

  try {
    const { data: user, error } = await supabase
      .from('users')
      .upsert({
        telegram_id: user_id,
        username,
        first_name,
        language_code: language_code || 'ru'
      }, { onConflict: 'telegram_id' })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Получить ТОЛЬКО ОДОБРЕННЫЕ объявления
app.get('/api/events', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*, categories(id, name_ru, name_en, name_am, icon), users(telegram_id, first_name, username, is_vip)')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error('Ошибка при запросе /api/events:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Создать новое объявление (со статусом 'pending')
app.post('/api/events', async (req, res) => {
  const { user_id, category_id, title, description, location, event_date, max_people } = req.body;

  if (!user_id || !title || !location || !event_date) {
    return res.status(400).json({ success: false, error: 'Заполните обязательные поля!' });
  }

  try {
    // 1. Убедимся, что пользователь есть в базе (для FK)
    await supabase.from('users').upsert({
      telegram_id: user_id,
      first_name: req.body.first_name || 'Пользователь',
      username: req.body.username || ''
    }, { onConflict: 'telegram_id' });

    // 2. Вставляем объявление со статусом 'pending'
    const { data: event, error } = await supabase
      .from('events')
      .insert({
        user_id: user_id,
        category_id: parseInt(category_id) || 1,
        title,
        description: description || '',
        location,
        event_date,
        max_people: parseInt(max_people) || 2,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    // 3. Отправляем уведомление админу
    if (ADMIN_ID) {
      try {
        const textMessage = 
          `📌 *Новое объявление на модерацию!* (#${event.id})\n\n` +
          `📝 *Заголовок:* ${escapeMarkdown(title)}\n` +
          `📖 *Описание:* ${escapeMarkdown(description || 'Нет')}\n` +
          `📍 *Локация:* ${escapeMarkdown(location)}\n` +
          `📅 *Дата:* ${event_date}\n` +
          `👥 *Мест:* ${max_people}\n` +
          `👤 *Автор ID:* \`${user_id}\``;

        await bot.telegram.sendMessage(ADMIN_ID, textMessage, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('✅ Одобрить', `approve_ev_${event.id}`),
              Markup.button.callback('❌ Отклонить', `reject_ev_${event.id}`)
            ]
          ])
        });
      } catch (tgErr) {
        console.error('Ошибка отправки админу:', tgErr.message);
      }
    }

    res.json({ success: true, event });
  } catch (err) {
    console.error('Ошибка при добавлении в БД:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 3. МОДЕРАЦИЯ И ЗАПУСК
// ==========================================

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const userId = ctx.from.id;

  if (ADMIN_ID && String(userId) !== String(ADMIN_ID)) {
    return ctx.answerCbQuery('❌ Нет прав для модерации.', { show_alert: true });
  }

  try {
    if (data.startsWith('approve_ev_')) {
      const id = data.replace('approve_ev_', '');
      
      const { data: event } = await supabase
        .from('events')
        .update({ status: 'approved' })
        .eq('id', id)
        .select()
        .single();

      await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n✅ STATUS: ОДОБРЕНО`);
      await ctx.answerCbQuery('✅ Одобрено!');

      // Отправляем сообщение автору
      if (event?.user_id) {
        try {
          await bot.telegram.sendMessage(event.user_id, `🎉 Ваше объявление *«${escapeMarkdown(event.title)}»* было успешно одобрено и опубликовано!`, { parse_mode: 'Markdown' });
        } catch (e) {
          console.error('Не удалось отправить уведомление пользователю:', e.message);
        }
      }

    } else if (data.startsWith('reject_ev_')) {
      const id = data.replace('reject_ev_', '');
      
      const { data: event } = await supabase
        .from('events')
        .update({ status: 'rejected' })
        .eq('id', id)
        .select()
        .single();

      await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n❌ STATUS: ОТКЛОНЕНО`);
      await ctx.answerCbQuery('❌ Отклонено.');

      // Отправляем сообщение автору
      if (event?.user_id) {
        try {
          await bot.telegram.sendMessage(event.user_id, `😔 Ваше объявление *«${escapeMarkdown(event.title)}»* было отклонено модератором.`, { parse_mode: 'Markdown' });
        } catch (e) {
          console.error('Не удалось отправить уведомление пользователю:', e.message);
        }
      }
    }
  } catch (err) {
    console.error('Ошибка модерации:', err);
    await ctx.answerCbQuery('⚠️ Ошибка БД.', { show_alert: true });
  }
});

bot.launch().then(() => console.log('🤖 Telegram Bot успешно запущен!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Express Сервер работает на порту ${PORT}`));