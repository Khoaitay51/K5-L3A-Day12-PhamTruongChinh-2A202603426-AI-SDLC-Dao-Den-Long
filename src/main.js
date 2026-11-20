import { GameSimulation } from './core/sim.js';
import { DT, TUNING } from './core/config.js';
import { GameView } from './render/GameView.js';
import { AudioManager } from './render/AudioManager.js';

const app = document.getElementById('app');
const view = new GameView(app);
const audio = new AudioManager();

const hudFlames = document.getElementById('hud-flames');
const hudTimer = document.getElementById('hud-timer');
const hudScore = document.getElementById('hud-score');
const hudCarriedText = document.getElementById('hud-carried-text');
const hudMotes = document.getElementById('hud-motes');
const hudPulse = document.getElementById('hud-pulse');
const hudPrompt = document.getElementById('hud-prompt');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayDesc = document.getElementById('overlay-desc');
const overlayBtn = document.getElementById('overlay-btn');

for (let i = 0; i < TUNING.carryCapacity; i++) {
  const slot = document.createElement('div');
  slot.className = 'mote-slot';
  hudMotes.appendChild(slot);
}

let sim = new GameSimulation({ seed: 1, night: 1 });
let running = false;
let camYawDeg = 0;
const keys = new Set();

window.addEventListener('keydown', (e) => keys.add(e.code));
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('mousemove', (e) => {
  if (running && (document.pointerLockElement || e.buttons === 1)) {
    camYawDeg = (camYawDeg - e.movementX * 0.25) % 360;
  }
});

function startNewGame() {
  sim = new GameSimulation({ seed: Date.now() & 0xffff, night: 1 });
  running = true;
  overlay.classList.add('hidden');
}

overlayBtn.addEventListener('click', startNewGame);

function updateHud() {
  hudFlames.textContent = `Ngọn Lửa: ${sim.player.flames}`;
  const sec = Math.ceil(sim.timeLeftTicks / 60);
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  hudTimer.textContent = `${mm}:${ss}`;
  hudTimer.classList.toggle('danger', sec <= 30);

  const lit = sim.lanterns.filter((l) => l.lit).length;
  hudScore.textContent = `Đèn: ${lit}/${sim.lanterns.length} · Điểm: ${sim.score}`;
  hudCarriedText.textContent = `Đom đóm: ${sim.player.carried}/${TUNING.carryCapacity}`;

  const slots = hudMotes.children;
  for (let i = 0; i < slots.length; i++) {
    slots[i].classList.toggle('filled', i < sim.player.carried);
  }

  if (sim.player.pulseCdTicks > 0) {
    hudPulse.textContent = `Tỏa Sáng (Q): ${(sim.player.pulseCdTicks / 60).toFixed(1)}s`;
  } else if (sim.player.carried < TUNING.pulseCost) {
    hudPulse.textContent = `Tỏa Sáng (Q): Cần ${TUNING.pulseCost} đom đóm`;
  } else {
    hudPulse.textContent = 'Tỏa Sáng (Q): Sẵn sàng';
  }

  const nearUnlit = sim.lanterns.some(
    (l) => !l.lit && Math.hypot(l.pos[0] - sim.player.pos[0], l.pos[2] - sim.player.pos[2]) <= TUNING.interactRadius
  );
  hudPrompt.style.display = nearUnlit ? 'block' : 'none';
}

let lastTime = performance.now();
let acc = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  if (running && sim.state === 'playing') {
    acc += dt;
    while (acc >= DT && sim.state === 'playing') {
      const mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const mz = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const events = sim.step({
        move: [mx, mz],
        cam_yaw_deg: camYawDeg,
        jump: keys.has('Space'),
        interact: keys.has('KeyE'),
        pulse: keys.has('KeyQ'),
      });
      for (const ev of events) {
        audio.playEvent(ev.name);
        if (ev.name === 'pulse') view.triggerPulseVisual();
      }
      acc -= DT;
    }
    if (sim.state !== 'playing') {
      running = false;
      overlay.classList.remove('hidden');
      overlayTitle.textContent = sim.state === 'won' ? 'Thắng Đêm 1!' : 'Thua cuộc';
      overlayDesc.textContent = `Kết quả: ${sim.endReason} · Điểm số: ${sim.score}`;
      overlayBtn.textContent = 'Chơi lại';
    }
  }

  updateHud();
  view.sync(sim, camYawDeg, now / 1000);
}

requestAnimationFrame(loop);
