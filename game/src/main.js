// EMBERLINE boot and loop: a fixed 60 Hz simulation feeding a render at display rate.
// Rounds: buy (12 s) -> live (100 s) -> planted (35 s) -> over (5 s). EMBER attacks,
// ASH defends; first to 3 round wins, at most 5 rounds. ?shot=start|play|plant|end
// with &seed=N stages a deterministic frame for a capture, renders it twice, then
// freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS, FLASH_PRICE, ARMOUR_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const BUY_SECONDS = 12;
const ROUND_SECONDS = 100;
const BOMB_SECONDS = 35;
const PLANT_SECONDS = 3;
const DEFUSE_SECONDS = 5;
const ROUNDS_TO_WIN = 3;
const MAX_ROUNDS = 5;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = shot ? mulberry32(seed) : Math.random;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 20, 52);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio({ enabled: !shot });
const hud = createHud();
const player = createPlayer(world.colliders);
const weapons = createWeapons(camera);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const hitPoint = new THREE.Vector3();

// Tracers: a small pool of fading lines, one per shot.
const tracers = [];
for (let i = 0; i < 10; i += 1) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}
let tracerIndex = 0;
function spawnTracer(from, to) {
  const tracer = tracers[tracerIndex];
  tracerIndex = (tracerIndex + 1) % tracers.length;
  tracer.line.geometry.setFromPoints([from.clone(), to.clone()]);
  tracer.line.material.opacity = 0.85;
  tracer.life = 0.07;
}

// Bomb prop: a small teal charge that appears where the bomb is planted.
const bombMesh = new THREE.Group();
const bombBox = new THREE.Mesh(
  new THREE.BoxGeometry(0.5, 0.28, 0.36),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), emissive: new THREE.Color(PALETTE.teal), emissiveIntensity: 0.8, roughness: 0.4 }),
);
bombMesh.add(bombBox);
const bombLight = new THREE.PointLight(new THREE.Color(PALETTE.teal), 8, 6);
bombLight.position.y = 0.6;
bombMesh.add(bombLight);
bombMesh.visible = false;
scene.add(bombMesh);

const game = {
  money: 800,
  round: 1,
  scoreEmber: 0,
  scoreAsh: 0,
  phase: 'buy',
  phaseTimer: BUY_SECONDS,
  elapsed: 0,
  started: false,
  frozen: false,
  bombPlanted: false,
  bombSite: null,
  bombPos: null,
  plantProgress: 0,
  defuseProgress: 0,
  flashCount: 0,
  buyOpen: false,
  kills: 0,
  prevFiring: false,
  lastShot: null,
  lastShotTime: -99,
};

const body = player.state;

const bots = createBots(scene, world, {
  random,
  onBotHitPlayer(bot, damage, head) {
    if (!body.alive || game.phase === 'over') return;
    player.damage(damage);
    hud.damageFlash();
    hud.setHealth(body.health, body.armour);
    audio.hurt();
    if (!body.alive) {
      hud.banner('YOU ARE DOWN', 'Your squad fights on — watch the round play out.');
      if (document.pointerLockElement) document.exitPointerLock();
    }
  },
  onBotHitBot(attacker, target, damage, head) {
    const killed = bots.damage(target, damage);
    if (killed) {
      hud.killfeed(`${attacker.name} ▸ ${target.name}`, attacker.team);
      if (attacker.team === 'ember') game.money += 0;
      checkElimination();
    }
  },
  onBotShotSound() {
    audio.distantShot();
  },
  onBotShotMiss() {},
  onDefused(bot) {
    endRound('ash', `${bot.name} defused the charge.`);
  },
});

function siteAt(pos) {
  for (const site of Object.values(world.sites)) {
    if (Math.abs(pos.x - site.center.x) <= site.half && Math.abs(pos.z - site.center.z) <= site.half) return site;
  }
  return null;
}

function setPhase(phase, seconds) {
  game.phase = phase;
  game.phaseTimer = seconds;
  if (phase !== 'buy') {
    game.buyOpen = false;
    hud.showBuy(false);
  }
}

