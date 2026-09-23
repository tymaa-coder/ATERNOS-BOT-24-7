const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mineflayer = require('mineflayer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let activeBot = null;
let botStatus = 'stopped';
let botLogs = [];

function addLog(ioInstance, message) {
    console.log(message);
    botLogs.push(message);
    if (botLogs.length > 50) botLogs.shift(); // Зберігаємо останні 50 логів
    ioInstance.emit('log', message);
}

function generateRandomNick() {
    const adjectives = ["Cool", "Pro", "Super", "Mega", "Epic", "Fast", "Shadow", "Dark"];
    const nouns = ["Gamer", "Player", "Bot", "Hero", "Ninja", "User", "Builder", "Mined"];
    return adjectives[Math.floor(Math.random() * adjectives.length)] + 
           nouns[Math.floor(Math.random() * nouns.length)] + 
           (Math.floor(Math.random() * 9000) + 1000);
}

io.on('connection', (socket) => {
    // Коли користувач заходить на сайт, відправляємо йому поточний статус бота і старі логи
    socket.emit('status', botStatus);
    botLogs.forEach(log => socket.emit('log', log));

    // Подія запуску бота
    socket.on('start-bot', (data) => {
        const { host, version } = data;

        if (activeBot) {
            socket.emit('log', 'Бот вже запущений!');
            return;
        }

        const username = generateRandomNick();
        addLog(io, `Спроба підключення до ${host} (версія: ${version}) під ніком ${username}...`);

        let serverHost = host;
        let serverPort = 25565;
        if (host.includes(':')) {
            const parts = host.split(':');
            serverHost = parts[0];
            serverPort = parseInt(parts[1]);
        }

        try {
            activeBot = mineflayer.createBot({
                host: serverHost,
                port: serverPort,
                username: username,
                version: version === 'auto' ? undefined : version
            });

            botStatus = 'running';
            io.emit('status', 'running');

            activeBot.on('spawn', () => {
                addLog(io, `Успішно! Бот зажив на сервері як ${username}`);
            });

            activeBot.on('end', (reason) => {
                addLog(io, `Бот відключився. Причина: ${reason}`);
                botStatus = 'stopped';
                io.emit('status', 'stopped');
                activeBot = null;
            });

            activeBot.on('error', (err) => {
                addLog(io, `Помилка бота: ${err.message}`);
                botStatus = 'stopped';
                io.emit('status', 'stopped');
                activeBot = null;
            });

        } catch (e) {
            addLog(io, `Помилка запуску: ${e.message}`);
            activeBot = null;
            botStatus = 'stopped';
            io.emit('status', 'stopped');
        }
    });

    // Подія зупинки бота
    socket.on('stop-bot', () => {
        if (activeBot) {
            activeBot.quit();
            activeBot = null;
            botStatus = 'stopped';
            io.emit('status', 'stopped');
            addLog(io, 'Бот зупинений користувачем.');
        } else {
            addLog(io, 'Немає активних ботів для зупинки.');
        }
    });
});

const PORT = process.env.PORT || 6752;
server.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
});