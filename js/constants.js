export const GRID_SIZE  = 80;
export const CELL_SIZE  = 2;       // world-units per grid cell
export const TICK_MS    = 100;     // 10 cells/sec  →  1 tick = 100 ms

export const TRAIL_W    = CELL_SIZE * 0.36;  // trail tube width (perpendicular)
export const TRAIL_H    = CELL_SIZE * 0.18;  // trail tube height

export const BIKE_Y     = CELL_SIZE * 0.28;  // bike mesh Y position
export const GLOW_Y     = CELL_SIZE * 0.5;   // point-light Y position

// Convert grid cell → world XZ (grid origin is centre of arena)
export function gridToWorld(gx, gz) {
  const half = (GRID_SIZE / 2) * CELL_SIZE;
  return {
    x: gx * CELL_SIZE - half + CELL_SIZE * 0.5,
    z: gz * CELL_SIZE - half + CELL_SIZE * 0.5,
  };
}

// Bike facing rotation.y per direction
// BoxGeometry length is along X → facing EAST (0 rad) by default
export const DIR_ANGLE = {
  EAST:  0,
  SOUTH: -Math.PI / 2,
  WEST:  Math.PI,
  NORTH:  Math.PI / 2,
};

export const DIR_VECTOR = {
  NORTH: { x: 0,  z: -1 },
  EAST:  { x: 1,  z:  0 },
  SOUTH: { x: 0,  z:  1 },
  WEST:  { x: -1, z:  0 },
};

export const TURN_LEFT = {
  NORTH: 'WEST', WEST: 'SOUTH', SOUTH: 'EAST', EAST: 'NORTH',
};
export const TURN_RIGHT = {
  NORTH: 'EAST', EAST: 'SOUTH', SOUTH: 'WEST', WEST: 'NORTH',
};

// Player is always slot 0; bots are 1-3
// Starting positions: [gx, gz, dir]
export const START_POSITIONS = [
  [20, 40, 'EAST'],   // Player
  [40, 20, 'SOUTH'],  // Bot 1
  [60, 40, 'WEST'],   // Bot 2
  [40, 60, 'NORTH'],  // Bot 3
];

export const PLAYER_COLOR = 0x00ffff;

// Bot colour pool — shuffled each round
export const BOT_COLORS = [0xff2233, 0xffee00, 0x00ff55];

// Camera follow settings
export const CAM_DIST   = 28;   // cells behind bike
export const CAM_HEIGHT = 22;   // cells above ground
export const CAM_AHEAD  = 8;    // cells ahead of bike to aim at
