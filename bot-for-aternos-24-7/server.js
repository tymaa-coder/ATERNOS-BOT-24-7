const express = require('express');
const http = global.require ? global.require('http') : require('http');
const { Server } = require('socket.io');
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let bots = [];

io.on('connection', (socket) => {
    console.log('Користувач підключився до панелі керування');

    // 1. Запуск кількох ботів з інтервалом 5 секунд і правильними ніками
    socket.on('start-bots', async (data) => {
        const { host, port, baseUsername, count, version } = data;
        const numBots = parseInt(count) || 1;

        socket.emit('log', `Початок запуску ${numBots} ботів (затримка 5 секунд між заходами)...`);

        for (let i = 1; i <= numBots; i++) {
            let username;
            if (i === 1) {
                username = baseUsername;
            } else {
                username = `${baseUsername}${i - 1}`;
            }
            
            try {
                socket.emit('log', `Запускаємо бота: ${username}...`);
                
                const bot = mineflayer.createBot({
                    host: host,
                    port: port ? parseInt(port) : 25565,
                    username: username,
                    version: version === 'auto' ? false : version
                });

                bot.loadPlugin(pathfinder);
                bot.loadPlugin(pvp);

                bot.once('spawn', () => {
                    socket.emit('log', `Бот ${username} успішно зайшов на сервер!`);
                    autoEquipGear(bot);
                });

                // Захист від кіка за AFK
                setInterval(() => {
                    if (bot && bot.entity) {
                        const yaw = Math.random() * Math.PI * 2;
                        const pitch = (Math.random() * Math.PI) - (Math.PI / 2);
                        bot.look(yaw, pitch, true);
                    }
                }, 45000);

                bot.on('end', (reason) => {
                    socket.emit('log', `Бот ${username} вийшов. Причина: ${reason}`);
                    if (bot.huntInterval) clearInterval(bot.huntInterval);
                });

                bot.on('error', (err) => {
                    socket.emit('log', `Помилка бота ${username}: ${err.message}`);
                });

                bots.push(bot);

            } catch (e) {
                socket.emit('log', `Помилка створення ${username}: ${e.message}`);
            }

            if (i < numBots) {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        
        socket.emit('status', 'running');
        socket.emit('log', 'Усі боти по черзі пройшли процедуру запуску!');
    });

    // 2. Одягання спорядження
    socket.on('equip-gear', () => {
        if (bots.length === 0) {
            socket.emit('log', 'Немає активних ботів!');
            return;
        }

        socket.emit('log', 'Боти намагаються одягнути броню та взяти спорядження...');
        bots.forEach(bot => autoEquipGear(bot));
    });

    // 3. Постійне переслідування та нескінченна атака на гравця
    socket.on('attack-player', (data) => {
        const { targetName } = data;
        if (!targetName) {
            socket.emit('log', 'Введіть нік гравця для атаки!');
            return;
        }

        socket.emit('log', `Усі боти отримали команду постійно переслідувати гравця ${targetName}!`);

        bots.forEach(bot => {
            // Зупиняємо попередній таймер погоні, якщо він був
            if (bot.huntInterval) clearInterval(bot.huntInterval);

            // Кожні 2 секунди бот перевіряє, де ти, і оновлює шлях до тебе
            bot.huntInterval = setInterval(() => {
                try {
                    const target = bot.players[targetName]?.entity;
                    
                    if (target) {
                        const defaultMove = new Movements(bot);
                        bot.pathfinder.setMovements(defaultMove);
                        // Біжимо за тобою на відстань 1 блок
                        bot.pathfinder.setGoal(new goals.GoalFollow(target, 1), true);
                        // Б'ємо нескінченно
                        bot.pvp.attack(target);
                    }
                } catch (e) {
                    // Ігноруємо мінорні помилки під час сканування
                }
            }, 2000);
        });
    });

    // 4. Зупинка всіх ботів
    socket.on('stop-bots', () => {
        bots.forEach(bot => {
            if (bot.huntInterval) clearInterval(bot.huntInterval);
            bot.quit();
        });
        bots = [];
        socket.emit('log', 'Усі боти зупинені.');
        socket.emit('status', 'stopped');
    });
});

// Функція екіпірування
function autoEquipGear(bot) {
    setTimeout(async () => {
        try {
            const items = bot.inventory.items();

            const helmet = items.find(i => i.name.includes('helmet'));
            const chestplate = items.find(i => i.name.includes('chestplate'));
            const leggings = items.find(i => i.name.includes('leggings'));
            const boots = items.find(i => i.name.includes('boots'));
            const sword = items.find(i => i.name.includes('sword'));
            const totem = items.find(i => i.name.includes('totem_of_undying'));

            if (helmet) await bot.equip(helmet, 'head');
            if (chestplate) await bot.equip(chestplate, 'torso');
            if (leggings) await bot.equip(leggings, 'legs');
            if (boots) await bot.equip(boots, 'feet');
            if (sword) await bot.equip(sword, 'hand');
            if (totem) await bot.equip(totem, 'off-hand');
        } catch (err) {
            console.log(`Помилка екіпірування для ${bot.username}:`, err.message);
        }
    }, 1000);
}

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Сервер панелі запущено! Відкрийте: http://localhost:${PORT}`);
});