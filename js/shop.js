let shopItems       = null;
let shopSelectedIdx = 0;
let onCrystal       = null;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function updateOnCrystal() {
  onCrystal = crystals.find(c =>
    c.r === player.gridR && c.c === player.gridC && c.owner === 'human'
  ) || null;
}

// =====================
// クリスタル回復（Q キー）
// =====================
function healAtCrystal() {
  if (!onCrystal || battleState || shopItems || gameEnded) return;
  const s   = playerStats();
  const old = player.hp;
  player.hp = Math.min(s.hp, player.hp + s.rec);
  const gained = Math.ceil(player.hp - old);
  logMessage(`💎 クリスタルで回復 +${gained} HP (${Math.ceil(player.hp)}/${s.hp})`);
  triggerMonsterTurn(player.gridR, player.gridC);
}

// =====================
// ショップを開く（E キー）
// =====================
function openShop() {
  if (!onCrystal || battleState || shopItems || gameEnded) return;
  const pool  = shuffle([...SHOP_POOL]);
  shopItems        = pool.slice(0, SHOP_ROLL_N);
  shopSelectedIdx  = 0;
  renderShop();
  document.getElementById('shop-modal').hidden = false;
}

function renderShop() {
  document.getElementById('shop-gold').textContent = player.gold;
  const html = shopItems.map((item, i) => {
    const existing = player.equip[item.slot];
    const sellBack = existing ? Math.floor(existing.price / 2) : 0;
    const net      = item.price - sellBack;
    const afford   = player.gold >= net;
    const mods     = [];
    if (item.mod.hp)  mods.push(`HP+${item.mod.hp}`);
    if (item.mod.atk) mods.push(`ATK+${item.mod.atk}`);
    if (item.mod.rec) mods.push(`REC+${item.mod.rec}`);
    if (item.mod.agi) mods.push(`AGI+${item.mod.agi}`);
    if (item.bonus) {
      for (const [race, m] of Object.entries(item.bonus))
        mods.push(`vs${FACTIONS[race].name}×${m}`);
    }
    const sellText = existing ? ` (${existing.name}を${sellBack}Gで買取)` : '';
    const kbSel    = i === shopSelectedIdx ? ' kb-selected' : '';
    return `<div class="shop-item${afford ? '' : ' cant-afford'}${kbSel}" ${afford ? `onclick="buyItem(${i})"` : ''}>
      <div>
        <div><span class="shop-slot">[${item.slot}]</span> ${item.name}</div>
        <div class="shop-effect">${mods.join(' / ')}${sellText}</div>
      </div>
      <div class="shop-price">${item.price}G${sellBack ? ` → 実質${net}G` : ''}</div>
    </div>`;
  }).join('');
  document.getElementById('shop-items').innerHTML = html;
}

function buyItem(idx) {
  const item = shopItems?.[idx];
  if (!item) return;
  const existing = player.equip[item.slot];
  const sellBack = existing ? Math.floor(existing.price / 2) : 0;
  const net      = item.price - sellBack;
  if (player.gold < net) return;
  player.gold -= net;
  player.equip[item.slot] = item;
  const s = playerStats();
  if (player.hp > s.hp) player.hp = s.hp;
  logMessage(`🛒 ${item.name} 購入 (-${net}G)`);
  closeShop();
  triggerMonsterTurn(player.gridR, player.gridC);
}

function closeShop() {
  shopItems = null;
  document.getElementById('shop-modal').hidden = true;
}
