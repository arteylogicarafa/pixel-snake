/* =========================================================
   collision.js · colisiones AABB sobre celdas del tablero
   ========================================================= */

export function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export function cellRect(col, row, cell) {
  return { x: col * cell, y: row * cell, w: cell, h: cell };
}

export function insideBounds(rect, width, height) {
  return rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= width && rect.y + rect.h <= height;
}

/**
 * checkCollision(a, b)
 * Acepta objetos con getter `.hitbox` o rects planos {x,y,w,h}.
 */
export function checkCollision(a, b) {
  if (!a || !b) return false;
  const ra = a.hitbox || a;
  const rb = b.hitbox || b;
  if (!ra || !rb) return false;
  return rectsOverlap(ra, rb);
}
