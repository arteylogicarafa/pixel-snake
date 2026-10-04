/* =========================================================
   ui.js · interfaz DOM (sólo se toca al cambiar de estado)
   ========================================================= */

import { playSfx } from './audio.js';
import { getHighScore } from './storage.js';

const els = {};
let cbs = {};

let recordTimer = 0;

function pad(value) {
  return String(Math.max(0, Math.floor(value))).padStart(5, '0');
}

export function initUI(callbacks) {
  cbs = callbacks || {};

  els.overlay = document.getElementById('overlay');
  els.panelStart = document.getElementById('panel-start');
  els.panelPause = document.getElementById('panel-pause');
  els.panelOver = document.getElementById('panel-over');
  els.score = document.getElementById('score');
  els.high = document.getElementById('highscore');
  els.finalScore = document.getElementById('final-score');
  els.finalBest = document.getElementById('final-best');
  els.record = document.getElementById('new-record');
  els.btnPlay = document.getElementById('btn-play');
  els.btnRestart = document.getElementById('btn-restart');
  els.btnResume = document.getElementById('btn-resume');
  els.btnPause = document.getElementById('btn-pause');
  els.btnSound = document.getElementById('btn-sound');
  els.btnColor = document.getElementById('btn-color');
  els.swatch = document.getElementById('color-swatch');

  if (els.score) els.score.textContent = pad(0);
  if (els.high) els.high.textContent = pad(getHighScore());

  const click = (el, fn) => {
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      playSfx('btn');
      fn();
    });
  };

  click(els.btnPlay, () => cbs.onPlay && cbs.onPlay());
  click(els.btnRestart, () => cbs.onRestart && cbs.onRestart());
  click(els.btnResume, () => cbs.onResume && cbs.onResume());

  if (els.btnPause) {
    els.btnPause.addEventListener('click', (e) => {
      e.preventDefault();
      playSfx('btn');
      if (cbs.onPauseToggle) cbs.onPauseToggle();
    });
  }

  if (els.btnSound) {
    els.btnSound.addEventListener('click', (e) => {
      e.preventDefault();
      if (cbs.onSoundToggle) cbs.onSoundToggle();
    });
  }

  if (els.btnColor) {
    els.btnColor.addEventListener('click', (e) => {
      e.preventDefault();
      playSfx('btn');
      if (cbs.onColorToggle) cbs.onColorToggle();
    });
  }

  /* tocar el área de juego para empezar (sólo en la pantalla inicial) */
  if (els.overlay) {
    els.overlay.addEventListener('pointerdown', (e) => {
      if (els.overlay.hidden) return;
      if (els.panelStart && !els.panelStart.hidden) {
        if (cbs.onTapStart) cbs.onTapStart();
      }
    });
  }

  return cbs;
}

/* ---------------- puntuación ---------------- */

export function setScore(score, high) {
  if (els.score) els.score.textContent = pad(score);
  if (els.high) els.high.textContent = pad(high);
}

/* ---------------- vistas ---------------- */

function showView(name) {
  if (!els.overlay) return;
  els.overlay.hidden = name === 'none';
  els.panelStart.hidden = name !== 'start';
  els.panelPause.hidden = name !== 'pause';
  els.panelOver.hidden = name !== 'over';
}

function setPauseIcon(paused) {
  if (!els.btnPause) return;
  els.btnPause.textContent = paused ? '▶' : '⏸';
  els.btnPause.setAttribute('aria-label', paused ? 'Reanudar juego' : 'Pausar juego');
}

export function showState(state) {
  if (state === 'menu') {
    showView('start');
    if (els.btnPause) els.btnPause.disabled = true;
    setPauseIcon(false);
  } else if (state === 'playing') {
    showView('none');
    if (els.btnPause) els.btnPause.disabled = false;
    setPauseIcon(false);
  } else if (state === 'paused') {
    showView('pause');
    if (els.btnPause) els.btnPause.disabled = false;
    setPauseIcon(true);
  }
}

export function showGameOver(result) {
  if (els.finalScore) els.finalScore.textContent = String(result.score);
  if (els.finalBest) els.finalBest.textContent = String(result.best);
  if (els.btnPause) els.btnPause.disabled = true;
  setPauseIcon(false);
  showView('over');
  if (result.isNew) showRecord();
}

export function showRecord() {
  if (!els.record) return;
  els.record.hidden = false;
  clearTimeout(recordTimer);
  recordTimer = setTimeout(() => {
    els.record.hidden = true;
  }, 1800);
}

export function setMuted(muted) {
  if (!els.btnSound) return;
  els.btnSound.textContent = muted ? '🔇' : '🔊';
  els.btnSound.setAttribute('aria-pressed', muted ? 'true' : 'false');
  els.btnSound.setAttribute('aria-label', muted ? 'Activar sonido' : 'Desactivar sonido');
}

export function setPaletteUI(name, hex) {
  if (els.swatch && hex) els.swatch.style.background = hex;
  if (els.btnColor) {
    els.btnColor.setAttribute('aria-label', 'Color de la serpiente: ' + name + '. Cambiar color');
    els.btnColor.setAttribute('title', 'Color: ' + name);
  }
}
