const express = require('express');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Разрешаем CORS и включаем парсеры тела запросов
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

bot.command('users', async (ctx) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) return ctx.reply('👥 Список пользователей пуст.');

    let message = `👥 *Всего пользователей:* ${data.length}\n\n`;
    data.forEach((u, index) => {
      const username = u.username ? `@${u.username}` : 'нет username';
      message += `${index + 1}. *${u.first_name || 'Без имени'}* (${username}) — \`${u.telegram_id}\`\n`;
    });

    if (message.length > 4000) message = message.substring(0, 4000) + '\n\n...список обрезан.';
    ctx.replyWithMarkdown(message);
  } catch (err) {
    console.error('Ошибка /users в боте:', err);
    ctx.reply(`❌ Ошибка получения пользователей: ${err.message}`);
  }
});

// ==========================================
// 2. HTTP ЭНДПОИНТЫ (API)
// ==========================================

// Сохранение/обновление профиля при входе в Web App
app.post('/api/profile', async (req, res) => {
  const { user_id, username, first_name, language_code } = req.body;
  if (!user_id) return res.status(400).json({ success: false, error: 'User ID обязателен' });

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

// Получить все одобренные встречи + участников
app.get('/api/events', async (req, res) => {
  try {
    // Включаем статус 'pending' и 'approved', если хотите видеть встречи сразу при тесте:
    const { data, error } = await supabase
      .from('events')
      .select('*, event_participants(user_id, user_name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    console.error('Ошибка получения событий:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Создание нового события
app.post('/api/events', async (req, res) => {
  const { 
    user_id, 
    title, 
    description, 
    category, 
    location, 
    format, 
    event_date, 
    max_people, 
    created_by_name, 
    created_by_username 
  } = req.body;

  try {
    const { data: event, error } = await supabase
      .from('events')
      .insert({
        created_by_id: user_id || 0,
        title,
        description: description || '',
        category: category || 'Разное',
        location,
        format: format || 'offline',
        event_date,
        max_participants: parseInt(max_people) || 2,
        created_by_name: created_by_name || 'Аноним',
        created_by_username: created_by_username || '',
        status: 'approved' // Авто-одобрение для мгновенного отображения (или 'pending')
      })
      .select()
      .single();

    if (error) throw error;

    // Уведомление модератору в Telegram
    if (ADMIN_ID) {
      try {
        const textMessage = 
          `📌 *Новое объявление!* (#${event.id})\n\n` +
          `📝 *Заголовок:* ${title}\n` +
          `📍 *Локация:* ${location}\n` +
          `📅 *Дата:* ${event_date}\n` +
          `👤 *Автор:* ${created_by_name} (@${created_by_username})`;

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
        console.error(' Ошибка отправки уведомления админу:', tgErr.message);
      }
    }

    res.json({ success: true, event });
  } catch (err) {
    console.error('Ошибка создания события:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Присоединиться к встрече / Отменить запись
app.post('/api/events/:id/join', async (req, res) => {
  const eventId = req.params.id;
  const { user_id, user_name } = req.body;

  if (!user_id) return res.status(400).json({ success: false, error: 'User ID обязателен' });

  try {
    // Проверяем, записан ли уже
    const { data: existing } = await supabase
      .from('event_participants')
      .select('*')
      .eq('event_id', eventId)
      .eq('user_id', user_id)
      .maybeSingle();

    if (existing) {
      // Отписываем
      await supabase
        .from('event_participants')
        .delete()
        .eq('event_id', eventId)
        .eq('user_id', user_id);

      return res.json({ success: true, joined: false, message: 'Вы отменили запись' });
    } else {
      // Записываем
      const { error } = await supabase
        .from('event_participants')
        .insert([{ event_id: eventId, user_id, user_name: user_name || 'Участник' }]);

      if (error) throw error;
      return res.json({ success: true, joined: true, message: 'Вы успешно записались!' });
    }
  } catch (err) {
    console.error('Ошибка записи на встречу:', err);
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
    return ctx.answerCbQuery('❌ У вас нет прав для модерации.', { show_alert: true });
  }

  try {
    if (data.startsWith('approve_ev_')) {
      const id = data.replace('approve_ev_', '');
      await supabase.from('events').update({ status: 'approved' }).eq('id', id);
      await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n✅ STATUS: ОДОБРЕНО`);
      await ctx.answerCbQuery('✅ Объявление одобрено!');
    } else if (data.startsWith('reject_ev_')) {
      const id = data.replace('reject_ev_', '');
      await supabase.from('events').update({ status: 'rejected' }).eq('id', id);
      await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n❌ STATUS: ОТКЛОНЕНО`);
      await ctx.answerCbQuery('❌ Объявление отклонено.');
    }
  } catch (err) {
    console.error('Ошибка модерации:', err);
    await ctx.answerCbQuery('⚠️ Ошибка базы данных.', { show_alert: true });
  }
});

// Безопасный запуск бота и сервера
bot.launch().then(() => console.log('🤖 Telegram Bot успешно запущен!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Express Сервер работает на порту ${PORT}`));