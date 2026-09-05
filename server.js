const express = require('express');
const path = require('path');
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// Поддержка сериализации BigInt в JSON (защита от падения Express при BigInt ID)
BigInt.prototype.toJSON = function() { return this.toString(); };

// 1. Инициализация Express
const app = express();
app.use(express.json());

// 2. Инициализация Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || 'placeholder-key';

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: 'public' }
});

const MY_TELEGRAM_ID = '766669940';

// 3. Раздача статических файлов из public/
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// API ЭНДПОИНТЫ ДЛЯ MINI APP
// ==========================================

// Получение списка категорий
app.get('/api/categories', async (req, res) => {
  try {
    const { data, error } = await supabase.from('categories').select('*');
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Получение только ОДОБРЕННЫХ событий для ленты
app.get('/api/events', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*, users(first_name, username)')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Создание нового объявления из Mini App (отправка на модерацию)
app.post('/api/events', async (req, res) => {
  try {
    const { user_id, category_id, title, description, location, event_date, max_people } = req.body;

    if (!user_id || !title || !location) {
      return res.status(400).json({ success: false, error: 'Заполните обязательные поля (Заголовок и Локацию)' });
    }

    const userIdBigInt = BigInt(user_id);

    // Гарантируем, что пользователь существует в базе
    await supabase.from('users').upsert({
      telegram_id: userIdBigInt,
      first_name: 'Пользователь',
      username: ''
    }, { onConflict: 'telegram_id' });

    const validDate = event_date ? new Date(event_date).toISOString() : new Date().toISOString();

    const insertPayload = {
      user_id: userIdBigInt,
      title: title.trim(),
      description: description ? description.trim() : '',
      location: location.trim(),
      event_date: validDate,
      max_people: parseInt(max_people) || 2,
      status: 'pending' // Статус ожидания модерации
    };

    if (category_id) {
      insertPayload.category_id = parseInt(category_id);
    }

    const { data, error } = await supabase
      .from('events')
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      console.error('Ошибка записи в Supabase:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    // Уведомляем администратора о новом объявлении
    if (bot) {
      try {
        await notifyAdminForModeration(data);
      } catch (modErr) {
        console.error('Ошибка отправки на модерацию:', modErr);
      }
    }

    res.json({ success: true, message: 'Объявление отправлено на модерацию!', data });
  } catch (err) {
    console.error('Критическая ошибка /api/events:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 4. ТЕЛЕГРАМ БОТ (TELEGRAF)
// ==========================================
const token = process.env.BOT_TOKEN;
let bot = null;

if (token) {
  bot = new Telegraf(token);

  // Команда /start (поддерживает обычный запуск и переход к чату по объявлению)
  bot.command('start', async (ctx) => {
    const user = ctx.from;
    const firstName = user.first_name ? user.first_name.replace(/[*_`\[\]]/g, '') : 'друг';
    const startParam = ctx.message.text.split(' ')[1];

    // 1. Авто-регистрация / обновление пользователя
    try {
      await supabase.from('users').upsert({
        telegram_id: BigInt(user.id),
        first_name: user.first_name || '',
        username: user.username || '',
        language_code: user.language_code || 'ru'
      }, { onConflict: 'telegram_id' });
    } catch (dbErr) {
      console.error('Ошибка авто-регистрации пользователя в Supabase:', dbErr);
    }

    // 2. Если переход по ссылке «Написать автору»: /start chat_EVENTID
    if (startParam && startParam.startsWith('chat_')) {
      const eventId = startParam.replace('chat_', '');
      const { data: event } = await supabase.from('events').select('*').eq('id', eventId).single();

      if (!event) return ctx.reply('⚠️ Объявление не найдено или было удалено.');
      if (event.user_id.toString() === user.id.toString()) {
        return ctx.reply('ℹ️ Вы являетесь автором этого объявления.');
      }

      return ctx.reply(
        `💬 *Связь с автором объявления: "${event.title}"*\n\n` +
        `Отправьте ваше сообщение прямо сюда. Бот передаст его автору анонимно.\n\n` +
        `_ID события: #${event.id}_`,
        { parse_mode: 'Markdown', reply_markup: { force_reply: true } }
      );
    }

    // Стандартное приветствие
    const welcomeMessage = 
      `✨ *Привет, ${firstName}! Добро пожаловать в Erevan Connect!*\n\n` +
      `Твой главный проводник по встречам, спорту и событиям в Ереване 🇦🇲\n\n` +
      `Находи компанию для кофе в Кентроне, +1 на футбол или партнеров для проектов в пару кликов!`;

    const webAppUrl = process.env.WEBAPP_URL || 'https://erevan-connect.onrender.com';

    ctx.replyWithMarkdown(welcomeMessage, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Открыть Erevan Connect', web_app: { url: webAppUrl } }],
          [
            { text: '📢 Наш Канал', url: 'https://t.me/erevan_connect' },
            { text: '💬 Поддержка', url: 'https://t.me/erevan_connect_support' }
          ]
        ]
      }
    });
  });

  // Команда /users (Админ)
  bot.command('users', async (ctx) => {
    if (ctx.from.id.toString() !== MY_TELEGRAM_ID) {
      return ctx.reply('⛔️ Доступ ограничен. Эта команда только для администратора.');
    }
    await sendAdminReport(ctx);
  });

  // Обработка кнопки обновления
  bot.action('admin_refresh', async (ctx) => {
    if (ctx.from.id.toString() !== MY_TELEGRAM_ID) return;
    await sendAdminReport(ctx, true);
    try {
      await ctx.answerCbQuery('Данные обновлены! 🚀');
    } catch (e) {}
  });

  // МОДЕРАЦИЯ: Обработка кнопки "Одобрить"
  bot.action(/^approve_(\d+)$/, async (ctx) => {
    if (ctx.from.id.toString() !== MY_TELEGRAM_ID) return;
    const eventId = ctx.match[1];

    const { data: event, error } = await supabase
      .from('events')
      .update({ status: 'approved' })
      .eq('id', eventId)
      .select()
      .single();

    if (!error && event) {
      await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n✅ *ОДОБРЕНО И ОПУБЛИКОВАНО*`, { parse_mode: 'Markdown' });
      try {
        await bot.telegram.sendMessage(event.user_id.toString(), `🎉 Ваше объявление *"${event.title}"* прошло модерацию и опубликовано!`, { parse_mode: 'Markdown' });
      } catch (e) {}
    }
  });

  // МОДЕРАЦИЯ: Обработка кнопки "Отклонить"
  bot.action(/^reject_(\d+)$/, async (ctx) => {
    if (ctx.from.id.toString() !== MY_TELEGRAM_ID) return;
    const eventId = ctx.match[1];

    const { data: event, error } = await supabase
      .from('events')
      .update({ status: 'rejected' })
      .eq('id', eventId)
      .select()
      .single();

    if (!error && event) {
      await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n❌ *ОТКЛОНЕНО*`, { parse_mode: 'Markdown' });
      try {
        await bot.telegram.sendMessage(event.user_id.toString(), `😔 Ваше объявление *"${event.title}"* не прошло модерацию.`, { parse_mode: 'Markdown' });
      } catch (e) {}
    }
  });

  // АНОНИМНЫЕ СООБЩЕНИЯ: Пересылка сообщений между пользователями
  bot.on('message', async (ctx) => {
    const replyTo = ctx.message.reply_to_message;
    if (!replyTo || !replyTo.text) return;

    // Проверяем, если пользователь отвечает на сообщение о связях
    const match = replyTo.text.match(/ID события: #(\d+)/);
    if (match) {
      const eventId = match[1];
      const { data: event } = await supabase.from('events').select('*').eq('id', eventId).single();

      if (event) {
        // Сохраняем сообщение в базу
        await supabase.from('messages').insert([{
          event_id: event.id,
          sender_id: BigInt(ctx.from.id),
          receiver_id: BigInt(event.user_id),
          text: ctx.message.text
        }]);

        // Отправляем сообщение автору объявления
        try {
          await bot.telegram.sendMessage(
            event.user_id.toString(),
            `📩 *Новый отклик на ваше объявление "${event.title}":*\n\n` +
            `"${ctx.message.text}"\n\n` +
            `_Чтобы ответить, используйте юзернейм: @${ctx.from.username || 'скрыт'}_`,
            { parse_mode: 'Markdown' }
          );
          await ctx.reply('✅ Ваше сообщение успешно отправлено автору!');
        } catch (err) {
          await ctx.reply('⚠️ Не удалось доставить сообщение автору (возможно, бот заблокирован).');
        }
      }
    }
  });

  // Запуск бота
  bot.launch().then(() => console.log('✅ Telegram Bot успешно запущен (Telegraf)')).catch(err => {
    console.error('❌ Ошибка запуска бота:', err.message);
  });
} else {
  console.error('❌ BOT_TOKEN не задан в переменных окружения.');
}

// Функция отправки уведомления администратору на модерацию
async function notifyAdminForModeration(event) {
  const message = 
    `🆕 *Новое объявление на модерацию! (ID: ${event.id})*\n` +
    `═══════════════════\n` +
    `📌 *Заголовок:* ${event.title}\n` +
    `📝 *Описание:* ${event.description || 'Без описания'}\n` +
    `📍 *Локация:* ${event.location}\n` +
    `📅 *Дата:* ${new Date(event.event_date).toLocaleString('ru-RU')}\n` +
    `👤 *Автор ID:* \`${event.user_id}\``;

  await bot.telegram.sendMessage(MY_TELEGRAM_ID, message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Одобрить', callback_data: `approve_${event.id}` },
          { text: '❌ Отклонить', callback_data: `reject_${event.id}` }
        ]
      ]
    }
  });
}

// Функция формирования админ-отчета
async function sendAdminReport(ctx, isEdit = false) {
  try {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (usersError) throw usersError;

    let eventsCount = 0;
    try {
      const { count, error: eventsError } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true });
      if (!eventsError) eventsCount = count || 0;
    } catch (e) {}

    const totalUsers = users ? users.length : 0;
    const usersWithUsername = users ? users.filter(u => u.username).length : 0;
    const now = new Date();
    const last24h = users ? users.filter(u => u.created_at && (now - new Date(u.created_at)) < (24 * 60 * 60 * 1000)).length : 0;

    let message = `📊 *Erevan Connect | Dashboard*\n`;
    message += `═══════════════════\n`;
    message += `👥 *Всего участников:* \`${totalUsers}\`\n`;
    message += `🔥 *Прирост за 24ч:* \`+${last24h}\`\n`;
    message += `🎉 *Всего событий:* \`${eventsCount}\`\n`;
    message += `💬 *С юзернеймом:* \`${usersWithUsername}/${totalUsers}\`\n`;
    message += `═══════════════════\n\n`;
    message += `📋 *Свежие регистрации:*\n\n`;

    const recentUsers = users ? users.slice(0, 10) : [];
    if (recentUsers.length === 0) {
      message += `_Пока нет зарегистрированных пользователей_\n`;
    } else {
      recentUsers.forEach((u, index) => {
        const name = u.first_name ? u.first_name.replace(/[*_`\[\]]/g, '') : 'Без имени';
        const username = u.username ? `@${u.username.replace(/[*_`\[\]]/g, '')}` : '❌ *нет юзернейма*';
        const date = u.created_at ? new Date(u.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '--.--';
        message += `${index + 1}. *${name}* | ${username} \`[${date}]\`\n`;
      });
    }

    const webAppUrl = process.env.WEBAPP_URL || 'https://erevan-connect.onrender.com';
    const extra = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Обновить данные', callback_data: 'admin_refresh' }],
          [{ text: '🌐 Открыть Mini App', web_app: { url: webAppUrl } }]
        ]
      }
    };

    if (isEdit) {
      try {
        await ctx.editMessageText(message, extra);
      } catch (editErr) {
        if (editErr.description && editErr.description.includes('message is not modified')) {
          return;
        }
        throw editErr;
      }
    } else {
      await ctx.reply(message, extra);
    }
  } catch (err) {
    console.error('Ошибка админ-отчета (детали):', err);
    const details = err.message || JSON.stringify(err);
    const errorMsg = `⚠️ *Ошибка при формировании отчета.*\n\n*Детали:* \`${details}\``;
    
    if (isEdit) {
      try { await ctx.editMessageText(errorMsg, { parse_mode: 'Markdown' }); } catch (e) {}
    } else {
      await ctx.reply(errorMsg, { parse_mode: 'Markdown' });
    }
  }
}

// 5. Маршрут для отдачи Mini App
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 6. Запуск сервера Express
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});