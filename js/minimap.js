// セルが属する陣営を返す（中立・範囲外は null）
function getFactionForCell(gr, gc) {
  for (const f of Object.values(FACTIONS)) {
    if (!f.zone) continue;
    const [r1, r2, c1, c2] = f.zone;
    if (gr >= r1 && gr <= r2 && gc >= c1 && gc <= c2) return f;
  }
  return null;
}

// =====================
// 全体マップ state
// =====================
let fullMapOpen = false;
function toggleFullMap() { fullMapOpen = !fullMapOpen; }

// =====================
// ミニマップ: ユニット描画ヘルパー
// =====================
function _drawBadge(cx, cy, count) {
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#cc2222';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(count > 9 ? '9+' : String(count), cx, cy);
}

function drawUnitsOnMinimap(mapX0, mapY0, viewLeft, viewTop, cellDraw) {
  const sz = cellDraw * 0.92;

  // Group by grid cell
  const cellGroups = new Map();
  for (const m of monsters) {
    const key = `${m.gridR},${m.gridC}`;
    if (!cellGroups.has(key)) cellGroups.set(key, []);
    cellGroups.get(key).push(m);
  }

  for (const [key, group] of cellGroups) {
    const [gr, gc] = key.split(',').map(Number);
    const gx = gc + 0.5 - viewLeft;
    const gy = gr + 0.5 - viewTop;
    // Clip check (with 1-cell margin — ctx.clip handles the rest)
    if (gx < -1 || gx > MINIMAP_VIEW_CELLS + 1 ||
        gy < -1 || gy > MINIMAP_VIEW_CELLS + 1) continue;

    const cx = mapX0 + gx * cellDraw;
    const cy = mapY0 + gy * cellDraw;
    const rep = group[0];
    drawSpriteAt(rep.type, rep.hp / rep.maxHp, cx - sz / 2, cy - sz / 2, sz);

    if (group.length > 1) {
      _drawBadge(cx + sz / 2 - 6, cy - sz / 2 + 6, group.length);
    }
  }
}

// =====================
// ミニマップ描画（常時表示）
// =====================
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

  // セル描画
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

  // クリスタル（ユニットより下のレイヤー）
  drawCrystalsOnMinimap();

  // ユニット
  drawUnitsOnMinimap(mapX0, mapY0, viewLeft, viewTop, cellDraw);

  // プレイヤースプライト（○の置き換え）
  const px  = mapX0 + (pcx - viewLeft) * cellDraw;
  const py  = mapY0 + (pcy - viewTop)  * cellDraw;
  const pSz = cellDraw * 0.92;
  drawSpriteAt('player', 1.0, px - pSz / 2, py - pSz / 2, pSz);

  // 方向△（既存のまま維持）
  const circR   = cellDraw * 0.28;
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

// =====================
// 全体マップ（Mキーで開閉）
// =====================
function drawFullMap() {
  if (!fullMapOpen) return;

  const cellDraw = 12;
  const mapW  = GRID_SIZE * cellDraw;   // 51 × 12 = 612
  const mapH  = GRID_SIZE * cellDraw;
  const mapX0 = Math.floor((CANVAS_W - mapW) / 2);   // 194
  const mapY0 = Math.floor((CANVAS_H - mapH) / 2);   // 44

  // 暗転オーバーレイ
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // マップ全体を壁色で塗りつぶし
  ctx.fillStyle = '#445544';
  ctx.fillRect(mapX0, mapY0, mapW, mapH);

  // 通路セルを描画
  for (let gr = 0; gr < GRID_SIZE; gr++) {
    for (let gc = 0; gc < GRID_SIZE; gc++) {
      if (grid[gr][gc] !== 0) continue;
      const sx = mapX0 + gc * cellDraw;
      const sy = mapY0 + gr * cellDraw;
      ctx.fillStyle = '#111111';
      ctx.fillRect(sx, sy, cellDraw, cellDraw);
      const f = getFactionForCell(gr, gc);
      if (f) {
        ctx.fillStyle = f.color + '44';
        ctx.fillRect(sx, sy, cellDraw, cellDraw);
      }
    }
  }

  // クリスタル
  for (const cr of crystals) {
    const sx = mapX0 + (cr.c + 0.5) * cellDraw;
    const sy = mapY0 + (cr.r + 0.5) * cellDraw;
    const f  = FACTIONS[cr.owner];
    ctx.beginPath();
    ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = f ? f.color : '#888888';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ユニット（陣営色の丸）
  const cellGroups = new Map();
  for (const m of monsters) {
    const key = `${m.gridR},${m.gridC}`;
    if (!cellGroups.has(key)) cellGroups.set(key, []);
    cellGroups.get(key).push(m);
  }
  for (const [key, group] of cellGroups) {
    const [gr, gc] = key.split(',').map(Number);
    const sx     = mapX0 + (gc + 0.5) * cellDraw;
    const sy     = mapY0 + (gr + 0.5) * cellDraw;
    const rep    = group[0];
    const fColor = (FACTIONS[rep.faction] || { color: '#888888' }).color;
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fillStyle = fColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // プレイヤー: 方向線 → 白丸
  const psx = mapX0 + (player.pos.x / CELL_SIZE) * cellDraw;
  const psy = mapY0 + (player.pos.y / CELL_SIZE) * cellDraw;
  ctx.beginPath();
  ctx.moveTo(psx, psy);
  ctx.lineTo(
    psx + Math.cos(player.angle) * cellDraw * 1.5,
    psy + Math.sin(player.angle) * cellDraw * 1.5
  );
  ctx.strokeStyle = '#66bbff';
  ctx.lineWidth   = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(psx, psy, 5.5, 0, Math.PI * 2);
  ctx.fillStyle   = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#0066aa';
  ctx.lineWidth   = 2;
  ctx.stroke();

  // ヒントテキスト
  ctx.fillStyle     = 'rgba(255,255,255,0.8)';
  ctx.font          = 'bold 13px monospace';
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'bottom';
  ctx.fillText('全体マップ　[ M ] で閉じる', CANVAS_W / 2, mapY0 - 6);

  // 枠線
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(mapX0, mapY0, mapW, mapH);
}
