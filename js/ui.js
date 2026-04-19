// =====================
// Drawing helpers（Canvas 描画ユーティリティ）
// =====================
function fillRect(x, y, w, h, r, g, b, a) {
  ctx.fillStyle = a !== undefined ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
  ctx.fillRect(x, y, w, h);
}

function strokeRect(x, y, w, h, r, g, b, lw) {
  ctx.strokeStyle = `rgb(${r},${g},${b})`;
  ctx.lineWidth = lw || 1;
  ctx.strokeRect(x, y, w, h);
}

function drawLine(x1, y1, x2, y2, r, g, b, a, width) {
  ctx.strokeStyle = a !== undefined ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
  ctx.lineWidth = width || 1;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function drawText(text, x, y, color, size, align, baseline) {
  ctx.fillStyle    = color    || '#aaa';
  ctx.font         = `${size || 14}px monospace`;
  ctx.textAlign    = align    || 'left';
  ctx.textBaseline = baseline || 'top';
  ctx.fillText(text, x, y);
}

// =====================
// UI パネル描画（Phase 9 で本実装に置換）
// =====================
function drawUIRight() {
  const R  = UI_RIGHT;
  fillRect(R.x, R.y, R.w, R.h, 25, 25, 30);
  strokeRect(R.x, R.y, R.w, R.h, 80, 80, 80, 2);

  const lh = 20;
  const tx = R.x + 16;
  let   ty = R.y + 14;

  drawText('[ Controls ]', tx, ty, '#ccc', 15); ty += lh + 4;
  drawText('W / ↑   : 前進',   tx, ty, '#999', 12); ty += lh;
  drawText('S / ↓   : 後退',   tx, ty, '#999', 12); ty += lh;
  drawText('A / ←   : 左回転', tx, ty, '#999', 12); ty += lh;
  drawText('D / →   : 右回転', tx, ty, '#999', 12); ty += lh;
  drawText('ホイール : 前後移動', tx, ty, '#999', 12); ty += lh;
  drawText('R       : 迷路再生成', tx, ty, '#999', 12); ty += lh + 10;

  // 陣営情報（Phase 9 で本実装）
  drawText('[ Factions ]', tx, ty, '#ccc', 15); ty += lh + 4;
  for (const [, f] of Object.entries(FACTIONS)) {
    if (!f.zone) continue;
    drawText(`■ ${f.name}`, tx, ty, f.color, 12); ty += lh;
  }
}

function drawUIBottom() {
  const R = UI_BOTTOM;
  fillRect(R.x, R.y, R.w, R.h, 20, 20, 25);
  strokeRect(R.x, R.y, R.w, R.h, 80, 80, 80, 2);
}
