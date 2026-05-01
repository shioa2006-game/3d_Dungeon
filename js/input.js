const keys            = {};
const keysJustPressed = new Set();

window.addEventListener('keydown', e => {
  if (!keys[e.code]) keysJustPressed.add(e.code);
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code))
    e.preventDefault();

  // リセット確認ダイアログが開いている間は Y/N/Escape のみ受け付ける
  if (Game.flags.restartConfirmOpen) {
    if (e.code === 'KeyY' || e.code === 'Enter') { confirmRestart(); return; }
    if (e.code === 'KeyN' || e.code === 'Escape') { cancelRestartConfirm(); return; }
    return;  // 他のキーはすべて無視
  }

  if (e.code === 'KeyR' && !Game.state.battleState && !Game.state.shopItems) showRestartConfirm();
  if (e.code === 'KeyM') toggleFullMap();
  if (e.code === 'Escape' && Game.flags.fullMapOpen) toggleFullMap();
});

window.addEventListener('keyup', e => { keys[e.code] = false; });

function handleInput() {
  if (Game.flags.gameEnded) return;

  if (Game.state.shopItems) {
    _handleShopInput();
    return;
  }

  if (Game.state.battleState) {
    if (!Game.flags.monstersAnimating) _handleBattleInput();
    return;
  }

  const player = Game.state.player;
  if (player.moving || Game.flags.monstersAnimating) return;

  if (keysJustPressed.has('ArrowLeft')  || keysJustPressed.has('KeyA')) { startRotate(-1); return; }
  if (keysJustPressed.has('ArrowRight') || keysJustPressed.has('KeyD')) { startRotate( 1); return; }

  if (keys['KeyW'] || keys['ArrowUp'])   { startMove(player.facing); return; }
  if (keys['KeyS'] || keys['ArrowDown']) { startMove((player.facing + 2) % 4); return; }

  // Q/E: クリスタル上なら回復・ショップ、それ以外はストレーフ
  if (Game.state.onCrystal) {
    if (keysJustPressed.has('KeyQ')) { healAtCrystal(); return; }
    if (keysJustPressed.has('KeyE')) { openShop(); return; }
  } else {
    if (keys['KeyQ']) { startMove((player.facing + 3) % 4); return; }
    if (keys['KeyE']) { startMove((player.facing + 1) % 4); return; }
  }
}

function _handleShopInput() {
  const shopItems = Game.state.shopItems;
  if (!shopItems) return;
  if (keysJustPressed.has('ArrowUp')) {
    Game.state.shopSelectedIdx = Math.max(0, Game.state.shopSelectedIdx - 1);
    renderShop(); return;
  }
  if (keysJustPressed.has('ArrowDown')) {
    Game.state.shopSelectedIdx = Math.min(shopItems.length - 1, Game.state.shopSelectedIdx + 1);
    renderShop(); return;
  }
  if (keysJustPressed.has('Enter')) { buyItem(Game.state.shopSelectedIdx); return; }
  if (keysJustPressed.has('Escape')) { closeShop(); return; }
}

function _handleBattleInput() {
  const battleState = Game.state.battleState;
  if (!battleState) return;
  const live = battleState.enemies
    .map((e, i) => e.hp > 0 ? i : -1).filter(i => i >= 0);

  if (keysJustPressed.has('ArrowUp')) {
    if (live.length > 0) {
      const pos = live.indexOf(battleState.selectedTarget);
      battleState.selectedTarget = live[pos <= 0 ? live.length - 1 : pos - 1];
      renderBattle();
    }
    return;
  }
  if (keysJustPressed.has('ArrowDown')) {
    if (live.length > 0) {
      const pos = live.indexOf(battleState.selectedTarget);
      battleState.selectedTarget = live[pos < 0 || pos >= live.length - 1 ? 0 : pos + 1];
      renderBattle();
    }
    return;
  }
  if (keysJustPressed.has('ArrowLeft')) {
    battleState.selectedCommand = 0; renderBattle(); return;
  }
  if (keysJustPressed.has('ArrowRight')) {
    battleState.selectedCommand = 1; renderBattle(); return;
  }
  if (keysJustPressed.has('Enter') || keysJustPressed.has('Space')) {
    if (battleState.selectedCommand === 0) {
      if (battleState.selectedTarget !== null) battleAttack(battleState.selectedTarget);
    } else {
      battleFlee();
    }
  }
}
