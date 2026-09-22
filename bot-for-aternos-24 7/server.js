const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mineflayer = require('mineflayer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let activeBot = null;

function generateRandomNick() {
    const adjectives = ["Cool", "Pro", "Super", "Mega", "Epic", "Fast", "Shadow", "Dark"];
    const nouns = ["Gamer", "Player", "Bot", "Hero", "Ninja", "User", "Builder", "Mined"];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}${Math.floor(Math.random() * 9000) + 1000}`;
}

io.on('connection', (socket) => {
    console.log('Користувач підключився до панелі');

    socket.on('start-bot', (data) => {
        const { host, version } = data;

        if (activeBot) {
            socket.emit('log', 'Бот вже запущений!');
            return;
        }

        const username = generateRandomNick();
        socket.emit('log', `Спроба підключення до ${host} під ніком ${username}...`);

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

            activeBot.on('spawn', () => {
                socket.emit('log', `Успішно! Бот зайшов на сервер як ${username}`);
                socket.emit('status', 'running');
            });

            activeBot.on('end', (reason) => {
                socket.emit('log', `Бот відключився. Причина: ${reason}`);
                socket.emit('status', 'stopped');
                activeBot = null;
            });

            activeBot.on('error', (err) => {
                socket.emit('log', `Помилка бота: ${err.message}`);
                socket.emit('status', 'stopped');
                activeBot = null;
            });

        } catch (e) {
            socket.emit('log', `Помилка запуску: ${e.message}`);
            activeBot = null;
            socket.emit('status', 'stopped');
        }
    });

    socket.on('stop-bot', () => {
        if (activeBot) {
            activeBot.quit();
            activeBot = null;
            socket.emit('log', 'Бот зупинений.');
            socket.emit('status', 'stopped');
        } else {
            socket.emit('log', 'Немає активних ботів.');
        }
    });
});

const PORT = process.env.PORT || 6752;
server.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
});