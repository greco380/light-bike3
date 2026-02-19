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
 * AGGRESSIVE – tries to intercept the player.
 * Predicts player's position a few ticks ahead and moves to minimise
 * Manhattan distance to that point.  Will accept lower flood-fill space.
 * Falls back to avoidant if truly cornered.
 */
export function decideAggressive(bike, grid, playerBike) {
  if (!playerBike || !playerBike.alive) {
    decideAvoidant(bike, grid);
    return;
  }

  const opts = safeOptions(bike, grid);
  if (opts.length === 0) return;

  // Predict where the player will be in ~6 ticks (straight-line estimate)
  const PRED = 6;
  const pv   = DIR_VECTOR[playerBike.dir];
  const predX = playerBike.gx + pv.x * PRED;
  const predZ = playerBike.gz + pv.z * PRED;

  const scored = opts.map(o => {
    const dist   = Math.abs(o.nx - predX) + Math.abs(o.nz - predZ);
    const safety = lookAhead(o.nx, o.nz, o.dir, 3, grid); // only needs 3 cells of safety
    // Give a big bonus for being close; but require at least 1 safe step ahead
    return { ...o, score: safety >= 1 ? (120 - dist) : -999 };
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
