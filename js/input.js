/* =========================================================
   input.js · teclado + pad táctil + gestos sobre el canvas
   Todas las fuentes emiten las mismas acciones:
   up / down / left / right / pause / confirm
   ========================================================= */

import { unlockAudio } from './audio.js';

const KEY_MAP = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  KeyP: 'pause',
  Escape: 'pause',
  Enter: 'confirm',
  Space: 'confirm'
};

const PREVENT = {
  ArrowUp: true,
  ArrowDown: true,
  ArrowLeft: true,
  ArrowRight: true,
  KeyW: true,
  KeyA: true,
  KeyS: true,
  KeyD: true,
  Space: true,
  Enter: true
};

const BUTTON_ACTIONS = [
  ['btn-up', 'up'],
  ['btn-down', 'down'],
  ['btn-left', 'left'],
  ['btn-right', 'right']
];

const SWIPE_MIN = 24;
const TAP_MS = 350;

let onAction = null;
let bound = false;
let lastPointerAt = 0;

function emit(name) {
  unlockAudio();
  if (onAction) onAction(name);
}

/* ---------------- teclado ---------------- */

function bindKeyboard() {
  window.addEventListener('keydown', (e) => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    if (PREVENT[e.code]) e.preventDefault();
    if (e.repeat) return;
    emit(action);
  });
}

/* ---------------- botones del pad ---------------- */

function bindButton(id, action) {
  const el = document.getElementById(id);
  if (!el) return;

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    lastPointerAt = performance.now();
    el.classList.add('is-active');
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    emit(action);
  });

  const release = () => el.classList.remove('is-active');

  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', release);
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  /* accesibilidad: activación por teclado del propio botón */
  el.addEventListener('click', (e) => {
    if (e.detail !== 0) return;
    if (performance.now() - lastPointerAt < 600) return;
    emit(action);
  });
}

/* ---------------- gestos sobre el canvas ----------------
   deslizar  → dirección
   tocar     → confirmar (iniciar / reanudar / reiniciar)
--------------------------------------------------------- */

function bindCanvas() {
  const canvas = document.getElementById('game');
  if (!canvas) return;

  let gesture = null;

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    gesture = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      fired: false
    };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!gesture || e.pointerId !== gesture.id || gesture.fired) return;
    const dx = e.clientX - gesture.x;
    const dy = e.clientY - gesture.y;
    if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
    gesture.fired = true;
    if (Math.abs(dx) > Math.abs(dy)) emit(dx > 0 ? 'right' : 'left');
    else emit(dy > 0 ? 'down' : 'up');
  });

  const endGesture = (e) => {
    if (!gesture || (e && e.pointerId !== gesture.id)) return;
    if (!gesture.fired && performance.now() - gesture.t < TAP_MS) emit('confirm');
    gesture = null;
  };

  canvas.addEventListener('pointerup', endGesture);
  canvas.addEventListener('pointercancel', () => { gesture = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

/* ---------------- init ---------------- */

export function initInput(handlers) {
  onAction = handlers && handlers.onAction ? handlers.onAction : null;
  if (bound) return;
  bound = true;
  bindKeyboard();
  BUTTON_ACTIONS.forEach((pair) => bindButton(pair[0], pair[1]));
  bindCanvas();
}
