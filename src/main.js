import { GameSimulation } from './core/sim.js';
import { DT, TUNING } from './core/config.js';
import { MAPS } from './core/maps.js';
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
const hudSkills = document.getElementById('hud-skills');
const hudPrompt = document.getElementById('hud-prompt');
const lanternArrow = document.getElementById('lantern-arrow');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayDesc = document.getElementById('overlay-desc');
const overlayActions = document.getElementById('overlay-actions');
const settingsPanel = document.getElementById('settings-panel');
const optVol = document.getElementById('opt-vol');
const optSens = document.getElementById('opt-sens');

for (let i = 0; i < TUNING.carryCapacity; i++) {
  const slot = document.createElement('div');
  slot.className = 'mote-slot';
  hudMotes.appendChild(slot);
}

const savedSettings = JSON.parse(localStorage.getItem('ddl_settings') || '{}');
let mouseSens = savedSettings.sens ?? 0.25;
audio.setVolume(savedSettings.vol ?? 0.5);
optVol.value = String(audio.volume);
optSens.value = String(mouseSens);

function saveSettings() {
  localStorage.setItem('ddl_settings', JSON.stringify({ vol: audio.volume, sens: mouseSens }));
}
optVol.addEventListener('input', () => {
  audio.setVolume(Number(optVol.value));
  saveSettings();
});
optSens.addEventListener('input', () => {
  mouseSens = Number(optSens.value);
  saveSettings();
});

let currentNight = 1;
let campaignScore = 0;
let sim = new GameSimulation({ seed: 1, night: 1 });
let mode = 'menu'; // 'menu' | 'intro' | 'playing' | 'paused' | 'result'
let camYawDeg = 0;
const keys = new Set();

function showOverlay(title, desc, buttons, showSettings = false) {
  overlay.classList.remove('hidden');
  overlayTitle.textContent = title;
  overlayDesc.textContent = desc;
  settingsPanel.classList.toggle('open', showSettings);
  overlayActions.innerHTML = '';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.className = b.secondary ? 'btn secondary' : 'btn';
    btn.textContent = b.label;
    btn.addEventListener('click', b.onClick);
    overlayActions.appendChild(btn);
  }
}

function showMainMenu() {
  mode = 'menu';
  currentNight = 1;
  campaignScore = 0;
  showOverlay(
    'Đảo Đèn Lồng',
    'Hành trình 3 Đêm cùng Mây thắp sáng Đảo Bến, Đảo Cau và Đảo Chuông.',
    [
      { label: 'Bắt đầu Đêm 1', onClick: () => showIntro(1) },
      { label: 'Cài đặt', secondary: true, onClick: () => showOverlay('Cài đặt', 'Điều chỉnh âm thanh và chuột.', [{ label: 'Quay lại', onClick: showMainMenu }], true) },
    ]
  );
}

function showIntro(night) {
  mode = 'intro';
  currentNight = night;
  const map = MAPS[night];
  showOverlay(map.name, map.intro, [
    {
      label: 'Vào Đêm',
      onClick: () => {
        sim = new GameSimulation({ seed: (Date.now() & 0xffff) + night, night });
        mode = 'playing';
        overlay.classList.add('hidden');
      },
    },
  ]);
}

function togglePause() {
  if (mode === 'playing') {
    mode = 'paused';
    showOverlay(
      'Tạm dừng',
      MAPS[currentNight].name,
      [
        { label: 'Tiếp tục', onClick: () => { mode = 'playing'; overlay.classList.add('hidden'); } },
        { label: 'Chơi lại Đêm', secondary: true, onClick: () => showIntro(currentNight) },
        { label: 'Về menu', secondary: true, onClick: showMainMenu },
      ],
      true
    );
  } else if (mode === 'paused') {
    mode = 'playing';
    overlay.classList.add('hidden');
  }
}

