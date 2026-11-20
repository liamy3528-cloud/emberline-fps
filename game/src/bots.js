// The bots: two friendly EMBER attackers who walk a lane with the player, and five
// ASH defenders who hold the sites and Mid. They walk waypoint routes, stop and
// burst-fire when they have line of sight, investigate nearby gunfire, and go blind
// when a flash grenade catches them. The player carries the charge, so the bots
// never plant — they fight, guard and defuse.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOT_SPEED = 3.2;
const BOT_HEIGHT = 1.72;
const BOT_RADIUS = 0.34;
const BURST_MIN = 3;
const BURST_MAX = 5;

export function createBots(scene, world, hooks) {
  const random = hooks.random || Math.random;
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();

  const teamColour = {
    ember: new THREE.Color(PALETTE.accent),
    ash: new THREE.Color(PALETTE.ash),
  };

  function buildMesh(team) {
    const group = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85, metalness: 0.1 });
    const cloth = new THREE.MeshStandardMaterial({ color: teamColour[team], roughness: 0.8, metalness: 0.05 });
    const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.9, metalness: 0 });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.24), dark);
    legs.position.y = 0.25;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.8, 0.3), cloth);
    torso.position.y = 0.9;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.28), skin);
    head.position.y = 1.42;
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.32), cloth);
    helmet.position.y = 1.58;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), dark);
    gun.position.set(0.18, 1.05, -0.3);
    group.add(legs, torso, head, helmet, gun);
    group.traverse((child) => {
      child.castShadow = true;
    });
    return { group, torso, head };
  }

  function makeBot(id, name, team, spawn, role, route) {
    const { group, torso, head } = buildMesh(team);
    group.position.copy(spawn);
    scene.add(group);
    const bot = {
      id, name, team, role, route,
      group, torso, head,
      pos: group.position,
      yaw: team === 'ember' ? 0 : Math.PI,
      hp: 100,
      alive: true,
      routeIndex: 0,
      holdPoint: spawn.clone(),
      patrolIndex: 0,
      state: 'walk',
      burstLeft: 0,
      burstTimer: 0,
      pauseTimer: 0,
      blindUntil: -1,
      defuseProgress: 0,
      investigate: null,
      investigateUntil: 0,
      target: null,
      fallT: 0,
    };
    torso.userData = { bot, part: 'body' };
    head.userData = { bot, part: 'head' };
    return bot;
  }

  let bots = [];
  let hitMeshes = [];

  function spawnRound(round) {
    for (const bot of bots) {
      scene.remove(bot.group);
    }
    bots = [];
    hitMeshes = [];
    const emberRoutes = [world.routes.aLong, world.routes.bLane];
    const emberSpawns = world.spawns.ember;
    for (let i = 0; i < 2; i += 1) {
      const bot = makeBot(`ember-${i + 1}`, `EMBER-${i + 1}`, 'ember', emberSpawns[i + 1], 'attack', emberRoutes[i]);
      bots.push(bot);
    }
    const ashPlan = [
      { spawn: world.spawns.ash[0], role: 'holdA', route: null },
      { spawn: world.spawns.ash[1], role: 'holdB', route: null },
      { spawn: world.spawns.ash[2], role: 'holdA', route: null },
      { spawn: world.spawns.ash[3], role: 'holdB', route: null },
      { spawn: world.spawns.ash[4], role: 'roam', route: world.routes.mid },
    ];
    for (let i = 0; i < ashPlan.length; i += 1) {
      const plan = ashPlan[i];
      const bot = makeBot(`ash-${i + 1}`, `ASH-${i + 1}`, 'ash', plan.spawn, plan.role, plan.route);
      bot.holdPoint = plan.spawn.clone();
      bots.push(bot);
    }
    for (const bot of bots) {
      hitMeshes.push(bot.torso, bot.head);
    }
    return bots;
  }

  function hasLineOfSight(from, to) {
    tmp.copy(to).sub(from);
    const dist = tmp.length();
    if (dist < 0.01) return true;
    tmp.normalize();
    raycaster.set(from, tmp);
    raycaster.far = dist;
    const hits = raycaster.intersectObjects(world.shootables, false);
    return hits.length === 0;
  }

  function eyeOf(bot) {
    return tmp2.set(bot.pos.x, bot.pos.y + 1.5, bot.pos.z);
  }

  function faceToward(bot, point, dt) {
    const targetYaw = Math.atan2(-(point.x - bot.pos.x), -(point.z - bot.pos.z));
    let diff = targetYaw - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
    bot.group.rotation.y = bot.yaw;
  }

  function moveToward(bot, point, dt) {
    const dx = point.x - bot.pos.x;
    const dz = point.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.25) return true;
    const step = Math.min(dist, BOT_SPEED * dt);
    const nx = bot.pos.x + (dx / dist) * step;
    const nz = bot.pos.z + (dz / dist) * step;
    if (!world.blockedAt(nx, bot.pos.y, bot.pos.z, BOT_RADIUS, BOT_HEIGHT)) bot.pos.x = nx;
    if (!world.blockedAt(bot.pos.x, bot.pos.y, nz, BOT_RADIUS, BOT_HEIGHT)) bot.pos.z = nz;
    faceToward(bot, point, dt);
    return false;
  }

  function hitChance(bot, targetPos, targetSpeed, targetCrouching) {
    const dist = bot.pos.distanceTo(targetPos);
    let chance = 0.55 - dist * 0.014;
    if (targetSpeed > 2) chance -= 0.1;
    if (targetCrouching) chance -= 0.08;
    return Math.max(0.05, Math.min(0.6, chance));
  }

  function botShoot(bot, targetBot, ctx) {
    const head = random() < 0.2;
    const damage = head ? 64 : 14 + Math.floor(random() * 9);
    if (targetBot) {
      hooks.onBotHitBot(bot, targetBot, damage, head);
    } else {
      hooks.onBotHitPlayer(bot, damage, head);
    }
    if (ctx.time - (bot.lastShotSound || -99) > 0.4) {
      bot.lastShotSound = ctx.time;
      hooks.onBotShotSound(bot);
    }
  }

  function pickTarget(bot, ctx) {
    // Nearest living enemy with line of sight inside 34 m and a 100-degree cone.
    // Returns { kind: 'player' }, { kind: 'bot', bot }, or null when nothing is seen.
    let best = null;
    let bestDist = 34;
    const eye = eyeOf(bot).clone();
    const enemies = bot.team === 'ash'
      ? ctx.friendlies.concat(ctx.playerAlive ? [{ player: true }] : [])
      : bots.filter((other) => other.team === 'ash' && other.alive);
    for (const enemy of enemies) {
      const isPlayer = enemy && enemy.player === true;
      const targetPos = isPlayer
        ? ctx.playerPos.clone().setY(ctx.playerPos.y + 1.3)
        : enemy.pos.clone().setY(enemy.pos.y + 1.2);
      const dist = eye.distanceTo(targetPos);
      if (dist > bestDist) continue;
      const dir = targetPos.clone().sub(eye).normalize();
      const forward = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
      if (dir.dot(forward) < 0.15 && dist > 4) continue;
      if (!hasLineOfSight(eye, targetPos)) continue;
      best = isPlayer ? { kind: 'player' } : { kind: 'bot', bot: enemy };
      bestDist = dist;
    }
    return best;
  }

  function stepBot(bot, dt, ctx) {
    if (!bot.alive) {
      if (bot.fallT < 1) {
        bot.fallT = Math.min(1, bot.fallT + dt * 2.8);
        bot.group.rotation.x = -Math.PI / 2 * bot.fallT;
        bot.group.position.y = bot.pos.y + 0.15 * bot.fallT;
      }
      return;
    }
    const blind = ctx.time < bot.blindUntil;
    const eye = eyeOf(bot).clone();

    // Defuse duty beats everything when the charge is planted.
    if (ctx.bombPlanted && bot.team === 'ash') {
      const bombPos = ctx.bombPos;
      const dist = Math.hypot(bombPos.x - bot.pos.x, bombPos.z - bot.pos.z);
      if (dist < 1.6) {
        bot.state = 'defuse';
        bot.defuseProgress += dt;
        faceToward(bot, bombPos, dt);
        if (bot.defuseProgress >= 5) hooks.onDefused(bot);
        return;
      }
      bot.state = 'walk';
      moveToward(bot, bombPos, dt);
      return;
    }

    if (!blind && (ctx.phase === 'live' || ctx.phase === 'planted') && !ctx.peaceful) {
      const target = pickTarget(bot, ctx);
      if (target) {
        bot.target = target;
        bot.state = 'engage';
      } else {
        bot.target = null;
        bot.state = bot.role === 'attack' ? 'walk' : 'hold';
      }
    } else if (ctx.peaceful) {
      bot.target = null;
      bot.state = bot.role === 'attack' ? 'walk' : 'hold';
    }

    if (blind) {
      bot.state = 'blind';
      bot.burstLeft = 0;
      return;
    }

    if (bot.state === 'engage') {
      const isPlayer = bot.target.kind === 'player';
      const targetPos = isPlayer
        ? ctx.playerPos.clone().setY(ctx.playerPos.y + 1.3)
        : bot.target.bot.pos.clone().setY(bot.target.bot.pos.y + 1.2);
      faceToward(bot, targetPos, dt);
      if (bot.burstLeft > 0) {
        bot.burstTimer -= dt;
        if (bot.burstTimer <= 0) {
          bot.burstTimer = 0.12;
          bot.burstLeft -= 1;
          const chance = hitChance(bot, targetPos, isPlayer ? ctx.playerSpeed : 2.5, isPlayer ? ctx.playerCrouching : false);
          if (random() < chance) botShoot(bot, isPlayer ? null : bot.target.bot, ctx);
          else hooks.onBotShotMiss(bot);
        }
      } else {
        bot.pauseTimer -= dt;
        if (bot.pauseTimer <= 0) {
          bot.burstLeft = BURST_MIN + Math.floor(random() * (BURST_MAX - BURST_MIN + 1));
          bot.burstTimer = 0;
          bot.pauseTimer = 0.5 + random() * 0.5;
        }
      }
      return;
    }

    if (bot.role === 'attack') {
      const route = bot.route;
      if (route && bot.routeIndex < route.length) {
        if (moveToward(bot, route[bot.routeIndex], dt)) bot.routeIndex += 1;
      } else {
        // Reached the site: hold and guard it.
        bot.state = 'hold';
        faceToward(bot, new THREE.Vector3(0, 0, -14), dt);
      }
      return;
    }

    if (bot.role === 'roam') {
      const route = bot.route;
      const point = route[bot.patrolIndex % route.length];
      if (moveToward(bot, point, dt)) bot.patrolIndex += 1;
      return;
    }

    // Hold roles: stand near the hold point, drift a little, watch the lane.
    if (bot.investigate && ctx.time < bot.investigateUntil) {
      if (moveToward(bot, bot.investigate, dt)) bot.investigate = null;
      return;
    }
    bot.investigate = null;
    const dx = bot.holdPoint.x - bot.pos.x;
    const dz = bot.holdPoint.z - bot.pos.z;
    if (Math.hypot(dx, dz) > 0.6) {
      moveToward(bot, bot.holdPoint, dt);
    } else {
      const watch = bot.role === 'holdA' ? new THREE.Vector3(-14, 0, 4) : new THREE.Vector3(14, 0, 4);
      faceToward(bot, watch, dt);
    }
  }

  function step(dt, ctx) {
    for (const bot of bots) stepBot(bot, dt, ctx);
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    bot.hp -= amount;
    if (bot.hp <= 0) {
      bot.hp = 0;
      bot.alive = false;
      bot.fallT = 0;
      bot.torso.userData.dead = true;
      bot.head.userData.dead = true;
      return true;
    }
    return false;
  }

  function investigateShot(pos, time) {
    for (const bot of bots) {
      if (!bot.alive || bot.team !== 'ash') continue;
      if (bot.pos.distanceTo(pos) < 18 && bot.state !== 'engage') {
        bot.investigate = pos.clone();
        bot.investigateUntil = time + 6;
      }
    }
  }

  function flash(pos, time) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      if (bot.pos.distanceTo(pos) > 18) continue;
      const eye = new THREE.Vector3(bot.pos.x, bot.pos.y + 1.5, bot.pos.z);
      const target = new THREE.Vector3(pos.x, pos.y + 1.2, pos.z);
      if (hasLineOfSight(eye, target)) bot.blindUntil = time + 3;
    }
  }

  function aliveCount(team) {
    return bots.filter((bot) => bot.team === team && bot.alive).length;
  }

  function aimPoint(index) {
    const living = bots.filter((bot) => bot.team === 'ash' && bot.alive);
    const bot = living[index % Math.max(1, living.length)];
    if (!bot) return new THREE.Vector3(0, 0.9, -8);
    // Torso centre: the torso box spans y 0.5..1.3, so aim at its middle.
    return new THREE.Vector3(bot.pos.x, bot.pos.y + 0.9, bot.pos.z);
  }

  return {
    get list() { return bots; },
    get hitMeshes() { return hitMeshes; },
    spawnRound,
    step,
    damage,
    investigateShot,
    flash,
    aliveCount,
    aimPoint,
  };
}
