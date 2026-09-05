const express = require('express');
const path = require('path');
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// Поддержка сериализации BigInt в JSON
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

// 3. Раздача статических файлов
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// API ЭНДПОИНТЫ ДЛЯ МOДЕРАЦИИ ПРОФИЛЯ
// ==========================================

// Получение статуса профиля пользователя
app.get('/api/profile/status', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ success: false, error: 'User ID обязателен' });

    const { data: user, error } = await supabase
      .from('users')
      .select('profile_status, first_name, age, photo_url')
      .eq('telegram_id', BigInt(user_id))
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });
    if (!user) return res.json({ success: true, status: 'not_found' });

    res.json({ success: true, status: user.profile_status || 'pending', user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Отправка анкета/профиля на модерацию
app.post('/api/profile', async (req, res) => {
  try {
    const { user_id, username, first_name, age, photo_url } = req.body;

    if (!user_id || !first_name || !age) {
      return res.status(400).json({ success: false, error: 'Заполните обязательные поля профиля' });
    }

    const userIdBigInt = BigInt(user_id);

    // Upsert данных пользователя со статусом 'pending'
    const { data: user, error } = await supabase
      .from('users')
      .upsert({
        telegram_id: userIdBigInt,
        username: username || '',
        first_name: first_name.trim(),
        age: parseInt(age),
        photo_url: photo_url || '',
        profile_status: 'pending'
      }, { onConflict: 'telegram_id' })
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });

    // Уведомляем администратора о новой заявке на модерацию профиля
    if (bot) {
      try {
        await notifyAdminForProfileModeration(user);
      } catch (modErr) {
        console.error('Ошибка отправки профиля на модерацию:', modErr);
      }
    }

    res.json({ success: true, message: 'Профиль отправлен на модерацию', user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

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

// Получение только ОДОБРЕННЫХ событий
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

// Создание нового объявления (с проверкой модерации профиля)
app.post('/api/events', async (req, res) => {
  try {
    const { user_id, category_id, title, description, location, event_date, max_people } = req.body;

    if (!user_id || !title || !location) {
      return res.status(400).json({ success: false, error: 'Заполните обязательные поля (Заголовок и Локацию)' });
    }

    const userIdBigInt = BigInt(user_id);

    // Проверяем, одобрен ли профиль пользователя
    const { data: user } = await supabase
      .from('users')
      .select('profile_status')
      .eq('telegram_id', userIdBigInt)
      .single();

    if (!user || user.profile_status !== 'approved') {
      return res.status(403).json({ success: false, error: 'Ваш профиль еще не прошел модерацию.' });
    }

    const validDate = event_date ? new Date(event_date).toISOString() : new Date().toISOString();

    const insertPayload = {
      user_id: userIdBigInt,
      title: title.trim(),
      description: description ? description.trim() : '',
      location: location.trim(),
      event_date: validDate,
      max_people: parseInt(max_people) || 2,
      status: 'pending'
    };

    if (category_id) {
      insertPayload.category_id = parseInt(category_id);
    }

    const { data, error } = await supabase
      .from('events')
      .insert([insertPayload])
      .select('*, users(first_name, username)')
      .single();

    if (error) {
      console.error('Ошибка записи в Supabase:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    if (bot) {
      try {
        await notifyAdminForModeration(data);
      } catch (modErr) {
        console.error('Ошибка отправки объявления на модерацию:', modErr);
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

  bot.command('start', async (ctx) => {
    const user = ctx.from;
    const displayName = user.username ? `@${user.username}` : (user.first_name || 'Друг');
    const startParam = ctx.message.text.split(' ')[1];

    try {
      await supabase.from('users').upsert({
        telegram_id: BigInt(user.id),
        first_name: user.first_name || '',
        username: user.username || '',
        language_code: user.language_code || 'ru'
      }, { onConflict: 'telegram_id' });
    } catch (dbErr) {
      console.error('Ошибка авто-регистрации пользователя:', dbErr);
    }

    if (startParam && startParam.startsWith('chat_')) {
      const eventId = startParam.replace('chat_', '');
      const { data: event } = await supabase.from('events').select('*, users(first_name, username)').eq('id', eventId).single();

      if (!event) return ctx.reply('⚠️ Объявление не найдено или было удалено.');
      if (event.user_id.toString() === user.id.toString()) {
        return ctx.reply('ℹ️ Вы являетесь автором этого объявления.');
      }

      const authorName = event.users?.username ? `@${event.users.username}` : (event.users?.first_name || 'автору');

      return ctx.reply(
        `💬 *Связь с автором объявления: "${event.title}"*\n` +
        `👤 Автор: ${authorName}\n\n` +
        `Отправьте ваше сообщение прямо сюда. Бот передаст его автору.\n\n` +
        `_Событие: ${event.title}_`,
        { parse_mode: 'Markdown', reply_markup: { force_reply: true } }
      );
    }

    const welcomeMessage = 
      `✨ *Привет, ${displayName}! Добро пожаловать в Erevan Connect!*\n\n` +
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

  // МОДЕРАЦИЯ ПРОФИЛЯ: Одобрить
  bot.action(/^approve_profile_(\d+)$/, async (ctx) => {
    if (ctx.from.id.toString() !== MY_TELEGRAM_ID) return;
    const userId = ctx.match[1];

    const { data: user, error } = await supabase
      .from('users')
      .update({ profile_status: 'approved' })
      .eq('telegram_id', BigInt(userId))
      .select()
      .single();

    if (!error && user) {
      await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n✅ *ПРОФИЛЬ ОДОБРЕН*`, { parse_mode: 'Markdown' });
      try {
        await bot.telegram.sendMessage(userId, `🎉 Ваш профиль успешно прошел модерацию! Теперь вы можете публиковать события.`);
      } catch (e) {}
    }
  });

  // МОДЕРАЦИЯ ПРОФИЛЯ: Отклонить
  bot.action(/^reject_profile_(\d+)$/, async (ctx) => {
    if (ctx.from.id.toString() !== MY_TELEGRAM_ID) return;
    const userId = ctx.match[1];

    const { data: user, error } = await supabase
      .from('users')
      .update({ profile_status: 'rejected' })
      .eq('telegram_id', BigInt(userId))
      .select()
      .single();

    if (!error && user) {
      await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n❌ *ПРОФИЛЬ ОТКЛОНЕН*`, { parse_mode: 'Markdown' });
      try {
        await bot.telegram.sendMessage(userId, `😔 К сожалению, ваш профиль не прошел модерацию. Попробуйте заполнить анкету повторно.`);
      } catch (e) {}
    }
  });

  // МОДЕРАЦИЯ ОБЪЯВЛЕНИЯ: Одобрить
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

  // МОДЕРАЦИЯ ОБЪЯВЛЕНИЯ: Отклонить
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

  // АНОНИМНЫЕ СООБЩЕНИЯ
  bot.on('message', async (ctx) => {
    const replyTo = ctx.message.reply_to_message;
    if (!replyTo || !replyTo.text) return;

    const match = replyTo.text.match(/Событие: (.+)/);
    if (match) {
      const eventTitle = match[1].trim();
      const { data: event } = await supabase.from('events').select('*').eq('title', eventTitle).order('created_at', { ascending: false }).limit(1).single();

      if (event) {
        await supabase.from('messages').insert([{
          event_id: event.id,
          sender_id: BigInt(ctx.from.id),
          receiver_id: BigInt(event.user_id),
          text: ctx.message.text
        }]);

        const senderUsername = ctx.from.username 
          ? `@${ctx.from.username}` 
          : (ctx.from.first_name || 'Без username');

        try {
          await bot.telegram.sendMessage(
            event.user_id.toString(),
            `📩 *Новый отклик на ваше объявление "${event.title}":*\n\n` +
            `"${ctx.message.text}"\n\n` +
            `👤 *Отправитель:* ${senderUsername}`,
            { parse_mode: 'Markdown' }
          );
          await ctx.reply('✅ Ваше сообщение успешно отправлено автору!');
        } catch (err) {
          await ctx.reply('⚠️ Не удалось доставить сообщение автору (возможно, бот заблокирован).');
        }
      }
    }
  });

  bot.launch().then(() => console.log('✅ Telegram Bot запущен')).catch(err => {
    console.error('❌ Ошибка запуска бота:', err.message);
  });
}

// Уведомление администратора о профиле
async function notifyAdminForProfileModeration(user) {
  const authorInfo = user.username ? `@${user.username}` : `ID: \`${user.telegram_id}\``;
  const message = 
    `👤 *Новый профиль на модерацию!*\n` +
    `═══════════════════\n` +
    `📛 *Имя:* ${user.first_name}\n` +
    `🎂 *Возраст:* ${user.age}\n` +
    `📱 *Аккаунт:* ${authorInfo}\n` +
    `🖼 *Фото:* ${user.photo_url || 'Не указано'}`;

  await bot.telegram.sendMessage(MY_TELEGRAM_ID, message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Одобрить профиль', callback_data: `approve_profile_${user.telegram_id}` },
          { text: '❌ Отклонить', callback_data: `reject_profile_${user.telegram_id}` }
        ]
      ]
    }
  });
}

// Уведомление администратора об объявлении
async function notifyAdminForModeration(event) {
  const authorInfo = event.users?.username 
    ? `@${event.users.username}` 
    : (event.users?.first_name ? `${event.users.first_name}` : `ID: \`${event.user_id}\``);

  const message = 
    `🆕 *Новое объявление на модерацию!*\n` +
    `═══════════════════\n` +
    `📌 *Заголовок:* ${event.title}\n` +
    `📝 *Описание:* ${event.description || 'Без описания'}\n` +
    `📍 *Локация:* ${event.location}\n` +
    `📅 *Дата:* ${new Date(event.event_date).toLocaleString('ru-RU')}\n` +
    `👤 *Автор:* ${authorInfo}`;

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

// Маршрут для раздачи Mini App
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});