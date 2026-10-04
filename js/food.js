/* =========================================================
   food.js · manzana normal + bonus dorado con caducidad
   ========================================================= */

export const NORMAL_PTS = 10;
export const GOLD_PTS = 50;
export const GOLD_TTL = 6;
export const GOLD_EVERY = 5;

export class FoodField {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.reset();
  }

  reset() {
    this.apple = null;
    this.gold = null;
    this.eaten = 0;
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
    if (this.gold) {
      this.gold.ttl -= dt;
      if (this.gold.ttl <= 0) this.gold = null;
    }
  }

  isFree(col, row, snake) {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return false;
    if (snake.occupies(col, row)) return false;
    if (this.apple && this.apple.x === col && this.apple.y === row) return false;
    if (this.gold && this.gold.x === col && this.gold.y === row) return false;
    return true;
  }

  /* celda libre al azar (barrido parcial + reintento) */
  freeCell(snake) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const col = Math.floor(Math.random() * this.cols);
      const row = Math.floor(Math.random() * this.rows);
      if (this.isFree(col, row, snake)) return { x: col, y: row };
    }
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        if (this.isFree(col, row, snake)) return { x: col, y: row };
      }
    }
    return null;
  }

  spawn(snake) {
    this.apple = this.freeCell(snake);
    return this.apple;
  }

  /* tras cada manzana comprobada nació el bonus dorado */
  onAppleEaten(snake) {
    this.eaten++;
    if (this.eaten % GOLD_EVERY === 0 && !this.gold) {
      this.gold = this.freeCell(snake);
      if (this.gold) this.gold.ttl = GOLD_TTL;
    }
  }

  eatApple() {
    this.apple = null;
  }

  eatGold() {
    this.gold = null;
  }
}
