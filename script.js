// Space Shooter Game
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const restartBtn = document.getElementById('restartBtn');

const CANVAS_WIDTH = canvas.width;
const CANVAS_HEIGHT = canvas.height;

// Ship properties
const shipWidth = 30;
const shipHeight = 20;
let shipX = CANVAS_WIDTH / 2 - shipWidth / 2;
let shipY = CANVAS_HEIGHT - shipHeight - 10;
const shipSpeed = 5;

// Input handling
const keysPressed = {};
document.addEventListener('keydown', e => {
  keysPressed[e.key.toLowerCase()] = true;
});
document.addEventListener('keyup', e => {
  delete keysPressed[e.key.toLowerCase()];
});

// Bullets
const bullets = [];
const bulletWidth = 4;
const bulletHeight = 10;
const bulletSpeed = 7;

// Enemies
const enemies = [];
const enemyWidth = 30;
const enemyHeight = 20;
const enemySpeed = 2;
let enemySpawnInterval = 2000; // ms
let lastEnemySpawn = Date.now();

let score = 0;
let gameOver = false;
let animationFrameId;

function resetGame() {
  shipX = CANVAS_WIDTH / 2 - shipWidth / 2;
  shipY = CANVAS_HEIGHT - shipHeight - 10;
  bullets.length = 0;
  enemies.length = 0;
  score = 0;
  gameOver = false;
  restartBtn.style.display = 'none';
  lastEnemySpawn = Date.now();
  scoreEl.textContent = 'Score: 0';
  cancelAnimationFrame(animationFrameId);
  animationLoop();
}

function spawnEnemy() {
  const x = Math.random() * (CANVAS_WIDTH - enemyWidth);
  enemies.push({x, y: -enemyHeight});
}

function update() {
  if (gameOver) return;

  // Ship movement
  if (keysPressed['arrowleft'] || keysPressed['a']) shipX -= shipSpeed;
  if (keysPressed['arrowright'] || keysPressed['d']) shipX += shipSpeed;
  if (keysPressed['arrowup'] || keysPressed['w']) shipY -= shipSpeed;
  if (keysPressed['arrowdown'] || keysPressed['s']) shipY += shipSpeed;

  // Boundaries
  shipX = Math.max(0, Math.min(CANVAS_WIDTH - shipWidth, shipX));
  shipY = Math.max(0, Math.min(CANVAS_HEIGHT - shipHeight, shipY));

  // Shooting
  if (keysPressed[' ']) {
    // limit firing rate
    const now = Date.now();
    if (!this.lastShot || now - this.lastShot > 300) {
      bullets.push({x: shipX + shipWidth / 2 - bulletWidth / 2, y: shipY});
      this.lastShot = now;
    }
  }

  // Update bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.y -= bulletSpeed;
    if (b.y + bulletHeight < 0) bullets.splice(i, 1);
  }

  // Update enemies
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.y += enemySpeed;
    if (e.y > CANVAS_HEIGHT) {
      enemies.splice(i, 1);
      gameOver = true;
      restartBtn.style.display = 'block';
      cancelAnimationFrame(animationFrameId);
      break;
    }
  }

  // Collision detection
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      if (
        b.x < e.x + enemyWidth &&
        b.x + bulletWidth > e.x &&
        b.y < e.y + enemyHeight &&
        b.y + bulletHeight > e.y
      ) {
        // Hit
        enemies.splice(i, 1);
        bullets.splice(j, 1);
        score += 10;
        scoreEl.textContent = 'Score: ' + score;
        break;
      }
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  // Draw ship as triangle
  ctx.fillStyle = '#00f';
  ctx.beginPath();
  ctx.moveTo(shipX + shipWidth / 2, shipY);
  ctx.lineTo(shipX, shipY + shipHeight);
  ctx.lineTo(shipX + shipWidth, shipY + shipHeight);
  ctx.closePath();
  ctx.fill();

  // Draw bullets
  ctx.fillStyle = '#ff0';
  for (const b of bullets) {
    ctx.fillRect(b.x, b.y, bulletWidth, bulletHeight);
  }

  // Draw enemies
  ctx.fillStyle = '#f00';
  for (const e of enemies) {
    ctx.fillRect(e.x, e.y, enemyWidth, enemyHeight);
  }
}

function animationLoop() {
  update();
  draw();
  // Enemy spawn timing
  if (!gameOver && Date.now() - lastEnemySpawn > enemySpawnInterval) {
    spawnEnemy();
    lastEnemySpawn = Date.now();
  }
  animationFrameId = requestAnimationFrame(animationLoop);
}

restartBtn.addEventListener('click', resetGame);

// Start game
animationLoop();