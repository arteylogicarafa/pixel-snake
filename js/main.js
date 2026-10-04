/* =========================================================
   main.js · arranque, wiring y registro del service worker
   ========================================================= */

import { Game } from './game.js';
import { initInput } from './input.js';
import { initUI, setScore, showState, showGameOver, setMuted } from './ui.js';
import { playSfx, setAudioMuted, isAudioMuted, unlockAudio } from './audio.js';
import { getMuted, setMuted as persistMuted } from './storage.js';

const canvas = document.getElementById('game');
const stage = document.getElementById('stage');

let game = null;

const ui = initUI({
  onPlay: () => game.start(),
  onRestart: () => game.start(),
  onResume: () => game.resume(),
  onPauseToggle: () => game.togglePause(),
  onTapStart: () => game.start(),
  onSoundToggle: () => {
    const next = !isAudioMuted();
    setAudioMuted(next);
    persistMuted(next);
    setMuted(next);
    if (!next) playSfx('btn');
  }
});

game = new Game(canvas, stage, {
  onScore: (score, high) => setScore(score, high),
  onState: (state) => showState(state),
  onGameOver: (result) => showGameOver(result)
});

initInput({ onAction: (action) => game.handle(action) });

const muted = getMuted();
setAudioMuted(muted);
setMuted(muted);

game.fit();
game.startMenu();

/* ---- pantalla de carga ---- */
(function bootLoading() {
  const box = document.getElementById('loading');
  if (!box) return;
  const t0 = performance.now();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    const wait = Math.max(0, 1300 - (performance.now() - t0));
    setTimeout(() => {
      box.classList.add('is-hidden');
      setTimeout(() => {
        if (box.parentNode) box.parentNode.removeChild(box);
      }, 450);
    }, wait);
  };
  const img = document.getElementById('loading-logo');
  if (img && img.complete && img.naturalWidth > 0) finish();
  else if (img) {
    img.addEventListener('load', finish, { once: true });
    img.addEventListener('error', finish, { once: true });
  } else {
    finish();
  }
  setTimeout(finish, 4500);
})();

/* ---- resize / orientación ---- */
let resizeTimer = 0;
const refit = () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => game.fit(), 60);
};

window.addEventListener('resize', refit);
window.addEventListener('orientationchange', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => game.fit(), 180);
});

if (window.ResizeObserver) {
  const ro = new ResizeObserver(() => game.fit());
  ro.observe(stage);
}

/* ---- pausa automática al perder el foco ---- */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing') game.pause();
});

/* ---- primera interacción: desbloquea el audio ---- */
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

/* ---- PWA ---- */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
