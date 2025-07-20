const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const levelElement = document.getElementById('level');

// UI Elements
const startScreen = document.getElementById('start-screen');
const startButton = document.getElementById('start-button');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreElement = document.getElementById('final-score');
const restartButton = document.getElementById('restart-button');

// Audio Element
const gameBGM = document.getElementById('game-bgm');

// Next Puyo Elements
// const nextPuyoCanvas = document.getElementById('next-puyo-canvas');
// const nextPuyoCtx = nextPuyoCanvas.getContext('2d');

const COLS = 8;
const ROWS = 14; // Game area is 14 rows
const GAME_OFFSET_Y = 2; // Offset for game grid on canvas (2 rows for next puyo)
const BLOCK_SIZE = 40;
const RADIUS = BLOCK_SIZE / 2;

const ANIMALS = ['🐶', '🐱', '🐰', '🦊', '🐻'];
const ANIMAL_COLORS = {
    '🐶': '#FFDDC1',
    '🐱': '#D1E8FF',
    '🐰': '#FFD1DC',
    '🦊': '#FFEBCD',
    '🐻': '#DEB887'
};

let grid;
let score;
let level;
let puyosCleared;
let isProcessing;
let currentPuyoPair;
let nextPuyoPair;
let gameLoopId;
let animationFrameId;
let particles = [];

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.color = color;
        this.radius = Math.random() * 3 + 2;
        this.life = 30;
        this.vx = (Math.random() - 0.5) * 5;
        this.vy = (Math.random() - 0.5) * 5;
        this.opacity = 1;
    }
    update() {
        this.x += this.vx; this.y += this.vy; this.life--;
        this.opacity = Math.max(0, this.life / 30);
    }
    draw() {
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

function createBurstEffect(gridX, gridY, type) {
    const centerX = gridX * BLOCK_SIZE + RADIUS;
    const centerY = (gridY + GAME_OFFSET_Y) * BLOCK_SIZE + RADIUS; // Adjust for offset
    const color = ANIMAL_COLORS[type];
    for (let i = 0; i < 15; i++) particles.push(new Particle(centerX, centerY, color));
}

class PuyoPair {
    constructor(puyo1 = null, puyo2 = null) {
        this.x = Math.floor(COLS / 2) - 1;
        this.y = 0; // Relative to game grid
        this.puyo1 = puyo1 || ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
        this.puyo2 = puyo2 || ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
        this.rotation = 0;
    }
    getPuyoPositions() {
        const p1 = { x: this.x, y: this.y, type: this.puyo1 };
        let p2;
        switch (this.rotation) {
            case 0: p2 = { x: this.x, y: this.y - 1, type: this.puyo2 }; break;
            case 1: p2 = { x: this.x + 1, y: this.y, type: this.puyo2 }; break;
            case 2: p2 = { x: this.x, y: this.y + 1, type: this.puyo2 }; break;
            case 3: p2 = { x: this.x - 1, y: this.y, type: this.puyo2 }; break;
        }
        return [p1, p2];
    }
    move(dx, dy) { this.x += dx; this.y += dy; }
    rotate() { this.rotation = (this.rotation + 1) % 4; }
}

function drawPuyo(x, y, type, context = ctx, yOffset = 0) {
    if (type) {
        context.fillStyle = ANIMAL_COLORS[type] || '#FFFFFF';
        context.beginPath();
        context.arc(x * BLOCK_SIZE + RADIUS, (y + yOffset) * BLOCK_SIZE + RADIUS, RADIUS - 1, 0, Math.PI * 2);
        context.fill();
        context.font = `${RADIUS * 1.5}px sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(type, x * BLOCK_SIZE + RADIUS, (y + yOffset) * BLOCK_SIZE + RADIUS + 2);
    }
}

function spawnPuyo() {
    currentPuyoPair = nextPuyoPair || new PuyoPair();
    nextPuyoPair = new PuyoPair();
    if (isCollision()) gameOver();
}

function drawNextPuyo() {
    // Draw next puyo at the top of the main canvas (y=0 and y=1)
    const p1 = { x: 3, y: 0, type: nextPuyoPair.puyo1 }; // Centered horizontally
    const p2 = { x: 4, y: 0, type: nextPuyoPair.puyo2 }; // Centered horizontally
    drawPuyo(p1.x, p1.y, p1.type, ctx, 0); // yOffset is 0 for next puyo
    drawPuyo(p2.x, p2.y, p2.type, ctx, 0); // yOffset is 0 for next puyo
}

function drawGameState() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw next puyo
    drawNextPuyo();

    // Draw a line below the next puyo area
    ctx.strokeStyle = '#AAAAAA'; // Light gray line
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GAME_OFFSET_Y * BLOCK_SIZE);
    ctx.lineTo(canvas.width, GAME_OFFSET_Y * BLOCK_SIZE);
    ctx.stroke();

    // Draw game grid
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            drawPuyo(x, y, grid[y][x], ctx, GAME_OFFSET_Y);
        }
    }
    if (currentPuyoPair) {
        currentPuyoPair.getPuyoPositions().forEach(p => drawPuyo(p.x, p.y, p.type, ctx, GAME_OFFSET_Y));
    }
    particles.forEach(p => p.draw());
}

function isCollision(puyos) {
    const positions = puyos || currentPuyoPair.getPuyoPositions();
    return positions.some(p => p.x < 0 || p.x >= COLS || p.y >= ROWS || (p.y >= 0 && grid[p.y] && grid[p.y][p.x]));
}

function findMatches() {
    const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    const toClear = [];
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (grid[y][x] && !visited[y][x]) {
                const type = grid[y][x];
                const connected = [];
                const queue = [{ x, y }];
                visited[y][x] = true;
                while (queue.length > 0) {
                    const current = queue.shift();
                    connected.push(current);
                    const neighbors = [
                        { x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y },
                        { x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 },
                    ];
                    for (const neighbor of neighbors) {
                        if (neighbor.x >= 0 && neighbor.x < COLS && neighbor.y >= 0 && neighbor.y < ROWS && grid[neighbor.y][neighbor.x] === type && !visited[neighbor.y][neighbor.x]) {
                            visited[neighbor.y][neighbor.x] = true;
                            queue.push(neighbor);
                        }
                    }
                }
                if (connected.length >= 4) toClear.push(...connected);
            }
        }
    }
    return [...new Set(toClear.map(p => JSON.stringify(p)))].map(s => JSON.parse(s));
}

function applyGravity() {
    for (let x = 0; x < COLS; x++) {
        let emptyRow = ROWS - 1;
        for (let y = ROWS - 1; y >= 0; y--) {
            if (grid[y][x]) {
                if (emptyRow !== y) {
                    grid[emptyRow][x] = grid[y][x];
                    grid[y][x] = null;
                }
                emptyRow--;
            }
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function checkLevelUp(clearedCount) {
    puyosCleared += clearedCount;
    const newLevel = Math.floor(puyosCleared / 20) + 1;
    if (newLevel > level) {
        level = newLevel;
        levelElement.textContent = level;
        updateFallSpeed();
    }
}

async function handleChains() {
    isProcessing = true;
    let chain = 1;
    while (true) {
        const toClear = findMatches();
        if (toClear.length === 0) break;

        toClear.forEach(({ x, y }) => {
            createBurstEffect(x, y, grid[y][x]);
            grid[y][x] = null;
        });

        const chainBonus = Math.pow(2, chain);
        score += toClear.length * 10 * chainBonus;
        scoreElement.textContent = score;
        checkLevelUp(toClear.length);

        await sleep(300);
        applyGravity();
        await sleep(300);

        chain++;
    }
    isProcessing = false;
}

async function handleLanding() {
    const puyos = currentPuyoPair.getPuyoPositions();
    currentPuyoPair = null;
    puyos.sort((a, b) => b.y - a.y);
    for (const p of puyos) {
        let finalY = p.y;
        while (finalY + 1 < ROWS && (grid[finalY + 1][p.x] === null || grid[finalY + 1][p.x] === undefined)) {
            finalY++;
        }
        if (finalY >= 0) grid[finalY][p.x] = p.type;
    }
    await handleChains();
    spawnPuyo();
}

async function updateGameLogic() {
    if (!currentPuyoPair || isProcessing) return;
    currentPuyoPair.move(0, 1);
    if (isCollision()) {
        currentPuyoPair.move(0, -1);
        await handleLanding();
    }
}

document.addEventListener('keydown', (e) => {
    if (!currentPuyoPair || isProcessing) return;
    switch (e.key) {
        case 'ArrowLeft':
            currentPuyoPair.move(-1, 0);
            if (isCollision()) currentPuyoPair.move(1, 0);
            break;
        case 'ArrowRight':
            currentPuyoPair.move(1, 0);
            if (isCollision()) currentPuyoPair.move(-1, 0);
            break;
        case 'ArrowDown':
            updateGameLogic();
            break;
        case 'ArrowUp':
            currentPuyoPair.rotate();
            if (isCollision()) {
                currentPuyoPair.move(1, 0);
                if (isCollision()) {
                    currentPuyoPair.move(-2, 0);
                    if (isCollision()) {
                        currentPuyoPair.move(1, 0);
                        currentPuyoPair.rotation = (currentPuyoPair.rotation + 3) % 4;
                    }
                }
            }
            break;
    }
});

// Touch controls
let touchStartX = 0;
let touchStartY = 0;
let touchMoved = false;

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Prevent scrolling
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchMoved = false;
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault(); // Prevent scrolling
    if (!currentPuyoPair || isProcessing) return;

    const touchCurrentX = e.touches[0].clientX;
    const touchCurrentY = e.touches[0].clientY;

    const dx = touchCurrentX - touchStartX;
    const dy = touchCurrentY - touchStartY;

    // Determine if it's a significant move
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        touchMoved = true;
    }

    // Horizontal swipe
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) { // Threshold for horizontal swipe
        if (dx > 0) {
            currentPuyoPair.move(1, 0);
            if (isCollision()) currentPuyoPair.move(-1, 0);
        } else {
            currentPuyoPair.move(-1, 0);
            if (isCollision()) currentPuyoPair.move(1, 0);
        }
        touchStartX = touchCurrentX; // Reset start X to allow continuous swiping
    }
    // Vertical swipe (fast drop)
    else if (dy > 50) { // Threshold for fast drop
        updateGameLogic();
        touchStartY = touchCurrentY; // Reset start Y to prevent multiple drops from one swipe
    }
});

canvas.addEventListener('touchend', (e) => {
    if (!currentPuyoPair || isProcessing) return;

    // If it was a tap (not a significant move), rotate
    if (!touchMoved) {
        currentPuyoPair.rotate();
        if (isCollision()) {
            currentPuyoPair.move(1, 0);
            if (isCollision()) {
                currentPuyoPair.move(-2, 0);
                if (isCollision()) {
                    currentPuyoPair.move(1, 0);
                    currentPuyoPair.rotation = (currentPuyoPair.rotation + 3) % 4;
                }
            }
        }
    }
});

function render() {
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        if (particles[i].life <= 0) particles.splice(i, 1);
    }
    drawGameState();
    animationFrameId = requestAnimationFrame(render);
}

function updateFallSpeed() {
    clearInterval(gameLoopId);
    const fallSpeed = Math.max(100, 1000 - (level - 1) * 50);
    gameLoopId = setInterval(updateGameLogic, fallSpeed);
}

function init() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    score = 0;
    level = 1;
    puyosCleared = 0;
    isProcessing = false;
    currentPuyoPair = null;
    nextPuyoPair = null;
    particles = [];
    scoreElement.textContent = score;
    levelElement.textContent = level;
}

function startGame() {
    startScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';
    init();
    spawnPuyo(); // Spawn first puyo and next puyo
    updateFallSpeed();
    animationFrameId = requestAnimationFrame(render);
    gameBGM.play(); // Play BGM
}

function gameOver() {
    clearInterval(gameLoopId);
    cancelAnimationFrame(animationFrameId);
    finalScoreElement.textContent = score;
    gameOverScreen.style.display = 'flex';
    gameBGM.pause(); // Pause BGM
    gameBGM.currentTime = 0; // Reset BGM to start
}

startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', startGame);

init();
drawGameState();