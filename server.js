require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const app = express();
app.use(cors());
app.use(express.json());

// Инициализация Supabase с передачей WebSocket реализации
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    auth: { 
      persistSession: false 
    },
    realtime: {
      transport: WebSocket
    }
  }
);
// Добавьте эту строку перед объявлением маршрутов API
app.use(express.static('public'));
// 1. Маршрут: Получить все категории
app.get('/api/categories', async (req, res) => {
  try {
    const { data, error } = await supabase.from('categories').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Маршрут: Получить список активных объявлений
app.get('/api/events', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*, users(username, first_name), categories(name_ru, icon)')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Маршрут: Создать новое объявление
app.post('/api/events', async (req, res) => {
  try {
    const { user, event } = req.body;

    if (!user || !event) {
      return res.status(400).json({ error: 'Неполные данные' });
    }

    // Сохраняем или обновляем пользователя
    await supabase.from('users').upsert({
      telegram_id: user.telegram_id,
      username: user.username,
      first_name: user.first_name
    });

    // Создаем объявление
    const { data, error } = await supabase
      .from('events')
      .insert([
        {
          user_id: user.telegram_id,
          category_id: event.category_id,
          title: event.title,
          description: event.description,
          location: event.location,
          event_date: event.event_date,
          max_people: event.max_people
        }
      ])
      .select();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
