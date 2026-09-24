const express = require('http');
const app = require('express')();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const path = require('path');
const mineflayer = require('mineflayer');

// Налаштування статичних файлів
app.use(require('express').static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let bot = null;
let botStatus = 'stopped';

io.on('connection', (socket) => {
    console.log('Користувач підключився до панелі');
    
    // Відправляємо поточний статус при підключенні
    socket.emit('status', botStatus);

    // Запуск бота
    socket.on('start-bot', (data) => {
        if (bot) {
            socket.emit('log', '⚠️ Бот вже запущений!');
            return;
        }

        const { host, version } = data;
        
        // Розділяємо хост і порт (якщо введено як ip:port)
        let serverHost = host;
        let serverPort = 25565;

        if (host.includes(':')) {
            const parts = host.split(':');
            serverHost = parts[0];
            serverPort = parseInt(parts[1]);
        }

        socket.emit('log', `🔄 Запуск бота на сервері ${serverHost}:${serverPort} (версія: ${version})...`);

        try {
            const botOptions = {
                host: serverHost,
                port: serverPort,
                username: 'AternosBot247',
                // Відключаємо перевищення ліміту пакетів, щоб не спамити
                skipValidation: true
            };

// Якщо версія не "auto", додаємо її в налаштування
            if (version && version !== 'auto') {
                botOptions.version = version;
            }

            bot = mineflayer.createBot(botOptions);

            bot.on('spawn', () => {
                botStatus = 'running';
                io.emit('status', 'running');
                io.emit('log', '✅ Бот успішно зайшов на сервер і з’явився у світі!');
            });

            bot.on('end', (reason) => {
                io.emit('log', `❌ Бот відключився від сервера. Причина: ${reason}`);
                bot = null;
                botStatus = 'stopped';
                io.emit('status', 'stopped');
            });

            bot.on('error', (err) => {
                io.emit('log', `⚠️ Помилка бота: ${err.message}`);
            });

            bot.on('kick', (reason) => {
                io.emit('log', `👢 Бот був кікнутий із сервера: ${reason}`);
            });

        } catch (error) {
            io.emit('log', `❌ Не вдалося створити бота: ${error.message}`);
            bot = null;
            botStatus = 'stopped';
            io.emit('status', 'stopped');
        }
    });

    // Зупинка бота
    socket.on('stop-bot', () => {
        if (bot) {
            socket.emit('log', '🛑 Зупинка бота...');
            bot.quit();
            bot = null;
        } else {
            socket.emit('log', '⚠️ Бот і так не запущений.');
        }
        botStatus = 'stopped';
        io.emit('status', 'stopped');
    });

    socket.on('disconnect', () => {
        console.log('Користувач відключився від панелі');
    });
});

// Визначаємо порт для веб-сервера (Render/Railway автоматично передають process.env.PORT)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
});
