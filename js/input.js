const keys            = {};
const keysJustPressed = new Set();

window.addEventListener('keydown', e => {
  if (!keys[e.code]) keysJustPressed.add(e.code);
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code))
    e.preventDefault();
  if (e.code === 'KeyR') newMaze();
  if (e.code === 'KeyM') toggleFullMap();
  if (e.code === 'Escape' && fullMapOpen) toggleFullMap();
});

window.addEventListener('keyup', e => { keys[e.code] = false; });

function handleInput() {
  if (player.moving || player.rotating || monstersAnimating) return;

  if (keysJustPressed.has('ArrowLeft')  || keysJustPressed.has('KeyA')) { startRotate(-1); return; }
  if (keysJustPressed.has('ArrowRight') || keysJustPressed.has('KeyD')) { startRotate( 1); return; }

  if (keys['KeyW'] || keys['ArrowUp'])   { startMove(player.facing); return; }
  if (keys['KeyS'] || keys['ArrowDown']) { startMove((player.facing + 2) % 4); return; }
  if (keys['KeyQ']) { startMove((player.facing + 3) % 4); return; }
  if (keys['KeyE']) { startMove((player.facing + 1) % 4); return; }
}