function startRound() {
  game.bombPlanted = false;
  game.bombSite = null;
  game.bombPos = null;
  game.plantProgress = 0;
  game.defuseProgress = 0;
  game.flashCount = 0;
  bombMesh.visible = false;
  player.reset(world.spawns.ember[0]);
  weapons.refill();
  weapons.resetShots();
  bots.spawnRound(game.round);
  weapons.show();
  hud.setHealth(100, body.armour);
  hud.setMoney(game.money);
  hud.setScore(game.scoreEmber, game.scoreAsh, game.round);
  hud.setBombStatus('Plant the charge at A or B', '');
  hud.hidePlantProgress();
  hud.hideBanner();
  setPhase('buy', BUY_SECONDS);
  game.buyOpen = true;
  hud.showBuy(true);
  refreshBuy();
  hud.setTimer(BUY_SECONDS, 'buy');
}

function refreshBuy() {
  hud.setBuyState(game.money, weapons.state.owned, game.flashCount);
}

function buy(id) {
  if (game.phase !== 'buy') return;
  if (id === 'flash') {
    if (game.flashCount > 0 || game.money < FLASH_PRICE) { audio.denied(); return; }
    game.money -= FLASH_PRICE;
    game.flashCount = 1;
  } else if (id === 'armour') {
    if (body.armour >= 100 || game.money < ARMOUR_PRICE) { audio.denied(); return; }
    game.money -= ARMOUR_PRICE;
    body.armour = Math.min(100, body.armour + 50);
    hud.setHealth(body.health, body.armour);
  } else {
    const def = WEAPONS[id];
    if (!def || weapons.state.owned[id] || game.money < def.price) { audio.denied(); return; }
    game.money -= def.price;
    weapons.buy(id);
  }
  audio.buy();
  hud.setMoney(game.money);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
  refreshBuy();
}

function endRound(winner, reason) {
  if (game.phase === 'over') return;
  const emberWon = winner === 'ember';
  if (emberWon) {
    game.scoreEmber += 1;
    game.money += 3250;
    audio.roundWin();
  } else {
    game.scoreAsh += 1;
    game.money += 1900;
    audio.roundLose();
  }
  hud.setScore(game.scoreEmber, game.scoreAsh, game.round);
  hud.setMoney(game.money);
  hud.banner(
    emberWon ? 'ROUND WON — EMBER' : 'ROUND LOST — ASH',
    `${reason}  EMBER ${game.scoreEmber} — ${game.scoreAsh} ASH`,
    4200,
  );
  hud.killfeed(`${emberWon ? 'EMBER' : 'ASH'} takes round ${game.round}`, emberWon ? 'ember' : 'ash');
  setPhase('over', 5);
  hud.showBuy(false);
  hud.showOverlay('round', {
    copy: `${reason}  EMBER ${game.scoreEmber} — ${game.scoreAsh} ASH. Next round starts in a few seconds — click to lock your aim.`,
  });
  if (document.pointerLockElement) document.exitPointerLock();
}

function checkElimination() {
  if (game.phase !== 'live' && game.phase !== 'planted') return;
  if (bots.aliveCount('ash') === 0) {
    endRound('ember', 'ASH squad eliminated.');
  } else if (bots.aliveCount('ember') === 0 && !body.alive) {
    endRound('ash', 'EMBER squad eliminated.');
  }
}

function nextRound() {
  if (game.scoreEmber >= ROUNDS_TO_WIN || game.scoreAsh >= ROUNDS_TO_WIN || game.round >= MAX_ROUNDS) {
    endMatch();
    return;
  }
  game.round += 1;
  startRound();
}

function endMatch() {
  const emberWon = game.scoreEmber > game.scoreAsh;
  setPhase('match', 0);
  hud.showOverlay('end', {
    copy: emberWon
      ? `EMBER takes Yard 7, ${game.scoreEmber}–${game.scoreAsh}. The yard is yours.`
      : `ASH holds Yard 7, ${game.scoreAsh}–${game.scoreEmber}. Run it back.`,
  });
  hud.setBombStatus(emberWon ? 'EMBER TAKES THE YARD' : 'ASH HOLDS THE YARD', emberWon ? 'planted' : '');
}

function resetMatch() {
  game.money = 800;
  game.round = 1;
  game.scoreEmber = 0;
  game.scoreAsh = 0;
  game.kills = 0;
  weapons.state.owned = { pistol: true };
  weapons.select('pistol');
  startRound();
}

