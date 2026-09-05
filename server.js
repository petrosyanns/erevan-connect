const express = require('express');
const path = require('path');
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// 1. Инициализация Express
const app = express();
app.use(express.json());

// 2. Инициализация Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'placeholder-key';
const supabase = createClient(supabaseUrl, supabaseKey);

const MY_TELEGRAM_ID = '766669940';

// 3. Раздача статических файлов из public/
app.use(express.static(path.join(__dirname, 'public')));

// 4. Инициализация Telegraf
const token = process.env.BOT_TOKEN;
let bot = null;

if (token) {
  bot = new Telegraf(token);

  // Команда /start
  bot.command('start', async (ctx) => {
    const user = ctx.from;
    const firstName = user.first_name ? user.first_name.replace(/[*_`\[\]]/g, '') : 'друг';

    // Запись / обновление пользователя в Supabase
    try {
      const { error } = await supabase.from('users').upsert({
        telegram_id: user.id,
        first_name: user.first_name || '',
        username: user.username || '',
        language_code: user.language_code || 'ru'
      }, { onConflict: 'telegram_id' });

      if (error) {
        console.error('Ошибка Supabase при upsert:', error.message);
      }
    } catch (dbErr) {
      console.error('Ошибка авто-регистрации пользователя в Supabase:', dbErr);
    }

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
    ctx.answerCbQuery('Данные обновлены! 🚀');
  });

  // Запуск бота
  bot.launch().then(() => console.log('✅ Telegram Bot успешно запущен (Telegraf)')).catch(err => {
    console.error('❌ Ошибка запуска бота:', err.message);
  });
} else {
  console.error('❌ BOT_TOKEN не задан в переменных окружения.');
}

// Функция формирования админ-отчета
async function sendAdminReport(ctx, isEdit = false) {
  try {
    // 1. Получаем пользователей из вашей таблицы
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (usersError) throw usersError;

    // 2. Запрос количества активных событий
    let eventsCount = 0;
    try {
      const { count, error: eventsError } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true });
      if (!eventsError) {
        eventsCount = count || 0;
      }
    } catch (e) {
      console.error('Ошибка при подсчете событий:', e);
    }

    const totalUsers = users ? users.length : 0;
    const usersWithUsername = users ? users.filter(u => u.username).length : 0;
    const now = new Date();
    const last24h = users ? users.filter(u => u.created_at && (now - new Date(u.created_at)) < (24 * 60 * 60 * 1000)).length : 0;

    let message = `📊 *Erevan Connect | Dashboard*\n`;
    message += `═══════════════════\n`;
    message += `👥 *Всего участников:* \`${totalUsers}\`\n`;
    message += `🔥 *Прирост за 24ч:* \`+${last24h}\`\n`;
    message += `🎉 *Создано событий:* \`${eventsCount}\`\n`;
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
      await ctx.editMessageText(message, extra);
    } else {
      await ctx.reply(message, extra);
    }
  } catch (err) {
    console.error('Ошибка админ-отчета (детали):', err);
    const details = err.message || JSON.stringify(err);
    const errorMsg = `⚠️ *Ошибка при формировании отчета.*\n\n*Детали:* \`${details}\``;
    
    if (isEdit) {
      await ctx.editMessageText(errorMsg, { parse_mode: 'Markdown' });
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