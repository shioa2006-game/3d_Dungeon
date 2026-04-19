// セルが属する陣営を返す（中立・範囲外は null）
function getFactionForCell(gr, gc) {
  for (const f of Object.values(FACTIONS)) {
    if (!f.zone) continue;
    const [r1, r2, c1, c2] = f.zone;
    if (gr >= r1 && gr <= r2 && gc >= c1 && gc <= c2) return f;
  }
  return null;
}

function drawMinimap() {
  const R        = MINIMAP;
  const pad      = 10;
  const mapArea  = Math.min(R.w - pad * 2, R.h - pad * 2);
  const cellDraw = mapArea / MINIMAP_VIEW_CELLS;
  const mapX0    = R.x + (R.w - mapArea) / 2;
  const mapY0    = R.y + (R.h - mapArea) / 2;

  fillRect(R.x, R.y, R.w, R.h, 30, 30, 30);

  ctx.save();
  ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();

  const pcx      = player.pos.x / CELL_SIZE;
  const pcy      = player.pos.y / CELL_SIZE;
  const half     = MINIMAP_VIEW_CELLS / 2;
  const viewLeft = pcx - half;
  const viewTop  = pcy - half;

  for (let dy = -1; dy <= MINIMAP_VIEW_CELLS; dy++) {
    for (let dx = -1; dx <= MINIMAP_VIEW_CELLS; dx++) {
      const gc = Math.floor(viewLeft + dx);
      const gr = Math.floor(viewTop  + dy);
      const sx = mapX0 + (gc - viewLeft) * cellDraw;
      const sy = mapY0 + (gr - viewTop)  * cellDraw;

      const outOfBounds = gc < 0 || gc >= GRID_SIZE || gr < 0 || gr >= GRID_SIZE;

      if (outOfBounds) {
        fillRect(sx, sy, cellDraw + 1, cellDraw + 1, 6, 6, 6);
      } else if (grid[gr][gc] === 1) {
        fillRect(sx, sy, cellDraw + 1, cellDraw + 1, 105, 135, 125);
      } else {
        fillRect(sx, sy, cellDraw + 1, cellDraw + 1, 18, 18, 18);
        // 陣営ゾーン色を半透明で重ねる
        const faction = getFactionForCell(gr, gc);
        if (faction) {
          ctx.fillStyle = faction.color + '55';
          ctx.fillRect(sx, sy, cellDraw + 1, cellDraw + 1);
        }
      }
    }
  }

  // グリッド線
  for (let i = 0; i <= MINIMAP_VIEW_CELLS + 1; i++) {
    const gc = Math.floor(viewLeft) + i;
    const sx = mapX0 + (gc - viewLeft) * cellDraw;
    const gr = Math.floor(viewTop)  + i;
    const sy = mapY0 + (gr - viewTop)  * cellDraw;
    if (sx >= R.x && sx <= R.x + R.w) drawLine(sx, R.y, sx, R.y + R.h, 60, 80, 70, 0.4, 1);
    if (sy >= R.y && sy <= R.y + R.h) drawLine(R.x, sy, R.x + R.w, sy, 60, 80, 70, 0.4, 1);
  }

  // クリスタルドット（プレイヤーマーカーより先に描画）
  drawCrystalsOnMinimap();

  // プレイヤー ○
  const px    = mapX0 + (pcx - viewLeft) * cellDraw;
  const py    = mapY0 + (pcy - viewTop)  * cellDraw;
  const circR = cellDraw * 0.28;

  ctx.beginPath();
  ctx.arc(px, py, circR, 0, Math.PI * 2);
  ctx.fillStyle   = 'rgb(0,110,170)';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth   = 2;
  ctx.fill(); ctx.stroke();

  // プレイヤー方向 △
  const triDist = circR + cellDraw * 0.28;
  const triH    = cellDraw * 0.28;
  const triW    = cellDraw * 0.22;
  const triCx   = px + Math.cos(player.angle) * triDist;
  const triCy   = py + Math.sin(player.angle) * triDist;
  const perpA   = player.angle + Math.PI / 2;
  const tx  = triCx + Math.cos(player.angle) * triH * 0.6;
  const ty  = triCy + Math.sin(player.angle) * triH * 0.6;
  const bx1 = triCx - Math.cos(player.angle) * triH * 0.4 + Math.cos(perpA) * triW;
  const by1 = triCy - Math.sin(player.angle) * triH * 0.4 + Math.sin(perpA) * triW;
  const bx2 = triCx - Math.cos(player.angle) * triH * 0.4 - Math.cos(perpA) * triW;
  const by2 = triCy - Math.sin(player.angle) * triH * 0.4 - Math.sin(perpA) * triW;

  ctx.beginPath();
  ctx.moveTo(tx, ty); ctx.lineTo(bx1, by1); ctx.lineTo(bx2, by2);
  ctx.closePath();
  ctx.fillStyle = 'rgb(0,110,170)'; ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.fill(); ctx.stroke();

  ctx.restore();
  strokeRect(R.x, R.y, R.w, R.h, 80, 80, 80, 2);
}
