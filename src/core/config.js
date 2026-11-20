export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const TUNING = {
  playerSpeed: 6.0,
  jumpVelocity: 7.0,
  gravity: -20.0,
  carryCapacity: 10,
  lanternCost: 10,
  lanternCountNight1: 5,
  pickupRadius: 1.0,
  interactRadius: 2.0,
  pulseCost: 3,
  pulseRadius: 5.0,
  night1DurationS: 300,
  flames: 3,
  invulnTicks: 90,
  hitDropRatio: 0.5,
  pulseStunTicks: 120,
  pulsePushM: 4.0,
  pulsePushTicks: 15,
  pulseCooldownTicks: 180,
  safeRadius: 6.0,
  shadeSpeed: 4.0,
  shadeDetectRadius: 12.0,
  shadeLoseRadius: 18.0,
  shadeHitRadius: 1.0,
  shadeRecoilM: 2.0,
  shadeRecoilTicks: 60,
  islandRadius: 40.0,
  fallY: -10.0,
  respawnWaitTicks: 60,
  moteInitialCount: 20,
  moteMaxCount: 30,
  moteSpawnIntervalTicks: 240,
  droppedMoteTtlTicks: 480,
  shadeMaxCount: 6,
  shadeFirstSpawnTick: 300,
  shadeSpawnIntervalTicks: 480,
  score: {
    perMote: 10,
    perLantern: 100,
    perStun: 5,
    perSecondLeft: 2,
    perFlameLeft: 50,
  },
};

export const NIGHT1_LANTERNS = [
  { id: 'L1', pos: [0, 0, 25] },
  { id: 'L2', pos: [23.8, 0, 7.7] },
  { id: 'L3', pos: [14.7, 0, -20.2] },
  { id: 'L4', pos: [-14.7, 0, -20.2] },
  { id: 'L5', pos: [-23.8, 0, 7.7] },
];

function ringPoints(radius, count, startDeg = 0) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const rad = ((startDeg + (i * 360) / count) * Math.PI) / 180;
    pts.push([
      Math.round(Math.cos(rad) * radius * 1000) / 1000,
      0,
      Math.round(Math.sin(rad) * radius * 1000) / 1000,
    ]);
  }
  return pts;
}

export const NIGHT1_MOTE_SPOTS = [
  ...ringPoints(12, 8, 0),
  ...ringPoints(33, 16, 0),
];

export const NIGHT1_SHADE_SPOTS = ringPoints(37, 12, 15);
