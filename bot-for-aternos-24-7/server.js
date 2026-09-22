const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let activeBots = [];
let attackIntervals = [];

// Генерація рандомного ніку
function generateRandomNick() {
    const adjectives = ["Cool", "Pro", "Super", "Mega", "Epic", "Fast", "Shadow", "Dark"];
    const nouns = ["Gamer", "Player", "Bot", "Hero", "Ninja", "User", "Builder", "Mined"];
    const randAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randNum = Math.floor(Math.random() * 9000) + 1000;
    return `${randAdj}${randNoun}${randNum}`;
}

io.on('connection', (socket) => {
    console.log('Користувач підключився до панелі');

    // Запуск кількох ботів
    socket.on('start-many-bots', (data) => {
        const { host, version, count } = data;
        let serverHost = host;
        let serverPort = 25565;
        if (host.includes(':')) {
            const parts = host.split(':');
            serverHost = parts[0];
            serverPort = parseInt(parts[1]);
        }

        const botCount = parseInt(count) || 1;
        socket.emit('log', `Починається плавний запуск ${botCount} ботів...`);

        for (let i = 0; i < botCount; i++) {
            setTimeout(() => {
                const username = generateRandomNick();
                socket.emit('log', `Запуск бота: ${username}...`);

                const bot = mineflayer.createBot({
                    host: serverHost,
                    port: serverPort,
                    username: username,
                    version: version === 'auto' ? undefined : version
                });

                bot.loadPlugin(pathfinder);

                bot.on('spawn', () => {
                    socket.emit('log', `Бот ${username} успішно зайшов на сервер!`);
                    const defaultMove = new Movements(bot);
                    bot.pathfinder.setMovements(defaultMove);
                });

                bot.on('end', (reason) => {
                    socket.emit('log', `Бот ${username} вийшов: ${reason}`);
                });

                bot.on('error', (err) => {
                    socket.emit('log', `Помилка бота ${username}: ${err.message}`);
                });

                activeBots.push(bot);
            }, i * 5000); // 5 секунд між заходами для захисту від античита
        }
    });

    // Направити ботів бігти до цілі з РІЗНИХ СТОРІН (оточення)
    socket.on('attack-target', (targetName) => {
        if (!targetName) {
            socket.emit('log', 'Введіть нік гравця для переслідування!');
            return;
        }

        socket.emit('log', `⚔️ Боти почали оточення та біг за гравцем: ${targetName}`);

        activeBots.forEach((bot, index) => {
            if (attackIntervals[index]) {
                clearInterval(attackIntervals[index]);
            }

            // Робимо так, щоб кожен бот тримав різну дистанцію (від 1 до 4 блоків) і кут
            const randomDistance = 1 + (index % 4); 

            attackIntervals[index] = setInterval(() => {
                try {
                    const playerEntity = bot.players[targetName]?.entity;
                    if (playerEntity) {
                        // GoalFollow з різною дистанцією створює ефект оточення з різних сторін
                        const goal = new goals.GoalFollow(playerEntity, randomDistance);
                        bot.pathfinder.setGoal(goal, true);

                        const distance = bot.entity.position.distanceTo(playerEntity.position);
                        if (distance <= 4) {
                            bot.attack(playerEntity);
                        }
                    }
                } catch (e) {}
            }, 3000);
        });
    });

    // Функція одягання броні, меча та тотема
    socket.on('equip-gear', () => {
        socket.emit('log', '🛡️ Боти перевіряють інвентар і одягають спорядження...');

        activeBots.forEach(async (bot) => {
            try {
                const items = bot.inventory.items();

                for (const item of items) {
                    const name = item.name.toLowerCase();

                    // Шолом
                    if (name.includes('helmet')) {
                        await bot.equip(item, 'head');
                    }
                    // Нагрудник
                    else if (name.includes('chestplate')) {
                        await bot.equip(item, 'torso');
                    }
                    // Штани
                    else if (name.includes('leggings')) {
                        await bot.equip(item, 'legs');
                    }
                    // Черевики
                    else if (name.includes('boots')) {
                        await bot.equip(item, 'feet');
                    }
                    // Меч (у праву руку)
                    else if (name.includes('sword')) {
                        await bot.equip(item, 'hand');
                    }
                    // Тотем (у ліву руку / off-hand)
                    else if (name.includes('totem')) {
                        await bot.equip(item, 'off-hand');
                    }
                }
            } catch (err) {
                // Ігноруємо дрібні помилки інвентарю, якщо речі ще немає
            }
        });
    });

    // Зупинка всіх ботів
    socket.on('stop-bots', () => {
        attackIntervals.forEach(interval => clearInterval(interval));
        attackIntervals = [];

        activeBots.forEach(bot => {
            try { bot.quit(); } catch (e) {}
        });
        activeBots = [];
        socket.emit('log', 'Усі боти зупинені.');
    });
});

const PORT = 6752;
server.listen(PORT, () => {
    console.log(`Сервер успішно запущено: http://localhost:${PORT}`);
});