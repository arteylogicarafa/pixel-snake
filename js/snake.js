/* =========================================================
   snake.js · modelo de la serpiente (rejilla lógica)
   La cola se procesa para evitar giros de 180° a alta velocidad
   ========================================================= */

export const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

export const OPPOSITE = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left'
};

export const START_LENGTH = 3;
export const MAX_QUEUE = 2;

export class Snake {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.reset();
  }

  reset() {
    const y = Math.floor(this.rows / 2);
    const headX = Math.max(START_LENGTH, Math.floor(this.cols * 0.35));
    this.body = [];
    for (let i = 0; i < START_LENGTH; i++) {
      this.body.push({ x: headX - i, y });
    }
    this.dir = 'right';
    this.queue = [];
    this.alive = true;
  }

  get head() {
    return this.body[0];
  }

  get length() {
    return this.body.length;
  }

  get hitbox() {
    const h = this.body[0];
    return { x: h.x, y: h.y, w: 1, h: 1 };
  }

  /* encola una dirección; devuelve false si se ignora */
  queueDir(name) {
    const vec = DIRS[name];
    if (!vec || !this.alive) return false;
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (name === last) return false;
    if (OPPOSITE[last] === name) return false;
    if (this.queue.length >= MAX_QUEUE) return false;
    this.queue.push(name);
    return true;
  }

  /* siguiente cabeza sin consumir la cola (para anticipar colisiones) */
  peek() {
    const next = this.queue.length ? this.queue[0] : this.dir;
    const v = DIRS[next];
    return { x: this.head.x + v.x, y: this.head.y + v.y };
  }

  /* avanza un turno; devuelve la nueva cabeza */
  step() {
    if (this.queue.length) this.dir = this.queue.shift();
    const v = DIRS[this.dir];
    const head = { x: this.body[0].x + v.x, y: this.body[0].y + v.y };
    this.body.pop();
    this.body.unshift(head);
    return head;
  }

  /* hace crecer duplicando el último segmento */
  grow(times = 1) {
    for (let i = 0; i < times; i++) {
      const tail = this.body[this.body.length - 1];
      this.body.push({ x: tail.x, y: tail.y });
    }
  }

  occupies(col, row) {
    for (let i = 0; i < this.body.length; i++) {
      if (this.body[i].x === col && this.body[i].y === row) return true;
    }
    return false;
  }
}