window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat && (mode === 'playing' || mode === 'paused')) {
    togglePause();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('mousemove', (e) => {
  if (mode === 'playing' && (document.pointerLockElement || e.buttons === 1)) {
    camYawDeg = (camYawDeg - e.movementX * mouseSens) % 360;
  }
});

function updateHud() {
  hudFlames.textContent = `Ngọn Lửa: ${sim.player.flames}`;
  const sec = Math.ceil(sim.timeLeftTicks / 60);
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  hudTimer.textContent = `${mm}:${ss}`;
  hudTimer.classList.toggle('danger', sec <= 30);

  const lit = sim.lanterns.filter((l) => l.lit).length;
  hudScore.textContent = `Đèn: ${lit}/${sim.lanterns.length} · Điểm: ${campaignScore + sim.score}`;
  hudCarriedText.textContent = `Đom đóm: ${sim.player.carried}/${TUNING.carryCapacity}`;

  const slots = hudMotes.children;
  for (let i = 0; i < slots.length; i++) {
    slots[i].classList.toggle('filled', i < sim.player.carried);
  }

  const dashText = sim.player.charmTicks > 0 ? 'Lướt: Bùa!' : sim.player.dashCdTicks > 0 ? `Lướt: ${(sim.player.dashCdTicks / 60).toFixed(1)}s` : 'Lướt: Sẵn sàng';
  const pulseText = sim.player.pulseCdTicks > 0 ? `Tỏa Sáng: ${(sim.player.pulseCdTicks / 60).toFixed(1)}s` : 'Tỏa Sáng: Sẵn sàng';
  hudSkills.textContent = `${dashText} · ${pulseText}`;

  const nearUnlit = sim.lanterns.find(
    (l) => !l.lit && Math.hypot(l.pos[0] - sim.player.pos[0], l.pos[2] - sim.player.pos[2]) <= TUNING.interactRadius
  );
  if (nearUnlit) {
    hudPrompt.textContent = `E — Nạp ánh sáng (${nearUnlit.deposited}/${TUNING.lanternCost})`;
    hudPrompt.style.display = 'block';
  } else {
    hudPrompt.style.display = 'none';
  }

  // Offscreen nearest unlit lantern arrow
  let nearest = null;
  let minD = Infinity;
  for (const l of sim.lanterns) {
    if (l.lit) continue;
    const d = Math.hypot(l.pos[0] - sim.player.pos[0], l.pos[2] - sim.player.pos[2]);
    if (d < minD) {
      minD = d;
      nearest = l;
    }
  }
  if (nearest && mode === 'playing') {
    const scr = view.projectToScreen(nearest.pos);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const offscreen = !scr.inFront || scr.x < 20 || scr.x > w - 20 || scr.y < 20 || scr.y > h - 20;
    if (offscreen) {
      const cx = w / 2;
      const cy = h / 2;
      let dx = (scr.inFront ? scr.x : w - scr.x) - cx;
      let dy = (scr.inFront ? scr.y : h - scr.y) - cy;
      const ang = Math.atan2(dy, dx);
      const r = Math.min(cx, cy) - 48;
      lanternArrow.style.left = `${cx + Math.cos(ang) * r}px`;
      lanternArrow.style.top = `${cy + Math.sin(ang) * r}px`;
      lanternArrow.style.transform = `translate(-50%, -50%) rotate(${ang}rad)`;
      lanternArrow.style.display = 'block';
    } else {
      lanternArrow.style.display = 'none';
    }
  } else {
    lanternArrow.style.display = 'none';
  }
}

let lastTime = performance.now();
let acc = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  if (mode === 'playing' && sim.state === 'playing') {
    acc += dt;
    while (acc >= DT && sim.state === 'playing') {
      const mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const mz = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const events = sim.step({
        move: [mx, mz],
        cam_yaw_deg: camYawDeg,
        jump: keys.has('Space'),
        dash: keys.has('ShiftLeft') || keys.has('ShiftRight'),
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
      mode = 'result';
      if (sim.state === 'won') {
        campaignScore += sim.score;
        if (currentNight < 3) {
          showOverlay(`Thắng Đêm ${currentNight}!`, `Điểm Đêm: ${sim.score} · Tổng điểm: ${campaignScore}`, [
            { label: `Sang Đêm ${currentNight + 1}`, onClick: () => showIntro(currentNight + 1) },
          ]);
        } else {
          showOverlay('Bình Minh Đã Lên!', `Chúc mừng! Bạn đã thắp sáng cả 3 hòn đảo! Tổng điểm: ${campaignScore}`, [
            { label: 'Về menu chính', onClick: showMainMenu },
          ]);
        }
      } else {
        showOverlay(`Thua Đêm ${currentNight}`, `Lý do: ${sim.endReason} · Điểm tích lũy: ${campaignScore}`, [
          { label: 'Chơi lại Đêm này', onClick: () => showIntro(currentNight) },
          { label: 'Về menu', secondary: true, onClick: showMainMenu },
        ]);
      }
    }
  }

  updateHud();
  view.sync(sim, camYawDeg, now / 1000);
}

showMainMenu();
requestAnimationFrame(loop);
