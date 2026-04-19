const player = {
  pos:   new Vec2(1.5 * CELL_SIZE, 1.5 * CELL_SIZE),
  angle: FACING_ANGLES[1],
  fov:   60 * Math.PI / 180,

  gridR:  1,
  gridC:  1,
  facing: 1,

  moving:       false,
  moveFrom:     new Vec2(0, 0),
  moveTo:       new Vec2(0, 0),
  moveProgress: 0,
  nextGridR:    1,
  nextGridC:    1,

  rotating:      false,
  angleFrom:     0,
  angleTo:       0,
  rotProgress:   0,
  pendingFacing: 1,
};

let explored = [];

function initExplored() {
  explored = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
  markExplored();
}

function markExplored() {
  const r = player.gridR, c = player.gridC;
  explored[r][c] = true;
  for (const d of FACING_DIRS) {
    for (let step = 1; step <= 6; step++) {
      const nr = r + d.dr * step;
      const nc = c + d.dc * step;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) break;
      explored[nr][nc] = true;
      if (grid[nr][nc] === 1) break;
    }
  }
}

function startMove(dir) {
  const d  = FACING_DIRS[dir];
  const nr = player.gridR + d.dr;
  const nc = player.gridC + d.dc;
  if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) return;
  if (grid[nr][nc] !== 0) return;

  player.moving       = true;
  player.moveFrom     = new Vec2(player.pos.x, player.pos.y);
  player.moveTo       = new Vec2((nc + 0.5) * CELL_SIZE, (nr + 0.5) * CELL_SIZE);
  player.moveProgress = 0;
  player.nextGridR    = nr;
  player.nextGridC    = nc;

  triggerMonsterTurn(nr, nc);
}

function startRotate(dir) {
  player.rotating      = true;
  player.angleFrom     = player.angle;
  player.angleTo       = player.angle + dir * Math.PI / 2;
  player.rotProgress   = 0;
  player.pendingFacing = (player.facing + dir + 4) % 4;
}

function updatePlayer() {
  if (player.moving) {
    player.moveProgress += 1 / MOVE_FRAMES;
    if (player.moveProgress >= 1) {
      player.moveProgress = 1;
      player.moving  = false;
      player.gridR   = player.nextGridR;
      player.gridC   = player.nextGridC;
      player.pos.x   = player.moveTo.x;
      player.pos.y   = player.moveTo.y;
      markExplored();
      checkMonsterContact();
    } else {
      const t = smoothstep(player.moveProgress);
      player.pos.x = player.moveFrom.x + (player.moveTo.x - player.moveFrom.x) * t;
      player.pos.y = player.moveFrom.y + (player.moveTo.y - player.moveFrom.y) * t;
    }
  }

  if (player.rotating) {
    player.rotProgress += 1 / ROT_FRAMES;
    if (player.rotProgress >= 1) {
      player.rotating = false;
      player.facing   = player.pendingFacing;
      player.angle    = FACING_ANGLES[player.facing];
    } else {
      const t = smoothstep(player.rotProgress);
      player.angle = player.angleFrom + (player.angleTo - player.angleFrom) * t;
    }
  }
}
