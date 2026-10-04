/* =========================================================
   storage.js · récord y ajustes en localStorage
   ========================================================= */

const KEY_SCORE = 'pixelSnakeHighScore';
const KEY_MUTE = 'pixelSnakeMuted';

let memScore = 0;
let memMute = false;

function safeGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (err) {
    /* modo privado / almacenamiento no disponible */
  }
}

export function getHighScore() {
  const raw = safeGet(KEY_SCORE);
  const parsed = raw == null ? 0 : parseInt(raw, 10);
  const value = Number.isFinite(parsed) ? parsed : 0;
  if (value > memScore) memScore = value;
  return memScore;
}

export function saveHighScore(value) {
  const score = Math.max(0, Math.floor(Number(value) || 0));
  if (score <= memScore) return false;
  memScore = score;
  safeSet(KEY_SCORE, String(score));
  return true;
}

export function getMuted() {
  if (memMute) return true;
  return safeGet(KEY_MUTE) === '1';
}

export function setMuted(value) {
  memMute = !!value;
  safeSet(KEY_MUTE, memMute ? '1' : '0');
}
