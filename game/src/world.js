// Yard 7: a 36 x 28 m walled industrial yard at dusk. Three lanes run north from the
// EMBER spawn in the south to the ASH spawn in the north: A-long along the west wall
// to the fuel depot (site A), Mid through the crate field, and B-lane along the east
// wall to the crane yard (site B). Cover is boxes only — containers, crates, pillars
// and one low platform — so every bullet and every bot path is easy to reason about.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const HALF_X = 18;
const HALF_Z = 14;

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' || name === 'teal' ? 0.55 : 0.92,
      metalness: name === 'hairline' ? 0.25 : 0.03,
      emissive: name === 'teal' || name === 'accent' ? new THREE.Color(PALETTE[name]) : new THREE.Color('#000000'),
      emissiveIntensity: name === 'teal' ? 0.55 : name === 'accent' ? 0.35 : 0,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and perimeter walls, open to a dusk sky.
  box(2 * HALF_X + 0.8, 0.4, 2 * HALF_Z + 0.8, 0, -0.2, 0, 'surface');
  box(0.4, 4.6, 2 * HALF_Z + 0.8, -HALF_X - 0.2, 2.3, 0, 'hairline');
  box(0.4, 4.6, 2 * HALF_Z + 0.8, HALF_X + 0.2, 2.3, 0, 'hairline');
  box(2 * HALF_X + 0.8, 4.6, 0.4, 0, 2.3, -HALF_Z - 0.2, 'hairline');
  box(2 * HALF_X + 0.8, 4.6, 0.4, 0, 2.3, HALF_Z + 0.2, 'hairline');

  // Site A — fuel depot, west end. Two tanks and a low wall to plant behind.
  box(2.2, 2.6, 2.2, -15.2, 1.3, -10.6, 'hairline');
  box(2.2, 2.6, 2.2, -11.6, 1.3, -12.0, 'hairline');
  box(4.4, 1.0, 0.8, -13.4, 0.5, -7.6, 'surface');
  // Site B — crane yard, east end. Stacked containers and a crate pile.
  box(3.6, 2.4, 1.4, 14.6, 1.2, -11.4, 'hairline');
  box(3.6, 2.4, 1.4, 14.6, 1.2, -8.6, 'surface');
  box(1.4, 1.1, 1.4, 11.2, 0.55, -11.6, 'surface');
  box(1.4, 1.1, 1.4, 11.2, 0.55, -8.4, 'surface');

  // A-long cover (west lane): a container mid-way and a pillar at the corner.
  box(1.4, 2.4, 3.6, -15.6, 1.2, 0.5, 'hairline');
  box(1.2, 3.4, 1.2, -15.8, 1.7, -4.6, 'surface');
  box(2.4, 1.0, 1.2, -13.0, 0.5, 4.6, 'surface');
  // Mid cover: crate field with two crouch-height blocks and a pillar.
  box(1.6, 1.1, 1.6, -3.2, 0.55, -1.0, 'surface');
  box(1.6, 1.1, 1.6, 3.2, 0.55, -1.0, 'surface');
  box(1.2, 3.2, 1.2, 0, 1.6, -5.6, 'hairline');
  box(2.2, 0.9, 1.2, -0.6, 0.45, 5.2, 'surface');
  box(2.2, 0.9, 1.2, 4.4, 0.45, 7.2, 'surface');
  // B-lane cover (east lane): container and pillar mirroring A-long.
  box(1.4, 2.4, 3.6, 15.6, 1.2, 0.5, 'hairline');
  box(1.2, 3.4, 1.2, 15.8, 1.7, -4.6, 'surface');
  box(2.4, 1.0, 1.2, 13.0, 0.5, 4.6, 'surface');
  // Low platform in the middle of the yard, jumpable, overlooks Mid.
  box(4.0, 0.5, 3.0, -8.0, 0.25, 2.0, 'surface');
  // Spawn cover so nobody is shot in the back in the first second.
  box(1.6, 1.6, 0.8, -3.0, 0.8, 10.6, 'hairline');
  box(1.6, 1.6, 0.8, 3.0, 0.8, 10.6, 'hairline');
  box(1.6, 1.6, 0.8, -3.0, 0.8, -10.6, 'hairline');
  box(1.6, 1.6, 0.8, 3.0, 0.8, -10.6, 'hairline');

  // Site markers: a teal ground plate and a thin light beacon at each site.
  function siteMarker(cx, cz) {
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(5.4, 5.4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.teal), transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(cx, 0.02, cz);
    group.add(plate);
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 7, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.teal), transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    beacon.position.set(cx, 3.5, cz);
    group.add(beacon);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 2.7, 32),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.teal), transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.03, cz);
    group.add(ring);
  }
  siteMarker(-13.4, -10.4);
  siteMarker(13.4, -10.4);

  // Dusk light: a low orange key from the west, a cool fill, and a dim sky.
  const sky = new THREE.HemisphereLight(new THREE.Color('#5a4632'), new THREE.Color(PALETTE.canvas), 1.5);
  scene.add(sky);
  const ambient = new THREE.AmbientLight(new THREE.Color('#6b563e'), 0.5);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.accent), 3.2);
  key.position.set(-14, 10, 8);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -22;
  key.shadow.camera.right = 22;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -20;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.9);
  fill.position.set(10, 9, 12);
  scene.add(fill);
  // Two warm yard lamps over the sites, so the objectives read at a glance.
  for (const cx of [-13.4, 13.4]) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.teal), 22, 12);
    lamp.position.set(cx, 4.2, -10.4);
    scene.add(lamp);
  }

  const probe = new THREE.Box3();
  function blockedAt(x, y, z, radius, height, lift = 0.04) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  return {
    colliders,
    shootables,
    group,
    halfX: HALF_X,
    halfZ: HALF_Z,
    blockedAt,
    sites: {
      A: { name: 'A', label: 'FUEL DEPOT', center: new THREE.Vector3(-13.4, 0, -10.4), half: 2.7 },
      B: { name: 'B', label: 'CRANE YARD', center: new THREE.Vector3(13.4, 0, -10.4), half: 2.7 },
    },
    spawns: {
      ember: [
        new THREE.Vector3(0, 0, 11.8),
        new THREE.Vector3(-2.4, 0, 11.8),
        new THREE.Vector3(2.4, 0, 11.8),
      ],
      ash: [
        new THREE.Vector3(-13.4, 0, -7.0),
        new THREE.Vector3(13.4, 0, -7.0),
        new THREE.Vector3(-4.0, 0, -11.6),
        new THREE.Vector3(4.0, 0, -11.6),
        new THREE.Vector3(0, 0, -12.4),
      ],
    },
    // Waypoint routes bots walk, lane by lane, south to north and back.
    routes: {
      aLong: [
        new THREE.Vector3(-15.0, 0, 8.0),
        new THREE.Vector3(-15.0, 0, 0.0),
        new THREE.Vector3(-14.0, 0, -6.0),
        new THREE.Vector3(-13.4, 0, -9.0),
      ],
      mid: [
        new THREE.Vector3(0, 0, 8.0),
        new THREE.Vector3(-1.0, 0, 2.0),
        new THREE.Vector3(1.0, 0, -3.0),
        new THREE.Vector3(0, 0, -8.0),
      ],
      bLane: [
        new THREE.Vector3(15.0, 0, 8.0),
        new THREE.Vector3(15.0, 0, 0.0),
        new THREE.Vector3(14.0, 0, -6.0),
        new THREE.Vector3(13.4, 0, -9.0),
      ],
    },
  };
}
