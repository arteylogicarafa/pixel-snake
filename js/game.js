/* =========================================================
   game.js · bucle, lógica de turno y render pixel-art
   Estados: menu / playing / paused / dead
   Tablero fijo 16×16 escalado dinámicamente al contenedor
   ========================================================= */

import { Snake, DIRS } from './snake.js';
import { FoodField, NORMAL_PTS, GOLD_PTS } from './food.js';
import { rectsOverlap, cellRect, insideBounds } from './collision.js';
import { playSfx } from './audio.js';
import { getHighScore, saveHighScore } from './storage.js';

export const COLS = 16;
export const ROWS = 16;
export const CELL = 24;
export const VIEW = COLS * CELL;

const BASE_STEP = 0.17;
const MIN_STEP = 0.085;
const STEP_DECAY = 0.011;
const DEAD_REPORT = 0.5;

const PALETTE = {
  board: '#0f1730',
  boardAlt: '#131e3c',
  frame: '#26325c',
  frameHi: '#3b4b85',
  snake: '#3ddc84',
  snakeAlt: '#2bbd72',
  snakeHi: '#a7ffcf',
  snakeLo: '#178a52',
  outline: '#05240f',
  head: '#4ff29a',
  apple: '#ff4d6d',
  appleHi: '#ffc2cf',
  appleLo: '#c1173a',
  leaf: '#3ddc84',
  stem: '#7a4a2b',
  gold: '#ffd23f',
  goldHi: '#fff7cf',
  goldLo: '#c99a00',
  tongue: '#ff7a9c',
  eye: '#05240f'
};

function rand(min, max) {
  return min + Math.random() * (max - min);
}

export class Game {
  constructor(canvas, container, hooks) {
    this.canvas = canvas;
    this.container = container;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.hooks = hooks || {};

    this.state = 'menu';
    this.snake = new Snake(COLS, ROWS);
    this.food = new FoodField(COLS, ROWS);

    this.particles = [];
    this.dpr = 1;
    this.scale = 1;

    this.high = getHighScore();

    this.raf = 0;
    this.lastT = 0;
    this.time = 0;
    this.elapsed = 0;
    this.acc = 0;
    this.score = 0;
    this.deadT = 0;
    this.reported = false;
    this.shownScore = -1;
    this.shownHigh = -1;

    this.reset();
    this.loop = this.loop.bind(this);
  }

  /* ---------------- ciclo de vida ---------------- */

  reset() {
    this.snake.reset();
    this.food.reset();
    this.food.spawn(this.snake);
    this.particles.length = 0;
    this.score = 0;
    this.elapsed = 0;
    this.acc = 0;
    this.deadT = 0;
    this.reported = false;
    this.shownScore = -1;
    this.shownHigh = -1;
  }

  startMenu() {
    this.reset();
    this.state = 'menu';
    if (this.hooks.onState) this.hooks.onState('menu');
    this.startLoop();
    this.draw();
  }

  start() {
    if (this.state === 'playing') return;
    this.reset();
    this.state = 'playing';
    playSfx('start');
    if (this.hooks.onState) this.hooks.onState('playing');
    this.startLoop();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    playSfx('pause');
    this.stopLoop();
    this.draw();
    if (this.hooks.onState) this.hooks.onState('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    playSfx('resume');
    if (this.hooks.onState) this.hooks.onState('playing');
    this.startLoop();
  }

  togglePause() {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  startLoop() {
    this.stopLoop();
    this.lastT = 0;
    this.raf = requestAnimationFrame(this.loop);
  }

  stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /* ---------------- entrada ---------------- */

  handle(action) {
    if (action === 'pause') {
      this.togglePause();
      return;
    }
    if (action === 'confirm') {
      if (this.state === 'menu') this.start();
      else if (this.state === 'paused') this.resume();
      else if (this.state === 'dead' && this.deadT >= DEAD_REPORT) this.start();
      return;
    }
    if (this.state !== 'playing') return;
    this.snake.queueDir(action);
  }

  /* ---------------- bucle ---------------- */

  loop(t) {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.lastT) this.lastT = t;
    let dt = (t - this.lastT) / 1000;
    this.lastT = t;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;

    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'dead') this.updateDead(dt);
    else this.time += dt;

    this.draw();
  }

  stepInterval() {
    return Math.max(MIN_STEP, BASE_STEP - this.food.eaten * STEP_DECAY);
  }