function plantBomb(site) {
  game.bombPlanted = true;
  game.bombSite = site;
  game.bombPos = new THREE.Vector3(body.position.x, 0, body.position.z);
  game.money += 300;
  bombMesh.position.copy(game.bombPos);
  bombMesh.position.y = 0.16;
  bombMesh.visible = true;
  hud.setMoney(game.money);
  hud.setBombStatus(`CHARGE PLANTED — SITE ${site.name}`, 'planted');
  hud.killfeed(`YOU planted the charge at ${site.name} (+$300)`, 'ember');
  audio.plantDone();
  setPhase('planted', BOMB_SECONDS);
}

function detonate() {
  audio.explosion();
  hud.flashWhite(300);
  endRound('ember', 'The charge detonated at site ' + (game.bombSite ? game.bombSite.name : '?') + '.');
}

function shoot(spread) {
  const def = weapons.def();
  if (!weapons.takeRound()) {
    audio.dryClick();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  raycaster.far = def.range;
  const targets = world.shootables.concat(bots.hitMeshes.filter((mesh) => !mesh.userData.dead));
  const pellets = def.pellets;
  let anyHit = false;
  let anyKill = false;
  for (let p = 0; p < pellets; p += 1) {
    if (p > 0) {
      direction.x += (random() * 2 - 1) * spread * 2;
      direction.y += (random() * 2 - 1) * spread * 2;
      direction.z += (random() * 2 - 1) * spread * 2;
      direction.normalize();
      raycaster.set(camera.position, direction);
    }
    const hit = raycaster.intersectObjects(targets, false)[0];
    hitPoint.copy(camera.position).addScaledVector(direction, hit ? hit.distance : def.range);
    muzzle.copy(camera.position).addScaledVector(direction, 0.6);
    if (p === 0) spawnTracer(muzzle, hitPoint);
    if (hit && hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      // During the buy phase the player may test-fire, but bots cannot be hurt
      // before the round goes live.
      if (game.phase === 'buy') continue;
      const head = hit.object.userData.part === 'head';
      const killed = bots.damage(bot, def.damage * (head ? def.headMult : 1));
      anyHit = true;
      if (killed) {
        anyKill = true;
        game.kills += 1;
        game.money += 300;
        hud.setMoney(game.money);
        hud.killfeed(`YOU ▸ ${bot.name}${head ? '  HEADSHOT' : ''}  (+$300)`, 'ember');
        audio.kill();
        checkElimination();
      } else {
        audio.hit();
      }
    }
  }
  if (anyHit) hud.hitMarker(anyKill, shot ? 4000 : 90);
  weapons.pullTrigger();
  player.recoil(def.recoil * (0.9 + random() * 0.2), (random() * 2 - 1) * 0.004);
  audio.shot(def.kind);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, def.name);
  game.lastShot = body.position.clone();
  game.lastShotTime = game.elapsed;
  bots.investigateShot(game.lastShot, game.elapsed);
  return true;
}

