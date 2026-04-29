// セルが属するブロックのクリスタル所有陣営を返す（中立・範囲外は null）
function getFactionForCell(gr, gc) {
  let bR = -1, bC = -1;
  for (let i = 0; i < 5; i++) {
    if (gr >= BLOCK_ROW_STARTS[i] && gr <= BLOCK_ROW_ENDS[i]) { bR = i; break; }
  }
  for (let i = 0; i < 5; i++) {
    if (gc >= BLOCK_COL_STARTS[i] && gc <= BLOCK_COL_ENDS[i]) { bC = i; break; }
  }
  if (bR < 0 || bC < 0) return null;
  const cr = crystals.find(x => x.blockR === bR && x.blockC === bC);
  if (!cr || cr.owner === 'neutral') return null;
  return FACTIONS[cr.owner] ?? null;
}

// =====================
// 全体マップ state（専用キャンバスで最前面表示）
// =====================
let fullMapOpen = false;
let _fmCanvas   = null;
let _fmCtx      = null;

function _initFmCanvas() {
  if (_fmCanvas) return;
  _fmCanvas = document.getElementById('fullmap-c');
  _fmCanvas.width  = CANVAS_W;
  _fmCanvas.height = CANVAS_H;
  _fmCtx = _fmCanvas.getContext('2d');
}

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
        fillRect(sx, sy, cellDraw + 1, cellDraw + 1, 45, 55, 52);
      } else {
        fillRect(sx, sy, cellDraw + 1, cellDraw + 1, 18, 18, 18);
        const faction = getFactionForCell(gr, gc);
        if (faction) {
          ctx.fillStyle = faction.color + '6e';
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
  const triCx   = px + Math.cos(player.visualAngle) * triDist;
  const triCy   = py + Math.sin(player.visualAngle) * triDist;
  const perpA   = player.visualAngle + Math.PI / 2;
  const tx  = triCx + Math.cos(player.visualAngle) * triH * 0.6;
  const ty  = triCy + Math.sin(player.visualAngle) * triH * 0.6;
  const bx1 = triCx - Math.cos(player.visualAngle) * triH * 0.4 + Math.cos(perpA) * triW;
  const by1 = triCy - Math.sin(player.visualAngle) * triH * 0.4 + Math.sin(perpA) * triW;
  const bx2 = triCx - Math.cos(player.visualAngle) * triH * 0.4 - Math.cos(perpA) * triW;
  const by2 = triCy - Math.sin(player.visualAngle) * triH * 0.4 - Math.sin(perpA) * triW;

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
// 全体マップ（Mキーで開閉）— 専用キャンバスに描画して最前面表示
// =====================
function drawFullMap() {
  _initFmCanvas();

  if (!fullMapOpen) {
    _fmCanvas.hidden = true;
    return;
  }
  _fmCanvas.hidden = false;
  const c = _fmCtx;
  c.clearRect(0, 0, CANVAS_W, CANVAS_H);

  const cellDraw = 12;
  const mapW  = GRID_SIZE * cellDraw;   // 51 × 12 = 612
  const mapH  = GRID_SIZE * cellDraw;
  const mapX0 = Math.floor((CANVAS_W - mapW) / 2);   // 194
  const mapY0 = Math.floor((CANVAS_H - mapH) / 2);   // 44

  // 暗転オーバーレイ
  c.fillStyle = 'rgba(0,0,0,0.82)';
  c.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // マップ全体を壁色で塗りつぶし
  c.fillStyle = '#445544';
  c.fillRect(mapX0, mapY0, mapW, mapH);

  // 通路セルを描画
  for (let gr = 0; gr < GRID_SIZE; gr++) {
    for (let gc = 0; gc < GRID_SIZE; gc++) {
      if (grid[gr][gc] !== 0) continue;
      const sx = mapX0 + gc * cellDraw;
      const sy = mapY0 + gr * cellDraw;
      c.fillStyle = '#111111';
      c.fillRect(sx, sy, cellDraw, cellDraw);
      const f = getFactionForCell(gr, gc);
      if (f) {
        c.fillStyle = f.color + '44';
        c.fillRect(sx, sy, cellDraw, cellDraw);
      }
    }
  }

  // ── 案A：ブロックグリッド + ホームマーカー ──
  {
    const homeSet = new Set(FACTION_HOME_BLOCKS.human.map(([r, cv]) => `${r},${cv}`));

    // 各ブロックのオーバーレイ
    for (let bR = 0; bR < 5; bR++) {
      for (let bC = 0; bC < 5; bC++) {
        const bx = mapX0 + BLOCK_COL_STARTS[bC] * cellDraw;
        const by = mapY0 + BLOCK_ROW_STARTS[bR] * cellDraw;
        const bw = (BLOCK_COL_ENDS[bC] - BLOCK_COL_STARTS[bC] + 1) * cellDraw;
        const bh = (BLOCK_ROW_ENDS[bR] - BLOCK_ROW_STARTS[bR] + 1) * cellDraw;

        const blockCr  = crystals.find(x => x.blockR === bR && x.blockC === bC);
        const owner    = blockCr ? blockCr.owner : 'neutral';
        const isValid  = blockCr ? blockCr.valid : false;
        const isHome   = homeSet.has(`${bR},${bC}`);

        // 人間族ブロックの有効/無効オーバーレイ
        if (owner === 'human') {
          if (isValid) {
            // 有効（連結済み）：明るい青オーバーレイ
            c.fillStyle = 'rgba(68, 136, 255, 0.22)';
            c.fillRect(bx, by, bw, bh);
          } else {
            // 無効（切断）：暗い青 + 斜線ハッチング + オレンジ点線枠
            c.fillStyle = 'rgba(30, 50, 100, 0.45)';
            c.fillRect(bx, by, bw, bh);
            c.save();
            c.beginPath(); c.rect(bx, by, bw, bh); c.clip();
            c.strokeStyle = 'rgba(80, 110, 180, 0.30)';
            c.lineWidth = 1;
            for (let d = -bh; d < bw + bh; d += 10) {
              c.beginPath();
              c.moveTo(bx + d,      by);
              c.lineTo(bx + d + bh, by + bh);
              c.stroke();
            }
            c.restore();
            c.strokeStyle = 'rgba(255, 140, 0, 0.65)';
            c.lineWidth = 1.5;
            c.setLineDash([4, 3]);
            c.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
            c.setLineDash([]);
          }
        }

        // ホームブロックの枠 + ★マーカー
        if (isHome) {
          if (owner === 'human') {
            // 所有中：青白枠
            c.strokeStyle = isValid ? 'rgba(160, 210, 255, 0.90)' : 'rgba(120, 170, 255, 0.70)';
            c.lineWidth = 2;
            c.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
          } else {
            // 敵に奪われた：赤枠
            c.strokeStyle = 'rgba(255, 60, 60, 0.90)';
            c.lineWidth = 2;
            c.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
          }
          // ★テキスト（左上隅）
          c.fillStyle    = owner === 'human' ? 'rgba(180, 220, 255, 1.0)' : 'rgba(255, 90, 90, 1.0)';
          c.font         = 'bold 11px monospace';
          c.textAlign    = 'left';
          c.textBaseline = 'top';
          c.fillText('★', bx + 3, by + 2);
        }
      }
    }

    // 5×5 ブロック境界線（薄い白）
    c.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    c.lineWidth   = 1;
    const blkTopY    = mapY0 + BLOCK_ROW_STARTS[0] * cellDraw;
    const blkBottomY = mapY0 + (BLOCK_ROW_ENDS[4] + 1) * cellDraw;
    const blkLeftX   = mapX0 + BLOCK_COL_STARTS[0] * cellDraw;
    const blkRightX  = mapX0 + (BLOCK_COL_ENDS[4] + 1) * cellDraw;
    for (let i = 0; i <= 5; i++) {
      const gc = i < 5 ? BLOCK_COL_STARTS[i] : BLOCK_COL_ENDS[4] + 1;
      const sx = mapX0 + gc * cellDraw;
      c.beginPath(); c.moveTo(sx, blkTopY); c.lineTo(sx, blkBottomY); c.stroke();
    }
    for (let i = 0; i <= 5; i++) {
      const gr = i < 5 ? BLOCK_ROW_STARTS[i] : BLOCK_ROW_ENDS[4] + 1;
      const sy = mapY0 + gr * cellDraw;
      c.beginPath(); c.moveTo(blkLeftX, sy); c.lineTo(blkRightX, sy); c.stroke();
    }
  }
  // ── ここまで A案 ──

  // クリスタル（三角形）
  for (const cr of crystals) {
    const sx = mapX0 + (cr.c + 0.5) * cellDraw;
    const sy = mapY0 + (cr.r + 0.5) * cellDraw;
    const f  = FACTIONS[cr.owner];
    const r  = 4.5;

    // 外縁（黒枠）
    c.beginPath();
    c.moveTo(sx,               sy - (r + 1.2));
    c.lineTo(sx + (r + 1.2) * 0.866, sy + (r + 1.2) * 0.5);
    c.lineTo(sx - (r + 1.2) * 0.866, sy + (r + 1.2) * 0.5);
    c.closePath();
    c.fillStyle = 'rgba(0,0,0,0.65)';
    c.fill();

    // 本体（陣営色）
    c.beginPath();
    c.moveTo(sx,           sy - r);
    c.lineTo(sx + r * 0.866, sy + r * 0.5);
    c.lineTo(sx - r * 0.866, sy + r * 0.5);
    c.closePath();
    c.fillStyle = f ? f.color : '#888888';
    c.fill();

    // 頂点ハイライト
    c.beginPath();
    c.arc(sx, sy - r * 0.5, r * 0.22, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fill();
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
    c.beginPath();
    c.arc(sx, sy, 4, 0, Math.PI * 2);
    c.fillStyle = fColor;
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.lineWidth = 1;
    c.stroke();
  }

  // プレイヤー: 方向線 → 白丸
  const psx = mapX0 + (player.pos.x / CELL_SIZE) * cellDraw;
  const psy = mapY0 + (player.pos.y / CELL_SIZE) * cellDraw;
  c.beginPath();
  c.moveTo(psx, psy);
  c.lineTo(
    psx + Math.cos(player.visualAngle) * cellDraw * 1.5,
    psy + Math.sin(player.visualAngle) * cellDraw * 1.5
  );
  c.strokeStyle = '#66bbff';
  c.lineWidth   = 2;
  c.stroke();
  c.beginPath();
  c.arc(psx, psy, 5.5, 0, Math.PI * 2);
  c.fillStyle   = '#ffffff';
  c.fill();
  c.strokeStyle = '#0066aa';
  c.lineWidth   = 2;
  c.stroke();

  // ヒントテキスト
  c.fillStyle     = 'rgba(255,255,255,0.8)';
  c.font          = 'bold 13px monospace';
  c.textAlign     = 'center';
  c.textBaseline  = 'bottom';
  c.fillText('全体マップ　[ M ] で閉じる', CANVAS_W / 2, mapY0 - 6);

  // 枠線
  c.strokeStyle = 'rgba(255,255,255,0.25)';
  c.lineWidth   = 1;
  c.strokeRect(mapX0, mapY0, mapW, mapH);
}
