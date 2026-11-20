// EMBERLINE look plan: a dusk-orange industrial yard at last light. Every colour the
// game or the HUD uses comes from this one table, so the yard, the teams and the
// interface read as one place: ember orange for the player's team, ash red-grey for
// the defenders, teal for the two bomb sites.
export const PALETTE = {
  canvas: '#191008',   // dusk sky / background
  surface: '#2b1f14',  // concrete and steel in shadow
  hairline: '#4a3823', // crates, container ribs, wall trim
  ink: '#f2ead9',      // warm off-white: text, tracers, headlamps
  muted: '#a89a83',    // dust, distant steel
  accent: '#ff7a1a',   // ember orange: EMBER team, muzzle flash, key light
  ash: '#c6452f',      // ash red: ASH team, danger, damage
  teal: '#2fd4c4',     // site markers A and B, plant beacons
};

export function shade(name) {
  return PALETTE[name];
}
