const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const path = require('path');
const mineflayer = require('mineflayer');

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let activeBots = [];
let botStatus = 'stopped';
let lastConfig = null; // Зберігаємо налаштування для автоперепідключення

function createBotInstance(serverHost, serverPort, version, username, socket = null) {
    const botOptions = {
        host: serverHost,
        port: serverPort,
        username: username,
        skipValidation: true
    };

    if (version && version !== 'auto') {
        botOptions.version = version;
    }

    const bot = mineflayer.createBot(botOptions);

    bot.on('spawn', () => {
        botStatus = 'running';
        io.emit('status', 'running');
        if (socket) socket.emit('log', `✅ Бот [${username}] успішно зайшов на сервер!`);
        else console.log(`✅ Бот [${username}] успішно зайшов на сервер!`);
    });

    bot.on('end', (reason) => {
        const msg = `❌ Бот [${username}] відключився: ${reason}. Перепідключення через 30 сек...`;
        if (socket) socket.emit('log', msg);
        else console.log(msg);

        // Видаляємо старого зі списку і намагаємося перепідключитись через 30 секунд
        activeBots = activeBots.filter(b => b !== bot);

        if (lastConfig && activeBots.length < lastConfig.count) {
            setTimeout(() => {
                if (botStatus === 'running' && lastConfig) {
                    createBotInstance(serverHost, serverPort, version, username, socket);
                }
            }, 30000);
        }

        if (activeBots.length === 0 && botStatus === 'running') {
            botStatus = 'stopped';
            io.emit('status', 'stopped');
        }
    });

    bot.on('error', (err) => {
        const msg = `⚠️ Помилка бота [${username}]: ${err.message}`;
        if (socket) socket.emit('log', msg);
        else console.log(msg);
    });

    activeBots.push(bot);
}

io.on('connection', (socket) => {
    socket.emit('status', botStatus);

    socket.on('start-bot', (data) => {
        const { host, count, version } = data;
        
        let serverHost = host;
        let serverPort = 25565;

        if (host.includes(':')) {
            const parts = host.split(':');
            serverHost = parts[0];
            serverPort = parseInt(parts[1]);
        }

        // Зупиняємо попередніх перед запуском нових
        activeBots.forEach(b => { try { b.quit(); } catch(e) {} });
        activeBots = [];

        lastConfig = { serverHost, serverPort, version, count };
        botStatus = 'running';
        io.emit('status', 'running');

        socket.emit('log', `🔄 Запуск ${count} ботів на сервері ${serverHost}:${serverPort}...`);

        // Запускаємо ботів з невеликою затримкою між ними (по 1.5 секунди), щоб не спамити сервер
        let launched = 0;
        const interval = setInterval(() => {
            if (launched >= count || botStatus === 'stopped') {
                clearInterval(interval);
                return;
            }
            launched++;
            const username = `AtenBot_${Math.floor(Math.random() * 900) + 100}`;
            createBotInstance(serverHost, serverPort, version, username, socket);
        }, 1500);
    });

    socket.on('stop-bot', () => {
        botStatus = 'stopped';
        lastConfig = null;
        socket.emit('log', '🛑 Зупинка всіх ботів...');
        activeBots.forEach(b => {
            try { b.quit(); } catch(e) {}
        });
        activeBots = [];
        io.emit('status', 'stopped');
    });

    socket.on('send-command', (data) => {
        const { command } = data;
        if (activeBots.length === 0) {
            socket.emit('log', '⚠️ Немає активних ботів для виконання команди!');
            return;
        }

        socket.emit('log', `💬 Відправка команди: ${command}`);
        // Перший бот у списку відправляє команду в чат
        try {
            activeBots[0].chat(command);
        } catch (e) {
            socket.emit('log', `❌ Помилка відправки команди: ${e.message}`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
});
