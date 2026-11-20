// The armoury: four guns and a flash grenade, each with its own numbers. Damage is
// per hit before the headshot multiplier (x4, applied by main.js); spread grows
// with movement and consecutive shots and shrinks when crouched or aiming down sights.
// View models are plain boxes on the camera, one per weapon, swapped on switch.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P-9', kind: 'pistol', price: 300,
    damage: 26, headMult: 4, mag: 12, reserve: 999, pellets: 1,
    fireGap: 0.22, reloadTime: 1.4, auto: false,
    spreadStill: 0.004, spreadMove: 0.03, adsMult: 0.5, crouchMult: 0.7,
    recoil: 0.008, range: 45,
  },
  rifle: {
    id: 'rifle', name: 'VK-7', kind: 'rifle', price: 2700,
    damage: 34, headMult: 4, mag: 30, reserve: 90, pellets: 1,
    fireGap: 0.096, reloadTime: 1.9, auto: true,
    spreadStill: 0.0022, spreadMove: 0.028, adsMult: 0.45, crouchMult: 0.65,
    recoil: 0.011, range: 80,
  },
  smg: {
    id: 'smg', name: 'Hornet-9', kind: 'smg', price: 1500,
    damage: 22, headMult: 4, mag: 32, reserve: 128, pellets: 1,
    fireGap: 0.07, reloadTime: 1.7, auto: true,
    spreadStill: 0.004, spreadMove: 0.034, adsMult: 0.5, crouchMult: 0.7,
    recoil: 0.007, range: 40,
  },
  shotgun: {
    id: 'shotgun', name: 'Boar-12', kind: 'shotgun', price: 1700,
    damage: 12, headMult: 4, mag: 6, reserve: 24, pellets: 8,
    fireGap: 0.8, reloadTime: 2.6, auto: false,
    spreadStill: 0.045, spreadMove: 0.06, adsMult: 0.7, crouchMult: 0.8,
    recoil: 0.03, range: 22,
  },
};

export const FLASH_PRICE = 200;
export const ARMOUR_PRICE = 650;

export function createWeapons(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });

  function buildModel(def) {
    const model = new THREE.Group();
    const long = def.kind === 'rifle' ? 0.42 : def.kind === 'smg' ? 0.34 : def.kind === 'shotgun' ? 0.46 : 0.2;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, long), grip);
    model.add(receiver);
    const barrel = new THREE.Mesh(
      new THREE.BoxGeometry(def.kind === 'shotgun' ? 0.06 : 0.035, 0.035, long * 0.9),
      grip,
    );
    barrel.position.set(0, 0.025, -long * 0.85);
    model.add(barrel);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, long / 2 + 0.08);
    model.add(stock);
    if (def.kind === 'shotgun') {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.2), grip);
      pump.position.set(0, -0.03, -long * 0.6);
      model.add(pump);
    }
    if (def.kind === 'smg') {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), grip);
      mag.position.set(0, -0.12, -0.02);
      model.add(mag);
    }
    model.position.set(0.3, -0.26, -0.55);
    model.scale.setScalar(0.65);
    model.visible = false;
    camera.add(model);
    return model;
  }

  const models = {};
  for (const def of Object.values(WEAPONS)) models[def.id] = buildModel(def);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    current: 'pistol',
    owned: { pistol: true },
    mag: WEAPONS.pistol.mag,
    reserve: WEAPONS.pistol.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    shotsFired: 0,
  };

  function def() {
    return WEAPONS[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.55 + state.kick;
    model.position.y = -0.26 + state.kick * 0.4;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const d = def();
      model.rotation.x = -0.55 * Math.min(1, (d.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = d.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    def,
    models,
    select(id) {
      if (!state.owned[id]) return false;
      models[state.current].visible = false;
      state.current = id;
      state.mag = WEAPONS[id].mag;
      state.reserve = WEAPONS[id].reserve;
      state.reloadLeft = 0;
      state.cooldown = 0;
      models[id].visible = true;
      return true;
    },
    buy(id) {
      if (state.owned[id]) return false;
      state.owned[id] = true;
      return this.select(id);
    },
    show() {
      models[state.current].visible = true;
    },
    hide() {
      for (const model of Object.values(models)) model.visible = false;
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const d = def();
      state.cooldown = d.fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
      state.shotsFired += 1;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      if (state.reloadLeft > 0 || state.mag === d.mag || state.reserve === 0) return false;
      state.reloadLeft = d.reloadTime;
      return true;
    },
    spread(speed, ads, crouching) {
      const d = def();
      let s = d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMove;
      if (ads) s *= d.adsMult;
      if (crouching) s *= d.crouchMult;
      s += Math.min(0.02, state.shotsFired * 0.0009);
      return s;
    },
    resetShots() {
      state.shotsFired = 0;
    },
    refill() {
      for (const id of Object.keys(state.owned)) {
        if (id === state.current) {
          state.mag = WEAPONS[id].mag;
          state.reserve = WEAPONS[id].reserve;
        }
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
  };
}
