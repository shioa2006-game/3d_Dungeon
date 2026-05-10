function updateOnCrystal() {
  const player = Game.state.player;
  const cr = Game.state.crystalAtCell[player.gridR][player.gridC];
  Game.state.onCrystal = (cr && cr.owner === 'human') ? cr : null;
}

// =====================
// クリスタル回復（Q キー）
// =====================
function healAtCrystal() {
  const onCrystal = Game.state.onCrystal;
  if (!onCrystal || Game.state.battleState || Game.state.shopItems || Game.flags.gameEnded) return;
  if (!onCrystal.valid) {
    logMessage('⚠️ 本拠地から切断されています', 'system');
    return;
  }
  const player = Game.state.player;
  const s   = playerStats();
  const old = player.hp;
  player.hp = Math.min(s.hp, player.hp + s.rec);
  const gained = Math.ceil(player.hp - old);
  GameLog.event('player_heal', {
    r: onCrystal.r, c: onCrystal.c,
    hpBefore: old, hpAfter: player.hp, hpMax: s.hp, recValue: s.rec,
  });
  logMessage(`💎 クリスタルで回復 +${gained} HP (${Math.ceil(player.hp)}/${s.hp})`, 'reward');
  triggerMonsterTurn(player.gridR, player.gridC);
}

// =====================
// ショップを開く（E キー）
// =====================
function openShop() {
  const player    = Game.state.player;
  const onCrystal = Game.state.onCrystal;
  if (!onCrystal || Game.state.battleState || Game.state.shopItems || Game.flags.gameEnded) return;
  if (!onCrystal.valid) {
    logMessage('⚠️ 本拠地から切断されています', 'system');
    return;
  }
  // ##19 計測7後の調整：所持中（装備中）アイテムをショップから除外
  const equippedNames = new Set(
    ['weapon', 'armor', 'accessory']
      .map(s => player.equip[s]?.name)
      .filter(Boolean)
  );
  const pool  = shuffle([...SHOP_POOL].filter(it => !equippedNames.has(it.name)));
  Game.state.shopItems        = pool.slice(0, SHOP_ROLL_N);
  Game.state.shopSelectedIdx  = 0;
  GameLog.event('shop_open', {
    r: onCrystal.r, c: onCrystal.c,
    lineup: Game.state.shopItems.map(it => ({
      slot: it.slot, name: it.name, price: it.price,
    })),
  });
  renderShop();
  document.getElementById('shop-modal').hidden = false;
  // ##19 計測7後の調整：開店ごとに1ターン消費（無限リロード抑制）
  triggerMonsterTurn(player.gridR, player.gridC);
}

function renderShop() {
  const player    = Game.state.player;
  const shopItems = Game.state.shopItems;
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
    const kbSel    = i === Game.state.shopSelectedIdx ? ' kb-selected' : '';
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
  const player = Game.state.player;
  const item = Game.state.shopItems?.[idx];
  if (!item) return;
  const existing = player.equip[item.slot];
  const sellBack = existing ? Math.floor(existing.price / 2) : 0;
  const net      = item.price - sellBack;
  if (player.gold < net) return;
  player.gold -= net;
  player.equip[item.slot] = item;
  const s = playerStats();
  if (player.hp > s.hp) player.hp = s.hp;
  GameLog.event('shop_purchase', {
    slot:        item.slot,
    name:        item.name,
    price:       item.price,
    soldBack:    existing ? { name: existing.name, price: sellBack } : null,
    netPrice:    net,
    goldAfter:   player.gold,
    bonus:       item.bonus ?? null,
  });
  logMessage(`🛒 ${item.name} 購入 (-${net}G)`, 'reward');
  closeShop();
  triggerMonsterTurn(player.gridR, player.gridC);
}

function closeShop() {
  Game.state.shopItems = null;
  document.getElementById('shop-modal').hidden = true;
}
