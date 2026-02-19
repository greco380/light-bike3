import { DIR_VECTOR, TURN_LEFT, TURN_RIGHT, GRID_SIZE } from './constants.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inBounds(gx, gz) {
  return gx >= 0 && gx < GRID_SIZE && gz >= 0 && gz < GRID_SIZE;
}

function isFree(gx, gz, grid) {
  return inBounds(gx, gz) && grid[gz][gx] === null;
}

// Straight-line look-ahead: returns number of free cells before a wall (0 = blocked)
function lookAhead(gx, gz, dir, steps, grid) {
  const v = DIR_VECTOR[dir];
  for (let i = 1; i <= steps; i++) {
    if (!isFree(gx + v.x * i, gz + v.z * i, grid)) return i - 1;
  }
  return steps;
}

// BFS flood fill – returns reachable cell count up to cap
function floodFill(gx, gz, grid, cap = 300) {
  if (!isFree(gx, gz, grid)) return 0;
  const visited = new Set([`${gx},${gz}`]);
  const queue   = [[gx, gz]];
  while (queue.length && visited.size < cap) {
    const [cx, cz] = queue.shift();
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cx + dx, nz = cz + dz;
      const k  = `${nx},${nz}`;
      if (!visited.has(k) && isFree(nx, nz, grid)) {
        visited.add(k);
        queue.push([nx, nz]);
      }
    }
  }
  return visited.size;
}

// All moves a bike can make this tick without immediately dying
function safeOptions(bike, grid) {
  const candidates = [
    { turn: null,    dir: bike.dir },
    { turn: 'LEFT',  dir: TURN_LEFT[bike.dir]  },
    { turn: 'RIGHT', dir: TURN_RIGHT[bike.dir] },
  ];
  return candidates
    .map(c => {
      const v  = DIR_VECTOR[c.dir];
      const nx = bike.gx + v.x;
      const nz = bike.gz + v.z;
      return { ...c, nx, nz, safe: isFree(nx, nz, grid) };
    })
    .filter(c => c.safe);
}

function applyChoice(bike, choice) {
  if (choice && choice.turn) bike.queueTurn(choice.turn);
}

// ─── Personalities ───────────────────────────────────────────────────────────

/**
 * AVOIDANT – maximises personal survival.
 * Scores moves by flood-fill space then look-ahead distance.
 */
export function decideAvoidant(bike, grid) {
  const opts = safeOptions(bike, grid);
  if (opts.length === 0) return;

  const scored = opts.map(o => ({
    ...o,
    score: floodFill(o.nx, o.nz, grid) * 10 + lookAhead(o.nx, o.nz, o.dir, 12, grid),
  }));
  scored.sort((a, b) => b.score - a.score);
  applyChoice(bike, scored[0]);
}

/**
 * ENGAGING – area-denial.
 * Prefers moves that maximise straight-line reach (cutting across the map)
 * while still keeping enough flood-fill space to avoid imminent death.
 */
export function decideEngaging(bike, grid) {
  const opts = safeOptions(bike, grid);
  if (opts.length === 0) return;

  const scored = opts.map(o => {
    const space  = floodFill(o.nx, o.nz, grid, 200);
    const reach  = lookAhead(o.nx, o.nz, o.dir, 20, grid);
    // Weight ahead-distance heavily – this creates long cuts across the map
    return { ...o, score: reach * 5 + space * 0.8 };
  });
  scored.sort((a, b) => b.score - a.score);
  applyChoice(bike, scored[0]);
}

/**
 * AGGRESSIVE – tries to intercept the player, but not clairvoyantly.
 * Only actively hunts when close; falls back to engaging when far away.
 * Requires meaningful safety so it doesn't blindly suicide.
 */
export function decideAggressive(bike, grid, playerBike) {
  if (!playerBike || !playerBike.alive) {
    decideAvoidant(bike, grid);
    return;
  }

  const opts = safeOptions(bike, grid);
  if (opts.length === 0) return;

  const manDist = Math.abs(bike.gx - playerBike.gx) + Math.abs(bike.gz - playerBike.gz);

  // Beyond ~30 cells, hunting is ineffective — use engaging (area denial) instead
  if (manDist > 30) {
    decideEngaging(bike, grid);
    return;
  }

  // Predict player position only 3 ticks ahead (not telepathic)
  const PRED = 3;
  const pv    = DIR_VECTOR[playerBike.dir];
  const predX = playerBike.gx + pv.x * PRED;
  const predZ = playerBike.gz + pv.z * PRED;

  const scored = opts.map(o => {
    const interceptDist = Math.abs(o.nx - predX) + Math.abs(o.nz - predZ);
    const safety        = lookAhead(o.nx, o.nz, o.dir, 6, grid);
    const space         = floodFill(o.nx, o.nz, grid, 150);

    // Require at least 4 clear cells ahead — won't blindly charge into corners
    if (safety < 4) return { ...o, score: -999 };

    // Balance: 60% intercept drive, 40% self-preservation
    return { ...o, score: (80 - interceptDist) * 0.6 + space * 0.4 };
  });
  scored.sort((a, b) => b.score - a.score);

  if (scored[0].score < 0) {
    decideAvoidant(bike, grid);
    return;
  }
  applyChoice(bike, scored[0]);
}

// ─── Bot wrapper class ────────────────────────────────────────────────────────

export class Bot {
  constructor(bike, personality) {
    this.bike        = bike;
    this.personality = personality; // 'AVOIDANT' | 'ENGAGING' | 'AGGRESSIVE'
  }

  decide(grid, playerBike) {
    switch (this.personality) {
      case 'AVOIDANT':   decideAvoidant(this.bike, grid);                    break;
      case 'ENGAGING':   decideEngaging(this.bike, grid);                    break;
      case 'AGGRESSIVE': decideAggressive(this.bike, grid, playerBike);      break;
    }
  }
}