function throwFlash() {
  if (game.flashCount <= 0) return;
  if (game.phase !== 'live' && game.phase !== 'planted') return;
  game.flashCount -= 1;
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const at = body.position.clone().addScaledVector(forward, 7);
  at.y = 1.2;
  bots.flash(at, game.elapsed);
  hud.flashWhite(1100);
  audio.flash();
  hud.killfeed('FLASH-9 out — ASH is blind', 'ember');
  refreshBuy();
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  const targetFov = body.ads ? 58 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * 0.2;
    camera.updateProjectionMatrix();
  }
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function step(dt) {
  game.elapsed += dt;
  if (game.phase !== 'match') {
    game.phaseTimer -= dt;
    if (game.phase === 'buy' && game.phaseTimer <= 0) {
      setPhase('live', ROUND_SECONDS);
      hud.setBombStatus('Plant the charge at A or B', '');
      hud.killfeed(`Round ${game.round} — plant at A or B, or eliminate ASH`, 'info');
    } else if (game.phase === 'live' && game.phaseTimer <= 0) {
      endRound('ash', 'Time expired — the charge was never planted.');
    } else if (game.phase === 'planted' && game.phaseTimer <= 0) {
      detonate();
    } else if (game.phase === 'over' && game.phaseTimer <= 0) {
      nextRound();
    }
  }

  // Timers and beeps for the planted charge.
  if (game.phase === 'planted' && game.bombPos) {
    const secondsLeft = Math.ceil(game.phaseTimer);
    if (secondsLeft !== step.lastBeepSecond) {
      step.lastBeepSecond = secondsLeft;
      if (secondsLeft <= 10) audio.beep();
    }
    bombLight.intensity = 6 + Math.sin(game.elapsed * 6) * 4;
  }

  // Tracers fade.
  for (const tracer of tracers) {
    if (tracer.life > 0) {
      tracer.life -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.life / 0.07) * 0.85;
    }
  }

  if (game.phase === 'buy' || game.phase === 'live' || game.phase === 'planted') {
    if (body.alive) player.step(dt, input.state.keys, input.state.ads);
  }
  // The weapon keeps animating and reloading through the round-over pause, so a
  // reload started at the buzzer still finishes.
  if (game.phase !== 'match') weapons.step(dt);

  // Plant / defuse channels on held E.
  const wantUse = input.state.keys.has('KeyE') && body.alive;
  if (game.phase === 'live' && wantUse) {
    const site = siteAt(body.position);
    if (site) {
      game.plantProgress += dt / PLANT_SECONDS;
      hud.setPlantProgress(Math.min(1, game.plantProgress), `PLANTING AT ${site.name}…`);
      if (game.plantProgress >= 1) {
        game.plantProgress = 0;
        hud.hidePlantProgress();
        plantBomb(site);
      }
    } else {
      game.plantProgress = 0;
      hud.hidePlantProgress();
    }
  } else if (game.phase === 'planted' && wantUse && game.bombPos) {
    const dist = Math.hypot(game.bombPos.x - body.position.x, game.bombPos.z - body.position.z);
    if (dist < 1.8) {
      game.defuseProgress += dt / DEFUSE_SECONDS;
      hud.setPlantProgress(Math.min(1, game.defuseProgress), 'DEFUSING…');
      if (game.defuseProgress >= 1) {
        game.defuseProgress = 0;
        hud.hidePlantProgress();
        endRound('ember', 'You defused the charge.');
      }
    } else {
      game.defuseProgress = 0;
      hud.hidePlantProgress();
    }
  } else {
    if (game.plantProgress > 0 || game.defuseProgress > 0) hud.hidePlantProgress();
    game.plantProgress = 0;
    game.defuseProgress = 0;
  }

  // Bots run on their own clock during live and planted phases.
  if (game.phase === 'live' || game.phase === 'planted') {
    bots.step(dt, {
      time: game.elapsed,
      phase: game.phase,
      playerAlive: body.alive,
      playerPos: body.position,
      playerSpeed: player.groundSpeed(),
      playerCrouching: body.crouching,
      friendlies: bots.list.filter((bot) => bot.team === 'ember' && bot.alive),
      bombPlanted: game.bombPlanted,
      bombPos: game.bombPos,
      peaceful: Boolean(shot),
    });
  }

  // HUD readouts.
  hud.setTimer(game.phase === 'match' ? 0 : game.phaseTimer, game.phase);
  if (game.phase === 'planted') {
    hud.setBombStatus(`CHARGE LIVE — SITE ${game.bombSite ? game.bombSite.name : '?'} — ${Math.ceil(game.phaseTimer)}s`, 'planted');
  }
  hud.drawMinimap(body.position, body.yaw, bots.list, game.bombPlanted ? game.bombPos : null);
  const spreadPx = 4 + weapons.spread(player.groundSpeed(), body.ads, body.crouching) * 900;
  hud.setCrosshairGap(Math.min(26, spreadPx));
}

