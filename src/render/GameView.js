import * as THREE from 'three';
import { TUNING } from '../core/config.js';

export class GameView {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0E1430');
    this.scene.fog = new THREE.FogExp2('#1B2350', 0.015);

    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      250
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(this.renderer.domElement);

    this.ambient = new THREE.AmbientLight('#FFE9B0', 0.25);
    this.scene.add(this.ambient);

    this.hemi = new THREE.HemisphereLight('#8FA3B8', '#0E1430', 0.35);
    this.scene.add(this.hemi);

    // Island ground & sea of clouds
    const islandGeo = new THREE.CylinderGeometry(TUNING.islandRadius, TUNING.islandRadius + 2, 2, 48);
    const islandMat = new THREE.MeshStandardMaterial({ color: '#2F5D50', roughness: 0.9 });
    const island = new THREE.Mesh(islandGeo, islandMat);
    island.position.y = -1;
    this.scene.add(island);

    const seaGeo = new THREE.PlaneGeometry(300, 300);
    const seaMat = new THREE.MeshBasicMaterial({ color: '#12384A' });
    const sea = new THREE.Mesh(seaGeo, seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -10.5;
    this.scene.add(sea);

    // Player Mây (with nón lá + hanging mini lantern)
    this.playerGroup = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32, 0.7, 6, 12),
      new THREE.MeshStandardMaterial({ color: '#E8E2D0' })
    );
    body.position.y = 0.7;
    this.playerGroup.add(body);

    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 0.35, 16),
      new THREE.MeshStandardMaterial({ color: '#C9B48A' })
    );
    hat.position.y = 1.55;
    this.playerGroup.add(hat);

    const miniLantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshBasicMaterial({ color: '#FFE9B0' })
    );
    miniLantern.position.set(0.42, 1.32, 0.15);
    this.playerGroup.add(miniLantern);

    this.playerLight = new THREE.PointLight('#FFB347', 2.5, 12);
    this.playerLight.position.set(0, 1.4, 0);
    this.playerGroup.add(this.playerLight);
    this.scene.add(this.playerGroup);

    // Pulse visual ring
    this.pulseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.4, TUNING.pulseRadius, 32),
      new THREE.MeshBasicMaterial({ color: '#FFE58A', side: THREE.DoubleSide, transparent: true, opacity: 0 })
    );
    this.pulseRing.rotation.x = -Math.PI / 2;
    this.pulseRing.position.y = 0.2;
    this.scene.add(this.pulseRing);
    this.pulseEffectTimer = 0;

    this.lanternMeshes = new Map();
    this.moteMeshes = new Map();
    this.shadeMeshes = new Map();

    // Decorative ambient spirit fireflies (purely visual, does not affect headless)
    this.ambientSpirits = [];
    const spiritGeo = new THREE.SphereGeometry(0.08, 6, 6);
    const spiritMat = new THREE.MeshBasicMaterial({ color: '#FFE58A', transparent: true, opacity: 0.55 });
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(spiritGeo, spiritMat);
      const a = (i / 18) * Math.PI * 2;
      const r = 10 + (i % 5) * 6;
      m.position.set(Math.cos(a) * r, 2.2 + (i % 3) * 0.7, Math.sin(a) * r);
      this.scene.add(m);
      this.ambientSpirits.push({ mesh: m, baseAngle: a, radius: r, phase: i });
    }

    this._onResize = () => {
      this.camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', this._onResize);
  }

  triggerPulseVisual() {
    this.pulseEffectTimer = 0.35;
  }

  sync(sim, camYawDeg, timeS) {
    this.playerGroup.position.set(sim.player.pos[0], sim.player.pos[1], sim.player.pos[2]);
    this.playerGroup.rotation.y = sim.player.yawRad;

    const litCount = sim.lanterns.filter((l) => l.lit).length;
    const progress = litCount / Math.max(1, sim.lanterns.length);
    this.ambient.intensity = 0.15 + 0.55 * progress;

    // Lanterns
    for (const l of sim.lanterns) {
      let entry = this.lanternMeshes.get(l.id);
      if (!entry) {
        const group = new THREE.Group();
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.25, 2.6, 8),
          new THREE.MeshStandardMaterial({ color: '#6B4A2F' })
        );
        post.position.y = 1.3;
        group.add(post);

        const coreMat = new THREE.MeshStandardMaterial({ color: '#5B5F6E', emissive: '#000000' });
        const core = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.8), coreMat);
        core.position.y = 2.9;
        group.add(core);

        const light = new THREE.PointLight('#FFB347', 0, 14);
        light.position.y = 2.9;
        group.add(light);

        this.scene.add(group);
        entry = { group, coreMat, light };
        this.lanternMeshes.set(l.id, entry);
      }
      entry.group.position.set(l.pos[0], l.pos[1], l.pos[2]);
      if (l.lit) {
        entry.coreMat.color.set('#FFE9B0');
        entry.coreMat.emissive.set('#FFB347');
        entry.light.intensity = 4.0;
      } else {
        entry.coreMat.color.set('#5B5F6E');
        entry.coreMat.emissive.set('#000000');
        entry.light.intensity = 0;
      }
    }

    // Motes
    const activeMoteIds = new Set(sim.motes.map((m) => m.id));
    for (const [id, mesh] of this.moteMeshes) {
      if (!activeMoteIds.has(id)) {
        this.scene.remove(mesh);
        this.moteMeshes.delete(id);
      }
    }
    for (const m of sim.motes) {
      let mesh = this.moteMeshes.get(m.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.24, 10, 10),
          new THREE.MeshBasicMaterial({ color: '#FFF6C2' })
        );
        this.scene.add(mesh);
        this.moteMeshes.set(m.id, mesh);
      }
      mesh.position.set(m.pos[0], m.pos[1] + 0.65 + Math.sin(timeS * 4 + m.pos[0]) * 0.15, m.pos[2]);
    }

    // Shades
    const activeShadeIds = new Set(sim.shades.map((s) => s.id));
    for (const [id, mesh] of this.shadeMeshes) {
      if (!activeShadeIds.has(id)) {
        this.scene.remove(mesh);
        this.shadeMeshes.delete(id);
      }
    }
    for (const s of sim.shades) {
      let mesh = this.shadeMeshes.get(s.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.55, 0),
          new THREE.MeshStandardMaterial({ color: '#120A1A', emissive: '#7A3CFF', emissiveIntensity: 0.7 })
        );
        this.scene.add(mesh);
        this.shadeMeshes.set(s.id, mesh);
      }
      mesh.material.color.set(s.state === 'stunned' ? '#3A3450' : '#120A1A');
      mesh.position.set(s.pos[0], s.pos[1] + 0.9, s.pos[2]);
    }

    // Pulse ring
    if (this.pulseEffectTimer > 0) {
      this.pulseEffectTimer = Math.max(0, this.pulseEffectTimer - 1 / 60);
      this.pulseRing.position.set(sim.player.pos[0], sim.player.pos[1] + 0.2, sim.player.pos[2]);
      this.pulseRing.material.opacity = this.pulseEffectTimer * 2;
    } else {
      this.pulseRing.material.opacity = 0;
    }

    // Ambient decorative spirits
    for (const sp of this.ambientSpirits) {
      const a = sp.baseAngle + timeS * 0.12;
      sp.mesh.position.x = Math.cos(a) * sp.radius;
      sp.mesh.position.z = Math.sin(a) * sp.radius;
      sp.mesh.position.y = 2.2 + Math.sin(timeS * 1.5 + sp.phase) * 0.4;
    }

    // 3rd person camera
    const yawRad = (camYawDeg * Math.PI) / 180;
    const camDist = 9.5;
    const camHeight = 5.0;
    this.camera.position.set(
      sim.player.pos[0] - Math.sin(yawRad) * camDist,
      sim.player.pos[1] + camHeight,
      sim.player.pos[2] - Math.cos(yawRad) * camDist
    );
    this.camera.lookAt(sim.player.pos[0], sim.player.pos[1] + 1.2, sim.player.pos[2]);

    this.renderer.render(this.scene, this.camera);
  }
}