  update(dt) {
    this.time += dt;
    this.elapsed += dt;
    this.food.update(dt);
    this.updateFx(dt);

    this.acc += dt;
    const step = this.stepInterval();
    let guard = 0;
    while (this.acc >= step && guard < 4) {
      this.acc -= step;
      guard++;
      this.tick();
      if (this.state !== 'playing') break;
    }
  }

  updateDead(dt) {
    this.time += dt;
    this.deadT += dt;
    this.updateFx(dt);

    if (!this.reported && this.deadT >= DEAD_REPORT) {
      this.reported = true;
      const finalScore = Math.floor(this.score);
      const isNew = finalScore > this.high;
      if (isNew) {
        this.high = finalScore;
        saveHighScore(finalScore);
        playSfx('record');
      }
      if (this.hooks.onGameOver) {
        this.hooks.onGameOver({ score: finalScore, best: this.high, isNew });
      }
    }
  }

  /* un turno de la serpiente: mover, comer, chocar */
  tick() {
    const head = this.snake.step();
    const hr = cellRect(head.x, head.y, CELL);

    if (!insideBounds(hr, VIEW, VIEW)) {
      this.die();
      return;
    }

    const apple = this.food.apple;
    if (apple && rectsOverlap(hr, cellRect(apple.x, apple.y, CELL))) {
      this.score += NORMAL_PTS;
      this.food.eatApple();
      this.food.spawn(this.snake);
      this.food.onAppleEaten(this.snake);
      this.snake.grow();
      playSfx('eat');
      this.burst(apple.x * CELL + CELL / 2, apple.y * CELL + CELL / 2, 8,
        [PALETTE.apple, PALETTE.appleHi, PALETTE.snakeHi]);
      this.pushScore();
    }

    const gold = this.food.gold;
    if (gold && rectsOverlap(hr, cellRect(gold.x, gold.y, CELL))) {
      this.score += GOLD_PTS;
      this.food.eatGold();
      playSfx('gold');
      this.burst(gold.x * CELL + CELL / 2, gold.y * CELL + CELL / 2, 12,
        [PALETTE.gold, PALETTE.goldHi, PALETTE.snakeHi]);
      this.pushScore();
    }

    const body = this.snake.body;
    for (let i = 1; i < body.length; i++) {
      if (rectsOverlap(hr, cellRect(body[i].x, body[i].y, CELL))) {
        this.die();
        return;
      }
    }

    this.pushScore();
  }

  die() {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.deadT = 0;
    this.reported = false;
    this.snake.alive = false;
    playSfx('die');
    const h = this.snake.head;
    this.burst(h.x * CELL + CELL / 2, h.y * CELL + CELL / 2, 18,
      [PALETTE.snake, PALETTE.snakeHi, PALETTE.snakeLo]);
    this.pushScore();
    if (this.hooks.onState) this.hooks.onState('dead');
  }

  pushScore() {
    const s = Math.floor(this.score);
    const hi = Math.max(this.high, s);
    if (s === this.shownScore && hi === this.shownHigh) return;
    this.shownScore = s;
    this.shownHigh = hi;
    if (this.hooks.onScore) this.hooks.onScore(s, hi);
  }

  /* ---------------- partículas ---------------- */

