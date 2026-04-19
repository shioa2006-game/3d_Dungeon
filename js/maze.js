function generateMaze(size) {
  const g = Array.from({ length: size }, () => Array(size).fill(1));

  function carve(r, c) {
    g[r][c] = 0;
    const dirs = [
      { dr: -2, dc:  0 }, { dr:  2, dc:  0 },
      { dr:  0, dc: -2 }, { dr:  0, dc:  2 },
    ];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    for (const { dr, dc } of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 1 && nr < size - 1 && nc >= 1 && nc < size - 1 && g[nr][nc] === 1) {
        g[r + dr / 2][c + dc / 2] = 0;
        carve(nr, nc);
      }
    }
  }
  carve(1, 1);
  return g;
}

function addLoops(g, count, size) {
  const candidates = [];
  for (let r = 1; r < size - 1; r++) {
    for (let c = 1; c < size - 1; c++) {
      if (g[r][c] !== 1) continue;
      if (r % 2 === 0 && c % 2 === 1 && g[r - 1][c] === 0 && g[r + 1][c] === 0)
        candidates.push({ r, c });
      if (r % 2 === 1 && c % 2 === 0 && g[r][c - 1] === 0 && g[r][c + 1] === 0)
        candidates.push({ r, c });
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (let i = 0; i < Math.min(count, candidates.length); i++)
    g[candidates[i].r][candidates[i].c] = 0;
}

function gridToWalls(g) {
  const walls = [];
  const S  = CELL_SIZE;
  const GS = GRID_SIZE;
  const colH = [120, 150, 140];
  const colV = [90,  120, 110];

  walls.push(new Segment(new Vec2(0, 0),      new Vec2(GS * S, 0),      colH));
  walls.push(new Segment(new Vec2(0, GS * S), new Vec2(GS * S, GS * S), colH));
  walls.push(new Segment(new Vec2(0, 0),      new Vec2(0, GS * S),      colV));
  walls.push(new Segment(new Vec2(GS * S, 0), new Vec2(GS * S, GS * S), colV));

  for (let r = 0; r < GS - 1; r++) {
    let startC = -1;
    for (let c = 0; c <= GS; c++) {
      const hasEdge = c < GS && (g[r][c] !== g[r + 1][c]);
      if (hasEdge && startC === -1) { startC = c; }
      else if (!hasEdge && startC !== -1) {
        walls.push(new Segment(new Vec2(startC * S, (r + 1) * S), new Vec2(c * S, (r + 1) * S), colH));
        startC = -1;
      }
    }
  }
  for (let c = 0; c < GS - 1; c++) {
    let startR = -1;
    for (let r = 0; r <= GS; r++) {
      const hasEdge = r < GS && (g[r][c] !== g[r][c + 1]);
      if (hasEdge && startR === -1) { startR = r; }
      else if (!hasEdge && startR !== -1) {
        walls.push(new Segment(new Vec2((c + 1) * S, startR * S), new Vec2((c + 1) * S, r * S), colV));
        startR = -1;
      }
    }
  }
  return walls;
}

function bfsPath(g, startR, startC, goalR, goalC) {
  if (startR === goalR && startC === goalC) return [];
  const queue   = [{ r: startR, c: startC, path: [] }];
  const visited = new Set([`${startR},${startC}`]);
  while (queue.length > 0) {
    const { r, c, path } = queue.shift();
    for (const d of FACING_DIRS) {
      const nr = r + d.dr, nc = c + d.dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      if (g[nr][nc] !== 0) continue;
      const key = `${nr},${nc}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const newPath = [...path, { r: nr, c: nc }];
      if (nr === goalR && nc === goalC) return newPath;
      queue.push({ r: nr, c: nc, path: newPath });
    }
  }
  return [];
}
