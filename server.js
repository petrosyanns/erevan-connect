const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
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

// Обработка команды /start
bot.start((ctx) => {
  ctx.reply(
    `Привет, ${ctx.from.first_name}! 👋\nНажми кнопку ниже, чтобы открыть приложение досуга:`,
    Markup.inlineKeyboard([
      [Markup.button.webApp('Открыть приложение', process.env.WEBAPP_URL || 'https://google.com')]
    ])
  );
});

// Обработка команды /users прямо в чате Telegram
bot.command('users', async (ctx) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      return ctx.reply('👥 Список пользователей пуст.');
    }

    let message = `👥 *Всего пользователей:* ${data.length}\n\n`;
    data.forEach((u, index) => {
      const username = u.username ? `@${u.username}` : 'нет username';
      message += `${index + 1}. *${u.first_name || 'Без имени'}* (${username}) — \`${u.telegram_id}\`\n`;
    });

    // Если сообщение слишком длинное (лимит Telegram 4096 символов)
    if (message.length > 4000) {
      message = message.substring(0, 4000) + '\n\n...список обрезан.';
    }

    ctx.replyWithMarkdown(message);
  } catch (err) {
    console.error('Ошибка /users в боте:', err);
    ctx.reply(`❌ Ошибка получения пользователей: ${err.message}`);
  }
});

// ==========================================
// 2. HTTP ЭНДПОИНТЫ ДЛЯ WEB APP И БРАУЗЕРА
// ==========================================

async function getUsersHandler(req, res) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

app.get('/users', getUsersHandler);
app.get('/api/users', getUsersHandler);

// Сохранение профиля при входе в Web App
app.post('/api/profile', async (req, res) => {
  const { user_id, username, first_name, language_code } = req.body;

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

// ==========================================
// 3. КАТЕГОРИИ
// ==========================================

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

// ==========================================
// 4. ВСТРЕЧИ И СОЗДАНИЕ
// ==========================================

app.post('/api/events', async (req, res) => {
  const { user_id, category_id, title, description, location, event_date, max_people } = req.body;

  try {
    const { data: event, error } = await supabase
      .from('events')
      .insert({
        user_id,
        category_id: parseInt(category_id) || 1,
        title,
        description,
        location,
        event_date,
        max_people: parseInt(max_people) || 2,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    if (ADMIN_ID) {
      await bot.telegram.sendMessage(ADMIN_ID, 
        `📌 *Новое объявление на модерацию!*\n\n` +
        `📝 *Заголовок:* ${title}\n` +
        `📍 *Локация:* ${location}\n` +
        `📄 *Описание:* ${description || 'Нет'}\n` +
        `📅 *Дата:* ${event_date}\n` +
        `👤 *Автор ID:* \`${user_id}\``, 
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('✅ Одобрить', `approve_ev_${event.id}`),
              Markup.button.callback('❌ Отклонить', `reject_ev_${event.id}`)
            ]
          ])
        }
      );
    }

    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/events', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*, users(first_name, username), categories(name_ru, icon)')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 5. МОДЕРАЦИЯ (CALLBACK)
// ==========================================

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (data.startsWith('approve_ev_')) {
    const id = data.replace('approve_ev_', '');
    await supabase.from('events').update({ status: 'approved' }).eq('id', id);
    await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n✅ *ОДОБРЕНО*`, { parse_mode: 'Markdown' });
  } else if (data.startsWith('reject_ev_')) {
    const id = data.replace('reject_ev_', '');
    await supabase.from('events').update({ status: 'rejected' }).eq('id', id);
    await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n❌ *ОТКЛОНЕНО*`, { parse_mode: 'Markdown' });
  }

  await ctx.answerCbQuery();
});

// Запуск бота и Express
bot.launch();
app.listen(process.env.PORT || 3000, () => console.log('Server started...'));