  burst(x, y, count, colors) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length > 80) break;
      const angle = rand(0, Math.PI * 2);
      const speed = rand(40, 150);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        life: rand(0.3, 0.7),
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.round(rand(2, 5)),
        grav: 320
      });
    }
  }

  updateFx(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  /* ---------------- tamaño / escalado ---------------- */

  fit() {
    const cs = window.getComputedStyle(this.container);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const availW = this.container.clientWidth - padX;
    const availH = this.container.clientHeight - padY;
    if (availW < 40 || availH < 40) return;

    const size = Math.max(160, Math.floor(Math.min(availW, availH, 640)));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);

    this.canvas.style.width = size + 'px';
    this.canvas.style.height = size + 'px';
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);

    this.dpr = dpr;
    this.scale = (size * dpr) / VIEW;
    this.draw();
  }

  /* ---------------- render ---------------- */

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.drawBoard(ctx);
    this.drawFood(ctx);
    this.drawSnake(ctx);
    this.drawFx(ctx);
  }

  drawBoard(ctx) {
    ctx.fillStyle = PALETTE.board;
    ctx.fillRect(0, 0, VIEW, VIEW);

    ctx.fillStyle = PALETTE.boardAlt;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if ((row + col) % 2 === 0) ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
      }
    }

    ctx.fillStyle = PALETTE.frame;
    ctx.fillRect(0, 0, VIEW, 4);
    ctx.fillRect(0, VIEW - 4, VIEW, 4);
    ctx.fillRect(0, 0, 4, VIEW);
    ctx.fillRect(VIEW - 4, 0, 4, VIEW);

    ctx.fillStyle = PALETTE.frameHi;
    ctx.fillRect(4, 4, VIEW - 8, 2);
    ctx.fillRect(4, 4, 2, VIEW - 8);
  }

  drawFood(ctx) {
    const apple = this.food.apple;
    if (apple) {
      const x = apple.x * CELL;
      const y = apple.y * CELL + Math.round(Math.sin(this.time * 3) * 1.5);
      ctx.fillStyle = PALETTE.appleLo;
      ctx.fillRect(x + 5, y + 8, 14, 13);
      ctx.fillStyle = PALETTE.apple;
      ctx.fillRect(x + 5, y + 7, 14, 11);
      ctx.fillStyle = PALETTE.appleHi;
      ctx.fillRect(x + 7, y + 9, 4, 3);
      ctx.fillStyle = PALETTE.stem;
      ctx.fillRect(x + 11, y + 3, 2, 5);
      ctx.fillStyle = PALETTE.leaf;
      ctx.fillRect(x + 13, y + 3, 6, 3);
    }

    const gold = this.food.gold;
    if (gold) {
      const blink = gold.ttl < 2 && Math.floor(this.time * 6) % 2 === 0;
      ctx.globalAlpha = blink ? 0.35 : 1;
      const x = gold.x * CELL;
      const y = gold.y * CELL;
      ctx.fillStyle = PALETTE.goldLo;
      ctx.fillRect(x + 6, y + 4, 12, 16);
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(x + 4, y + 6, 16, 12);
      ctx.fillRect(x + 8, y + 4, 8, 16);
      ctx.fillStyle = PALETTE.goldHi;
      ctx.fillRect(x + 8, y + 7, 4, 4);
      ctx.globalAlpha = 1;
    }
  }

  drawSnake(ctx) {
    const body = this.snake.body;
    for (let i = body.length - 1; i >= 0; i--) {
      const seg = body[i];
      if (seg.x < 0 || seg.y < 0 || seg.x >= COLS || seg.y >= ROWS) continue;
      const x = seg.x * CELL;
      const y = seg.y * CELL;
      const isHead = i === 0;
      const alt = i % 2 === 1;

      ctx.fillStyle = PALETTE.outline;
      ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);

      ctx.fillStyle = isHead ? PALETTE.head : alt ? PALETTE.snakeAlt : PALETTE.snake;
      ctx.fillRect(x + 3, y + 3, CELL - 6, CELL - 6);

      ctx.fillStyle = PALETTE.snakeHi;
      ctx.fillRect(x + 4, y + 4, 7, 3);
      ctx.fillStyle = PALETTE.snakeLo;
      ctx.fillRect(x + 4, y + CELL - 7, CELL - 8, 3);
    }

    const head = body[0];
    if (head.x >= 0 && head.y >= 0 && head.x < COLS && head.y < ROWS) {
      this.drawHead(ctx, head.x * CELL, head.y * CELL);
    }
  }

  drawHead(ctx, x, y) {
    const dir = this.snake.dir;
    const eyes = {
      right: [[14, 5], [14, 14]],
      left: [[5, 5], [5, 14]],
      up: [[5, 5], [14, 5]],
      down: [[5, 14], [14, 14]]
    }[dir] || [[14, 5], [14, 14]];

    const pupil = { right: [2, 1], left: [-1, 1], up: [1, -1], down: [1, 2] }[dir] || [1, 1];

    for (let i = 0; i < eyes.length; i++) {
      const ex = x + eyes[i][0];
      const ey = y + eyes[i][1];
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ex, ey, 5, 5);
      ctx.fillStyle = PALETTE.eye;
      ctx.fillRect(ex + pupil[0], ey + pupil[1], 3, 3);
    }

    if (Math.floor(this.time * 3) % 3 !== 0) return;
    ctx.fillStyle = PALETTE.tongue;
    const v = DIRS[dir];
    const cx = x + CELL / 2 + v.x * 13;
    const cy = y + CELL / 2 + v.y * 13;
    if (v.x !== 0) {
      ctx.fillRect(Math.round(cx), Math.round(cy) - 1, 5, 2);
    } else {
      ctx.fillRect(Math.round(cx) - 1, Math.round(cy), 2, 5);
    }
  }

  drawFx(ctx) {
    const particles = this.particles;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.25));
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
}
