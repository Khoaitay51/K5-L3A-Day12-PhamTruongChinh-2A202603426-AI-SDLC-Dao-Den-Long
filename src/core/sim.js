import { createRng, round3 } from './rng.js';
import {
  DT,
  TICK_RATE,
  TUNING,
  NIGHT1_LANTERNS,
  NIGHT1_MOTE_SPOTS,
  NIGHT1_SHADE_SPOTS,
} from './config.js';

function distXZ(a, b) {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return Math.hypot(dx, dz);
}

function dist3D(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function cloneVec(v) {
  return [v[0], v[1], v[2]];
}

/**
 * Pure deterministic simulation for Đảo Đèn Lồng (Phase 1 / Night 1).
 */
export class GameSimulation {
  /**
   * @param {object} options
   * @param {number} [options.seed=1]
   * @param {number} [options.night=1]
   * @param {object|null} [options.scenario=null]
   */
  constructor({ seed = 1, night = 1, scenario = null } = {}) {
    if (night !== 1) {
      throw new Error(`Unsupported night in Phase 1: ${night}`);
    }
    this.seed = seed;
    this.night = night;
    this.rng = createRng(seed);
    this.tick = 0;
    this.simTick = 0;
    this.state = 'playing'; // 'playing' | 'won' | 'lost'
    this.endReason = null;
    this.score = 0;
    this.events = [];

    this.randomMotes = scenario?.random_motes !== false;
    this.randomShades = scenario?.random_shades !== false;
    this.timeLeftTicks = Math.round(
      (scenario?.time_left_s ?? TUNING.night1DurationS) * TICK_RATE
    );

    const p = scenario?.player || {};
    this.player = {
      pos: p.pos ? cloneVec(p.pos) : [0, 0, 0],
      vel: [0, 0, 0],
      grounded: true,
      yawRad: 0,
      flames: p.flames ?? TUNING.flames,
      carried: p.carried ?? 0,
      invulnTicks: 0,
      pulseCdTicks: 0,
      respawnWaitTicks: 0,
      fellThisDrop: false,
    };

    // Lanterns L1..L5
    this.lanterns = NIGHT1_LANTERNS.map((l) => ({
      id: l.id,
      pos: cloneVec(l.pos),
      lit: false,
      deposited: 0,
    }));

    if (Array.isArray(scenario?.lanterns)) {
      for (const patch of scenario.lanterns) {
        const target = this.lanterns.find((l) => l.id === patch.id);
        if (!target) continue;
        if (patch.pos) target.pos = cloneVec(patch.pos);
        if (typeof patch.deposited === 'number') target.deposited = patch.deposited;
        if (typeof patch.lit === 'boolean') target.lit = patch.lit;
      }
    }

    // Motes
    this.nextMoteId = 1;
    this.motes = [];
    if (Array.isArray(scenario?.motes)) {
      for (const m of scenario.motes) {
        const pos = Array.isArray(m) ? cloneVec(m) : cloneVec(m.pos);
        this.motes.push({
          id: `M${this.nextMoteId++}`,
          pos,
          kind: 'random',
          ttlTicks: -1,
        });
      }
    } else if (this.randomMotes) {
      const spots = [...NIGHT1_MOTE_SPOTS];
      this._shuffle(spots);
      const count = Math.min(TUNING.moteInitialCount, spots.length);
      for (let i = 0; i < count; i++) {
        this.motes.push({
          id: `M${this.nextMoteId++}`,
          pos: cloneVec(spots[i]),
          kind: 'random',
          ttlTicks: -1,
        });
      }
    }

    // Shades
    this.nextShadeId = 1;
    this.shades = [];
    if (Array.isArray(scenario?.shades)) {
      for (const s of scenario.shades) {
        const id = s.id || `S${this.nextShadeId++}`;
        const mNum = /^S(\d+)$/.exec(id);
        if (mNum) {
          this.nextShadeId = Math.max(this.nextShadeId, Number(mNum[1]) + 1);
        }
        this.shades.push({
          id,
          pos: cloneVec(s.pos),
          state: s.state || 'chase',
          stunTicks: 0,
          pushTicks: 0,
          pushDir: [1, 0],
          recoilTicks: 0,
          recoilDir: [1, 0],
          wanderTarget: null,
        });
      }
    }

    this.prevInput = {
      move: [0, 0],
      cam_yaw_deg: 0,
      jump: false,
      interact: false,
      pulse: false,
    };
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  _emit(name, data) {
    this.events.push({
      type: 'event',
      tick: this.tick,
      name,
      data,
    });
  }

  /**
   * Advance simulation by 1 tick (1/60 s).
   * @param {object} input
   * @returns {Array<object>} events emitted during this tick
   */
  step(input = {}) {
    if (this.state !== 'playing') return [];

    this.tick += 1;
    this.simTick += 1;
    this.events = [];

    const move = input.move ?? this.prevInput.move;
    const camYawDeg = input.cam_yaw_deg ?? this.prevInput.cam_yaw_deg;
    const jump = Boolean(input.jump ?? this.prevInput.jump);
    const interact = Boolean(input.interact ?? this.prevInput.interact);
    const pulse = Boolean(input.pulse ?? this.prevInput.pulse);

    const jumpPressed = jump && !this.prevInput.jump;
    const interactPressed = interact && !this.prevInput.interact;
    const pulsePressed = pulse && !this.prevInput.pulse;

    this.prevInput = {
      move: [move[0], move[1]],
      cam_yaw_deg: camYawDeg,
      jump,
      interact,
      pulse,
    };

    // 1. Decrement timers
    this.timeLeftTicks = Math.max(0, this.timeLeftTicks - 1);
    if (this.player.invulnTicks > 0) this.player.invulnTicks -= 1;
    if (this.player.pulseCdTicks > 0) this.player.pulseCdTicks -= 1;

    // Expire dropped motes
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      if (m.ttlTicks > 0) {
        m.ttlTicks -= 1;
        if (m.ttlTicks === 0) this.motes.splice(i, 1);
      }
    }

    for (const s of this.shades) {
      if (s.stunTicks > 0) {
        s.stunTicks -= 1;
        if (s.stunTicks === 0 && s.state === 'stunned') {
          s.state = 'wander';
        }
      }
      if (s.recoilTicks > 0) {
        s.recoilTicks -= 1;
        if (s.recoilTicks === 0 && s.state === 'recoil') {
          s.state = 'chase';
        }
      }
    }

    // 2. Player movement & fall
    if (this.player.respawnWaitTicks > 0) {
      this.player.respawnWaitTicks -= 1;
      if (this.player.respawnWaitTicks === 0) {
        this.player.pos = [0, 0, 0];
        this.player.vel = [0, 0, 0];
        this.player.grounded = true;
        this.player.invulnTicks = TUNING.invulnTicks;
        this.player.fellThisDrop = false;
      }
    } else {
      let mx = move[0] || 0;
      let mz = move[1] || 0;
      const mag = Math.hypot(mx, mz);
      if (mag > 1) {
        mx /= mag;
        mz /= mag;
      }
      const theta = (camYawDeg * Math.PI) / 180;
      const wx = mx * Math.cos(theta) + mz * Math.sin(theta);
      const wz = -mx * Math.sin(theta) + mz * Math.cos(theta);

      this.player.vel[0] = wx * TUNING.playerSpeed;
      this.player.vel[2] = wz * TUNING.playerSpeed;
      if (Math.hypot(wx, wz) > 0.001) {
        this.player.yawRad = Math.atan2(wx, wz);
      }

      if (jumpPressed && this.player.grounded) {
        this.player.vel[1] = TUNING.jumpVelocity;
        this.player.grounded = false;
      }

      this.player.vel[1] += TUNING.gravity * DT;
      this.player.pos[0] += this.player.vel[0] * DT;
      this.player.pos[1] += this.player.vel[1] * DT;
      this.player.pos[2] += this.player.vel[2] * DT;

      const onIsland = Math.hypot(this.player.pos[0], this.player.pos[2]) <= TUNING.islandRadius;
      if (onIsland && this.player.pos[1] <= 0 && this.player.vel[1] <= 0 && !this.player.fellThisDrop) {
        this.player.pos[1] = 0;
        this.player.vel[1] = 0;
        this.player.grounded = true;
      } else if (!onIsland || this.player.pos[1] > 0) {
        this.player.grounded = false;
      }

      if (this.player.pos[1] < TUNING.fallY && !this.player.fellThisDrop) {
        this.player.fellThisDrop = true;
        const lost = this.player.carried;
        this.player.flames = Math.max(0, this.player.flames - 1);
        this.player.carried = 0;
        this.player.respawnWaitTicks = TUNING.respawnWaitTicks;
        this._emit('player_hit', {
          by: 'fall',
          flames: this.player.flames,
          dropped: lost,
        });
      }
    }

    // 3. Pickup motes (skip while waiting respawn)
    if (this.player.respawnWaitTicks === 0) {
      for (let i = 0; i < this.motes.length; i++) {
        if (this.player.carried >= TUNING.carryCapacity) break;
        const m = this.motes[i];
        if (
          distXZ(this.player.pos, m.pos) <= TUNING.pickupRadius &&
          Math.abs(this.player.pos[1] - m.pos[1]) <= 1.5
        ) {
          this.motes.splice(i, 1);
          i -= 1;
          this.player.carried += 1;
          this._emit('mote_picked', { carried: this.player.carried });
        }
      }
    }

    // 4. Interact with nearest unlit lantern
    if (interactPressed && this.player.carried > 0 && this.player.respawnWaitTicks === 0) {
      let best = null;
      let bestDist = Infinity;
      for (const l of this.lanterns) {
        if (l.lit) continue;
        const d = distXZ(this.player.pos, l.pos);
        if (d <= TUNING.interactRadius) {
          if (d < bestDist - 1e-9 || (Math.abs(d - bestDist) <= 1e-9 && l.id < best.id)) {
            best = l;
            bestDist = d;
          }
        }
      }
      if (best) {
        const needed = TUNING.lanternCost - best.deposited;
        const amount = Math.min(this.player.carried, needed);
        if (amount > 0) {
          this.player.carried -= amount;
          best.deposited += amount;
          this.score += amount * TUNING.score.perMote;
          this._emit('deposit', {
            lantern_id: best.id,
            amount,
            deposited: best.deposited,
          });
          if (best.deposited >= TUNING.lanternCost) {
            best.lit = true;
            this.score += TUNING.score.perLantern;
            this._emit('lantern_lit', { lantern_id: best.id });
          }
        }
      }
    }

    // 5. Pulse (Tỏa Sáng)
    if (
      pulsePressed &&
      this.player.pulseCdTicks === 0 &&
      this.player.carried >= TUNING.pulseCost &&
      this.player.respawnWaitTicks === 0
    ) {
      this.player.carried -= TUNING.pulseCost;
      this.player.pulseCdTicks = TUNING.pulseCooldownTicks;
      const pulseCenter = [this.player.pos[0], this.player.pos[1] + 0.8, this.player.pos[2]];
      const stunnedIds = [];
      for (const s of this.shades) {
        if (dist3D(pulseCenter, s.pos) <= TUNING.pulseRadius) {
          let dx = s.pos[0] - this.player.pos[0];
          let dz = s.pos[2] - this.player.pos[2];
          const d = Math.hypot(dx, dz);
          if (d < 1e-6) {
            dx = 1;
            dz = 0;
          } else {
            dx /= d;
            dz /= d;
          }
          s.state = 'stunned';
          s.stunTicks = TUNING.pulseStunTicks;
          s.pushTicks = TUNING.pulsePushTicks;
          s.pushDir = [dx, dz];
          stunnedIds.push(s.id);
          this.score += TUNING.score.perStun;
        }
      }
      this._emit('pulse', { stunned_ids: stunnedIds });
    }

    // 6. Move shades & keep outside lit lantern safe radius
    for (const s of this.shades) {
      if (s.pushTicks > 0) {
        const stepM = TUNING.pulsePushM / TUNING.pulsePushTicks;
        s.pos[0] += s.pushDir[0] * stepM;
        s.pos[2] += s.pushDir[1] * stepM;
        s.pushTicks -= 1;
      } else if (s.recoilTicks > 0) {
        const stepM = TUNING.shadeRecoilM / TUNING.shadeRecoilTicks;
        s.pos[0] += s.recoilDir[0] * stepM;
        s.pos[2] += s.recoilDir[1] * stepM;
      } else if (s.state !== 'stunned') {
        const dPlayer = distXZ(s.pos, this.player.pos);
        if (s.state !== 'chase' && dPlayer <= TUNING.shadeDetectRadius) {
          s.state = 'chase';
        } else if (s.state === 'chase' && dPlayer > TUNING.shadeLoseRadius) {
          s.state = 'wander';
        }

        let tx = s.pos[0];
        let tz = s.pos[2];
        if (s.state === 'chase') {
          tx = this.player.pos[0];
          tz = this.player.pos[2];
        } else {
          // Wander toward nearest unlit lantern or random spot
          const unlit = this.lanterns.find((l) => !l.lit);
          if (unlit) {
            tx = unlit.pos[0];
            tz = unlit.pos[2];
          }
        }
        const dx = tx - s.pos[0];
        const dz = tz - s.pos[2];
        const d = Math.hypot(dx, dz);
        if (d > 0.05) {
          const step = Math.min(d, TUNING.shadeSpeed * DT);
          s.pos[0] += (dx / d) * step;
          s.pos[2] += (dz / d) * step;
        }
      }

      // Safe radius clamp around lit lanterns
      for (const l of this.lanterns) {
        if (!l.lit) continue;
        const dx = s.pos[0] - l.pos[0];
        const dz = s.pos[2] - l.pos[2];
        const d = Math.hypot(dx, dz);
        if (d < TUNING.safeRadius) {
          if (d < 1e-6) {
            s.pos[0] = l.pos[0] + TUNING.safeRadius;
          } else {
            s.pos[0] = l.pos[0] + (dx / d) * TUNING.safeRadius;
            s.pos[2] = l.pos[2] + (dz / d) * TUNING.safeRadius;
          }
        }
      }
    }

    // 7. Shade hit detection
    if (this.player.invulnTicks === 0 && this.player.respawnWaitTicks === 0) {
      for (const s of this.shades) {
        if (s.state === 'stunned' || s.state === 'recoil') continue;
        if (
          distXZ(this.player.pos, s.pos) <= TUNING.shadeHitRadius &&
          Math.abs(this.player.pos[1] - s.pos[1]) <= 1.5
        ) {
          this.player.flames = Math.max(0, this.player.flames - 1);
          this.player.invulnTicks = TUNING.invulnTicks;
          const dropped = Math.floor(this.player.carried * TUNING.hitDropRatio);
          this.player.carried -= dropped;

          for (let i = 0; i < dropped; i++) {
            const angle = this.rng() * Math.PI * 2;
            const r = 1.5 + this.rng() * 1.0;
            this.motes.push({
              id: `M${this.nextMoteId++}`,
              pos: [
                round3(this.player.pos[0] + Math.cos(angle) * r),
                0,
                round3(this.player.pos[2] + Math.sin(angle) * r),
              ],
              kind: 'dropped',
              ttlTicks: TUNING.droppedMoteTtlTicks,
            });
          }

          let rx = s.pos[0] - this.player.pos[0];
          let rz = s.pos[2] - this.player.pos[2];
          const rd = Math.hypot(rx, rz);
          if (rd < 1e-6) {
            rx = 1;
            rz = 0;
          } else {
            rx /= rd;
            rz /= rd;
          }
          s.state = 'recoil';
          s.recoilTicks = TUNING.shadeRecoilTicks;
          s.recoilDir = [rx, rz];

          this._emit('player_hit', {
            by: 'shade',
            flames: this.player.flames,
            dropped,
          });
          break; // max 1 flame lost per tick
        }
      }
    }

    // 8. Scheduled spawns (after interaction this tick)
    if (
      this.randomMotes &&
      this.simTick > 0 &&
      this.simTick % TUNING.moteSpawnIntervalTicks === 0 &&
      this.motes.length < TUNING.moteMaxCount
    ) {
      const freeSpots = NIGHT1_MOTE_SPOTS.filter(
        (spot) => !this.motes.some((m) => distXZ(m.pos, spot) < 0.5)
      );
      if (freeSpots.length > 0) {
        const chosen = freeSpots[Math.floor(this.rng() * freeSpots.length)];
        this.motes.push({
          id: `M${this.nextMoteId++}`,
          pos: cloneVec(chosen),
          kind: 'random',
          ttlTicks: -1,
        });
      }
    }

    if (
      this.randomShades &&
      this.shades.length < TUNING.shadeMaxCount &&
      this.simTick >= TUNING.shadeFirstSpawnTick
    ) {
      const offset = this.simTick - TUNING.shadeFirstSpawnTick;
      if (offset === 0) {
        this._spawnShades(2);
      } else if (offset % TUNING.shadeSpawnIntervalTicks === 0) {
        this._spawnShades(1);
      }
    }

    // 9. Win / Loss check
    if (this.player.flames <= 0) {
      this.state = 'lost';
      this.endReason = 'no_flames';
      this._emit('game_over', { result: 'lost', reason: 'no_flames' });
    } else if (this.lanterns.every((l) => l.lit)) {
      this.state = 'won';
      this.endReason = 'all_lit';
      const secLeft = Math.floor(this.timeLeftTicks / TICK_RATE);
      this.score +=
        secLeft * TUNING.score.perSecondLeft +
        this.player.flames * TUNING.score.perFlameLeft;
      this._emit('game_over', { result: 'won', reason: 'all_lit' });
    } else if (this.timeLeftTicks <= 0) {
      this.state = 'lost';
      this.endReason = 'dawn';
      this._emit('game_over', { result: 'lost', reason: 'dawn' });
    }

    return this.events;
  }

  _spawnShades(count) {
    for (let i = 0; i < count; i++) {
      if (this.shades.length >= TUNING.shadeMaxCount) break;
      const valid = NIGHT1_SHADE_SPOTS.filter(
        (pt) => distXZ(pt, this.player.pos) >= 15.0
      );
      if (valid.length === 0) return;
      const pt = valid[Math.floor(this.rng() * valid.length)];
      const id = `S${this.nextShadeId++}`;
      this.shades.push({
        id,
        pos: cloneVec(pt),
        state: 'wander',
        stunTicks: 0,
        pushTicks: 0,
        pushDir: [1, 0],
        recoilTicks: 0,
        recoilDir: [1, 0],
      });
      this._emit('shade_spawned', { id });
    }
  }

  getSnapshot() {
    return {
      type: 'snapshot',
      tick: this.tick,
      sim_tick: this.simTick,
      state: this.state,
      time_left_s: round3(this.timeLeftTicks / TICK_RATE),
      score: this.score,
      player: {
        pos: [
          round3(this.player.pos[0]),
          round3(this.player.pos[1]),
          round3(this.player.pos[2]),
        ],
        flames: this.player.flames,
        carried: this.player.carried,
      },
      lanterns: this.lanterns.map((l) => ({
        id: l.id,
        pos: [round3(l.pos[0]), round3(l.pos[1]), round3(l.pos[2])],
        lit: l.lit,
        deposited: l.deposited,
      })),
      shades: this.shades.map((s) => ({
        id: s.id,
        pos: [round3(s.pos[0]), round3(s.pos[1]), round3(s.pos[2])],
        state: s.state,
      })),
      motes_active: this.motes.length,
      motes: this.motes.map((m) => ({
        id: m.id,
        pos: [round3(m.pos[0]), round3(m.pos[1]), round3(m.pos[2])],
      })),
    };
  }
}
