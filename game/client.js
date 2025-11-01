const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const GRID_SIZE = 20;
const TILE_COUNT = canvas.width / GRID_SIZE;
const GAME_SPEED = 100;

let ws = null;
let gameState = {
    players: {},
    food: [],
    myId: null,
    isGameOver: false,
    isPlaying: false
};

let inputQueue = [];
let lastDirection = null;

const colors = [
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', 
    '#6c5ce7', '#fd79a8', '#fdcb6e', '#00b894',
    '#e17055', '#74b9ff', '#a29bfe', '#55efc4'
];

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:8080`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('Connected to server');
        updateConnectionStatus(true);
    };
    
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleServerMessage(message);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateConnectionStatus(false);
    };
    
    ws.onclose = () => {
        console.log('Disconnected from server');
        updateConnectionStatus(false);
        
        if (gameState.isPlaying) {
            setTimeout(connectWebSocket, 3000);
        }
    };
}

function handleServerMessage(message) {
    switch (message.type) {
        case 'init':
            gameState.myId = message.id;
            gameState.players[message.id] = message.player;
            updatePlayerColor(message.player.color);
            updatePlayerName(message.player.name);
            break;
            
        case 'gameState':
            gameState.players = message.players;
            gameState.food = message.food;
            updateStats();
            updateLeaderboard();
            render();
            break;
            
        case 'gameOver':
            handleGameOver();
            break;
            
        case 'playerLeft':
            delete gameState.players[message.id];
            updateLeaderboard();
            break;
    }
}

function updateConnectionStatus(isConnected) {
    const indicator = document.querySelector('.status-indicator');
    const statusText = document.getElementById('status-text');
    
    if (isConnected) {
        indicator.classList.remove('offline');
        indicator.classList.add('online');
        statusText.textContent = 'Подключено';
    } else {
        indicator.classList.remove('online');
        indicator.classList.add('offline');
        statusText.textContent = 'Отключено';
    }
}

function updatePlayerColor(color) {
    const colorBox = document.getElementById('color-box');
    colorBox.style.backgroundColor = color;
}

function updatePlayerName(name) {
    const nameDisplay = document.getElementById('player-name-display');
    nameDisplay.textContent = name;
}

function updateStats() {
    const myPlayer = gameState.players[gameState.myId];
    if (!myPlayer) return;
    
    document.getElementById('score').textContent = myPlayer.score;
    document.getElementById('length').textContent = myPlayer.snake.length;
    document.getElementById('players').textContent = Object.keys(gameState.players).length;
}

function updateLeaderboard() {
    const leaderboard = document.getElementById('leaderboard');
    const players = Object.values(gameState.players);
    
    if (players.length === 0) {
        leaderboard.innerHTML = '<div class="leaderboard-empty">Нет игроков</div>';
        return;
    }
    
    players.sort((a, b) => b.score - a.score);
    
    leaderboard.innerHTML = players.map((player, index) => {
        const isCurrentPlayer = player.id === gameState.myId;
        const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        
        return `
            <div class="leaderboard-item ${isCurrentPlayer ? 'current-player' : ''}">
                <div class="leaderboard-rank">${rankEmoji}</div>
                <div class="leaderboard-color" style="background-color: ${player.color}"></div>
                <div class="leaderboard-info">
                    <div class="leaderboard-name">${player.name}</div>
                    <div class="leaderboard-score">Счёт: ${player.score} | Длина: ${player.snake.length}</div>
                </div>
            </div>
        `;
    }).join('');
}

function render() {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    drawGrid();
    drawFood();
    drawPlayers();
}

function drawGrid() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= TILE_COUNT; i++) {
        ctx.beginPath();
        ctx.moveTo(i * GRID_SIZE, 0);
        ctx.lineTo(i * GRID_SIZE, canvas.height);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(0, i * GRID_SIZE);
        ctx.lineTo(canvas.width, i * GRID_SIZE);
        ctx.stroke();
    }
}

function drawFood() {
    gameState.food.forEach(food => {
        const x = food.x * GRID_SIZE;
        const y = food.y * GRID_SIZE;
        
        const gradient = ctx.createRadialGradient(
            x + GRID_SIZE / 2, y + GRID_SIZE / 2, 0,
            x + GRID_SIZE / 2, y + GRID_SIZE / 2, GRID_SIZE / 2
        );
        gradient.addColorStop(0, '#ff6b6b');
        gradient.addColorStop(1, '#ee5a6f');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x + GRID_SIZE / 2, y + GRID_SIZE / 2, GRID_SIZE / 2 - 2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(x + GRID_SIZE / 2 - 3, y + GRID_SIZE / 2 - 3, 2, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawPlayers() {
    Object.values(gameState.players).forEach(player => {
        drawSnake(player);
    });
}

function drawSnake(player) {
    player.snake.forEach((segment, index) => {
        const x = segment.x * GRID_SIZE;
        const y = segment.y * GRID_SIZE;
        
        const isHead = index === 0;
        const alpha = 1 - (index / player.snake.length) * 0.3;
        
        ctx.fillStyle = player.color;
        ctx.globalAlpha = alpha;
        
        if (isHead) {
            ctx.fillRect(x + 1, y + 1, GRID_SIZE - 2, GRID_SIZE - 2);
            
            ctx.fillStyle = 'white';
            ctx.globalAlpha = 1;
            
            const eyeSize = 3;
            const eyeOffset = 5;
            
            if (player.direction === 'up') {
                ctx.fillRect(x + eyeOffset, y + eyeOffset, eyeSize, eyeSize);
                ctx.fillRect(x + GRID_SIZE - eyeOffset - eyeSize, y + eyeOffset, eyeSize, eyeSize);
            } else if (player.direction === 'down') {
                ctx.fillRect(x + eyeOffset, y + GRID_SIZE - eyeOffset - eyeSize, eyeSize, eyeSize);
                ctx.fillRect(x + GRID_SIZE - eyeOffset - eyeSize, y + GRID_SIZE - eyeOffset - eyeSize, eyeSize, eyeSize);
            } else if (player.direction === 'left') {
                ctx.fillRect(x + eyeOffset, y + eyeOffset, eyeSize, eyeSize);
                ctx.fillRect(x + eyeOffset, y + GRID_SIZE - eyeOffset - eyeSize, eyeSize, eyeSize);
            } else if (player.direction === 'right') {
                ctx.fillRect(x + GRID_SIZE - eyeOffset - eyeSize, y + eyeOffset, eyeSize, eyeSize);
                ctx.fillRect(x + GRID_SIZE - eyeOffset - eyeSize, y + GRID_SIZE - eyeOffset - eyeSize, eyeSize, eyeSize);
            }
        } else {
            ctx.beginPath();
            ctx.arc(x + GRID_SIZE / 2, y + GRID_SIZE / 2, (GRID_SIZE / 2) - 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.globalAlpha = 1;
    });
    
    if (player.snake.length > 0) {
        const head = player.snake[0];
        ctx.fillStyle = 'white';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.name, head.x * GRID_SIZE + GRID_SIZE / 2, head.y * GRID_SIZE - 5);
    }
}

function handleGameOver() {
    gameState.isGameOver = true;
    gameState.isPlaying = false;
    
    const myPlayer = gameState.players[gameState.myId];
    if (myPlayer) {
        document.getElementById('final-score').textContent = myPlayer.score;
        document.getElementById('final-length').textContent = myPlayer.snake.length;
    }
    
    document.getElementById('game-over').classList.remove('hidden');
}

function startGame() {
    const playerName = document.getElementById('player-name').value.trim() || 'Игрок';
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Нет подключения к серверу. Попробуйте позже.');
        return;
    }
    
    ws.send(JSON.stringify({
        type: 'start',
        name: playerName
    }));
    
    gameState.isPlaying = true;
    gameState.isGameOver = false;
    document.getElementById('start-screen').classList.add('hidden');
}

function restartGame() {
    document.getElementById('game-over').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
}

function handleKeyPress(e) {
    if (!gameState.isPlaying || gameState.isGameOver) return;
    
    let direction = null;
    
    switch(e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
            direction = 'up';
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            direction = 'down';
            break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
            direction = 'left';
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            direction = 'right';
            break;
    }
    
    if (direction && direction !== lastDirection) {
        const opposites = {
            'up': 'down',
            'down': 'up',
            'left': 'right',
            'right': 'left'
        };
        
        if (lastDirection !== opposites[direction]) {
            lastDirection = direction;
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'direction',
                    direction: direction
                }));
            }
        }
    }
    
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
    }
}

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', restartGame);
document.getElementById('player-name').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        startGame();
    }
});

document.addEventListener('keydown', handleKeyPress);

connectWebSocket();

render();