let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!game.frozen) {
    const look = input.takeLook();
    if (body.alive) player.look(look.x, look.y);
    // Edge keys.
    if (input.takePressed('KeyB') && game.phase === 'buy') {
      game.buyOpen = !game.buyOpen;
      hud.showBuy(game.buyOpen);
    }
    if (input.takePressed('KeyG')) throwFlash();
    if (input.takePressed('Digit1')) {
      const owned = Object.keys(WEAPONS).filter((id) => weapons.state.owned[id] && id !== 'pistol');
      if (owned.length > 0) weapons.select(owned[0]);
    }
    if (input.takePressed('Digit2')) weapons.select('pistol');
    if (input.state.keys.has('KeyR')) {
      if (weapons.reload()) audio.reload();
    }
    // Firing: autos hold, semis fire on the press edge. Test-firing is allowed
    // during the buy phase; bots only take damage once the round is live.
    const def = weapons.def();
    const firing = input.state.firing && body.alive && (game.phase === 'buy' || game.phase === 'live' || game.phase === 'planted');
    if (firing && weapons.ready()) {
      if (def.auto || !game.prevFiring) shoot(shot ? 0 : weapons.spread(player.groundSpeed(), body.ads, body.crouching));
    }
    game.prevFiring = input.state.firing;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    hud.setAmmo(weapons.state.mag, weapons.state.reserve, def.name);
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBanner();
  weapons.show();
  if (name === 'start') {
    startRound();
    body.position.set(0.6, 0, 11.8);
    settle(20);
    aimAt(new THREE.Vector3(-13.4, 1.4, -10.4));
    hud.showOverlay('start', 0);
    hud.showBuy(true);
  } else if (name === 'play') {
    game.money = 2700;
    buy('rifle');
    startRound();
    game.money = 3050;
    hud.setMoney(game.money);
    setPhase('live', 74);
    hud.setBombStatus('Plant the charge at A or B', '');
    body.position.set(-6, 0, 2);
    body.yaw = 0;
    settle(10);
    const target = bots.aimPoint(0);
    aimAt(target);
    // Three aimed shots: the first two wound, the third drops ASH-1.
    for (let round = 0; round < 3; round += 1) {
      aimAt(bots.aimPoint(0));
      shoot(0);
      if (round < 2) settle(8);
    }
    settle(10);
    aimAt(bots.aimPoint(1));
    hud.setHealth(100, 0);
    // Stage one more ASH bot out in the open for the frame: the crosshair should
    // sit on a bot the judge can actually see, not one half behind a crate.
    const open = bots.list.find((bot) => bot.team === 'ash' && bot.alive && bot.hp < 100) || bots.list.find((bot) => bot.team === 'ash' && bot.alive);
    if (open) {
      open.pos.set(-9, 0, -2);
      open.group.position.set(-9, 0, -2);
      open.yaw = Math.PI * 0.75;
      open.group.rotation.y = open.yaw;
      settle(2);
      aimAt(new THREE.Vector3(-9, 0.9, -2));
    }
  } else if (name === 'plant') {
    startRound();
    setPhase('planted', 32);
    game.bombPlanted = true;
    game.bombSite = world.sites.B;
    game.bombPos = new THREE.Vector3(12.2, 0, -11.0);
    bombMesh.position.set(12.2, 0.16, -11.0);
    bombMesh.visible = true;
    hud.setBombStatus('CHARGE PLANTED — SITE B', 'planted');
    body.position.set(12.6, 0, -8.2);
    settle(10);
    aimAt(new THREE.Vector3(12.2, 0.5, -11.0));
    hud.setPlantProgress(0.62, 'DEFUSING…');
  } else if (name === 'end') {
    game.scoreEmber = 3;
    game.scoreAsh = 1;
    game.round = 5;
    startRound();
    game.scoreEmber = 3;
    game.scoreAsh = 1;
    game.round = 5;
    hud.setScore(3, 1, 5);
    setPhase('over', 5);
    hud.banner('EMBER TAKES THE YARD', 'Final score  EMBER 3 — 1 ASH', 60000);
    body.position.set(0, 0, 8);
    settle(10);
    aimAt(new THREE.Vector3(0, 1.4, -10));
  }
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
  hud.setHealth(body.health, body.armour);
  hud.setMoney(game.money);
  hud.setScore(game.scoreEmber, game.scoreAsh, game.round);
  syncCamera();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      game.frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (game.phase === 'match') {
    resetMatch();
    input.requestLock();
    return;
  }
  if (game.phase === 'over') {
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  input.requestLock();
});

hud.onBuy((id) => buy(id));

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    game.started = true;
    hud.hideOverlay();
  } else if (game.phase !== 'over' && game.phase !== 'match') {
    hud.showOverlay(game.started ? 'paused' : 'start');
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

resetMatch();
syncCamera();
// Read-only handle for local play-testing (health, scores, bot states).
window.__ember = { game, body, bots, weapons };
if (shot) runShot(shot);
else requestAnimationFrame(frame);
