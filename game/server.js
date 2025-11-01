const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const GRID_SIZE = 30;
const GAME_SPEED = 100;
const FOOD_COUNT = 5;

const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }
    
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
    };
    
    const contentType = mimeTypes[extname] || 'application/octet-stream';
    
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - File Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Server Error: ' + error.code, 'utf-8');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const wss = new WebSocket.Server({ server });

const gameState = {
    players: {},
    food: [],
    gameLoop: null
};

const colors = [
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', 
    '#6c5ce7', '#fd79a8', '#fdcb6e', '#00b894',
    '#e17055', '#74b9ff', '#a29bfe', '#55efc4'
];

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

function getRandomColor() {
    return colors[Math.floor(Math.random() * colors.length)];
}

function getRandomPosition() {
    return {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE)
    };
}

function isPositionOccupied(pos) {
    for (let playerId in gameState.players) {
        const player = gameState.players[playerId];
        for (let segment of player.snake) {
            if (segment.x === pos.x && segment.y === pos.y) {
                return true;
            }
        }
    }
    return false;
}

function generateFood() {
    while (gameState.food.length < FOOD_COUNT) {
        let pos;
        let attempts = 0;
        do {
            pos = getRandomPosition();
            attempts++;
        } while (isPositionOccupied(pos) && attempts < 100);
        
        if (attempts < 100) {
            gameState.food.push(pos);
        }
    }
}

function createPlayer(name, ws) {
    const id = generateId();
    let startPos;
    let attempts = 0;
    
    do {
        startPos = getRandomPosition();
        attempts++;
    } while (isPositionOccupied(startPos) && attempts < 100);
    
    const player = {
        id: id,
        name: name,
        color: getRandomColor(),
        snake: [
            startPos,
            { x: startPos.x, y: startPos.y },
            { x: startPos.x, y: startPos.y }
        ],
        direction: 'right',
        nextDirection: 'right',
        score: 0,
        ws: ws
    };
    
    gameState.players[id] = player;
    return player;
}

function moveSnake(player) {
    player.direction = player.nextDirection;
    
    const head = { ...player.snake[0] };
    
    switch (player.direction) {
        case 'up':
            head.y -= 1;
            break;
        case 'down':
            head.y += 1;
            break;
        case 'left':
            head.x -= 1;
            break;
        case 'right':
            head.x += 1;
            break;
    }
    
    if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
        return false;
    }
    
    for (let playerId in gameState.players) {
        const otherPlayer = gameState.players[playerId];
        for (let i = 0; i < otherPlayer.snake.length; i++) {
            const segment = otherPlayer.snake[i];
            if (segment.x === head.x && segment.y === head.y) {
                if (playerId === player.id && i === 0) continue;
                return false;
            }
        }
    }
    
    player.snake.unshift(head);
    
    let ateFood = false;
    for (let i = 0; i < gameState.food.length; i++) {
        const food = gameState.food[i];
        if (food.x === head.x && food.y === head.y) {
            gameState.food.splice(i, 1);
            player.score += 10;
            ateFood = true;
            break;
        }
    }
    
    if (!ateFood) {
        player.snake.pop();
    }
    
    return true;
}

function gameLoop() {
    const playerIds = Object.keys(gameState.players);
    
    for (let id of playerIds) {
        const player = gameState.players[id];
        const alive = moveSnake(player);
        
        if (!alive) {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify({
                    type: 'gameOver'
                }));
            }
            delete gameState.players[id];
        }
    }
    
    generateFood();
    
    broadcastGameState();
}

function broadcastGameState() {
    const state = {
        type: 'gameState',
        players: {},
        food: gameState.food
    };
    
    for (let id in gameState.players) {
        const player = gameState.players[id];
        state.players[id] = {
            id: player.id,
            name: player.name,
            color: player.color,
            snake: player.snake,
            direction: player.direction,
            score: player.score
        };
    }
    
    const message = JSON.stringify(state);
    
    for (let id in gameState.players) {
        const player = gameState.players[id];
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(message);
        }
    }
}

function startGameLoop() {
    if (!gameState.gameLoop) {
        gameState.gameLoop = setInterval(gameLoop, GAME_SPEED);
        console.log('Game loop started');
    }
}

function stopGameLoop() {
    if (gameState.gameLoop && Object.keys(gameState.players).length === 0) {
        clearInterval(gameState.gameLoop);
        gameState.gameLoop = null;
        console.log('Game loop stopped');
    }
}

wss.on('connection', (ws) => {
    console.log('New client connected');
    let playerId = null;
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'start':
                    const player = createPlayer(data.name || 'Player', ws);
                    playerId = player.id;
                    
                    ws.send(JSON.stringify({
                        type: 'init',
                        id: player.id,
                        player: {
                            id: player.id,
                            name: player.name,
                            color: player.color,
                            score: player.score
                        }
                    }));
                    
                    generateFood();
                    startGameLoop();
                    broadcastGameState();
                    
                    console.log(`Player ${player.name} (${player.id}) joined the game`);
                    break;
                    
                case 'direction':
                    if (playerId && gameState.players[playerId]) {
                        const player = gameState.players[playerId];
                        const opposites = {
                            'up': 'down',
                            'down': 'up',
                            'left': 'right',
                            'right': 'left'
                        };
                        
                        if (data.direction !== opposites[player.direction]) {
                            player.nextDirection = data.direction;
                        }
                    }
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });
    
    ws.on('close', () => {
        if (playerId && gameState.players[playerId]) {
            console.log(`Player ${gameState.players[playerId].name} (${playerId}) left the game`);
            delete gameState.players[playerId];
            
            for (let id in gameState.players) {
                const player = gameState.players[id];
                if (player.ws.readyState === WebSocket.OPEN) {
                    player.ws.send(JSON.stringify({
                        type: 'playerLeft',
                        id: playerId
                    }));
                }
            }
            
            stopGameLoop();
        }
        console.log('Client disconnected');
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

server.listen(PORT, () => {
    console.log(`🎮 Snake Battle Server running on http://localhost:${PORT}`);
    console.log(`📡 WebSocket server running on ws://localhost:${PORT}`);
    console.log(`\n🚀 Open http://localhost:${PORT} in your browser to play!`);
});

process.on('SIGINT', () => {
    console.log('\n👋 Shutting down server...');
    wss.close(() => {
        server.close(() => {
            console.log('✅ Server closed');
            process.exit(0);
        });
    });
});
