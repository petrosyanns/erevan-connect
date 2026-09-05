const express = require('express');
const path = require('path');
const TelegramBotPackage = require('node-telegram-bot-api');
const TelegramBot = TelegramBotPackage.default || TelegramBotPackage;
const { createClient } = require('@supabase/supabase-js');

// 1. Инициализация Express
const app = express();
app.use(express.json());

// 2. Настройка бота
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// 3. Supabase и ID
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const MY_TELEGRAM_ID = '766669940';

// 3. Раздача статических файлов из папки public
app.use(express.static(path.join(__dirname, 'public')));

// 4. КОМАНДА /start — Приветствие пользователей
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name ? msg.from.first_name.replace(/[*_`\[\]]/g, '') : 'друг';

  const welcomeMessage = 
    `✨ **Բարև, ${firstName}! Добро пожаловать в Erevan Connect!**\n\n` +
    `Твой главный проводник по встречам, спорту и событиям в Ереване 🇦🇲\n\n` +
    `Находи компанию для кофе в Кентроне, +1 на футбол или партнеров для проектов в пару кликов!`;

  const inlineKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🚀 Открыть Erevan Connect', web_app: { url: process.env.WEBAPP_URL || 'https://erevan-connect.onrender.com' } }
        ],
        [
          { text: '📢 Наш Канал', url: 'https://t.me/erevan_connect' },
          { text: '💬 Поддержка', url: 'https://t.me/erevan_connect_support' }
        ]
      ]
    },
    parse_mode: 'Markdown'
  };

  bot.sendMessage(chatId, welcomeMessage, inlineKeyboard);
});

// 5. КОМАНДА /users — Административная аналитика
bot.onText(/\/users/, async (msg) => {
  const chatId = msg.chat.id;

  // Проверка прав доступа по твоему ID
  if (msg.from.id.toString() !== MY_TELEGRAM_ID) {
    return bot.sendMessage(chatId, '⛔️ *Доступ ограничен.* Эта команда только для администратора.', { parse_mode: 'Markdown' });
  }

  await sendAdminReport(chatId);
});

// Функция формирования и отправки админ-отчета
async function sendAdminReport(chatId, messageId = null) {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const totalUsers = users.length;
    const usersWithUsername = users.filter(u => u.username).length;
    const now = new Date();
    const last24h = users.filter(u => (now - new Date(u.created_at)) < (24 * 60 * 60 * 1000)).length;

    let message = `📊 **Erevan Connect | Dashboard**\n`;
    message += `═══════════════════\n`;
    message += `👥 **Всего участников:** \`${totalUsers}\`\n`;
    message += `🔥 **Прирост за 24ч:** \`+${last24h}\`\n`;
    message += `💬 **С юзернеймом:** \`${usersWithUsername}/${totalUsers}\`\n`;
    message += `═══════════════════\n\n`;
    message += `📋 **Свежие регистрации:**\n\n`;

    const recentUsers = users.slice(0, 10);
    recentUsers.forEach((u, index) => {
      const name = u.first_name ? u.first_name.replace(/[*_`\[\]]/g, '') : 'Без имени';
      const username = u.username ? `@${u.username}` : '❌ *нет юзернейма*';
      const date = new Date(u.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
      message += `${index + 1}. **${name}** | ${username} \`[${date}]\`\n`;
    });

    if (totalUsers > 10) {
      message += `\n*...и еще ${totalUsers - 10} пользователей.*`;
    }

    const adminKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Обновить данные', callback_data: 'admin_refresh' }],
          [{ text: '🌐 Открыть Mini App', web_app: { url: process.env.WEBAPP_URL || 'https://erevan-connect.onrender.com' } }]
        ]
      },
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    };

    if (messageId) {
      bot.editMessageText(message, { chat_id: chatId, message_id: messageId, ...adminKeyboard });
    } else {
      bot.sendMessage(chatId, message, adminKeyboard);
    }

  } catch (err) {
    console.error('Ошибка админ-отчета:', err);
    bot.sendMessage(chatId, '⚠️ Ошибка при формировании отчета.');
  }
}

// 6. Обработка нажатий на инлайн-кнопки
bot.on('callback_query', async (query) => {
  if (query.data === 'admin_refresh' && query.from.id.toString() === MY_TELEGRAM_ID) {
    await sendAdminReport(query.message.chat.id, query.message.message_id);
    bot.answerCallbackQuery(query.id, { text: 'Данные обновлены! 🚀' });
  }
});

// 7. Маршрут для отдачи приложения Mini App
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 8. Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});