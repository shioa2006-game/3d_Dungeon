# 実装ロードマップ

`playtest.html`（2D完成版）から `index.html`（3D版）への移植計画。
ゴールは **playtest.html のゲームを3Dで再現すること**。機能追加はしない。
各Phaseは**独立して動作確認可能な粒度**に分割してある。

---

## Phase 一覧

| # | タイトル | ゴール（動作確認できる状態） |
|---|---|---|
| 1 | ファイル分割と定数移植 | 現行3Dダンジョンが `js/` 配下の分割ファイルで動作。`config.js` に全定数が入る |
| 2 | マップ拡張と座標系整備 | 迷路サイズ51×51で3D探索可能。4陣営ゾーンがミニマップに色分け表示 |
| 3 | クリスタル配置と3D描画 | 4陣営＋中立クリスタルがマップに配置され、3D空間にスプライトで見える |
| 4 | 6種族スポーンと4方向スプライト | クリスタルから6種族がスポーンし、前後左右のスプライトで表示される |
| 5 | 種族AI（陣地争奪） | ユニットが他種族クリスタルを目指して移動・占領する。種族間戦闘も発生 |
| 6 | Wizardryバトル（プレイヤー＋味方NPC） | プレイヤーが敵に接触するとバトルモーダル発生。隣接8マスの人間族AIが味方参戦。戦う/逃げる/勝敗処理 |
| 7 | 自陣クリスタル機能 | Q=回復／E=ショップ（装備購入・スロット管理）実装 |
| 8 | 勝敗条件と死亡処理 | 全モンスタークリスタル封印で勝利／人間クリスタル全喪失で敗北／死亡時リスポーン |
| 9 | UI整備 | メッセージログ（底部）・勢力情報パネル（右側）・ターン数表示・プレイヤーステータス |
| 10 | バランス調整と磨き込み | スポーン間隔・ユニットパラメーター微調整。アニメーション・効果音など |

---

## Phase 詳細

### Phase 1 — ファイル分割と定数移植

**目的**：現在の `main.js` 単一ファイルを `js/` 配下に分割し、今後の機能追加を容易にする。

**作業内容**
- `js/config.js` に定数を集約
  - 既存3D定数（CANVAS_W, CANVAS_H, CELL_SIZE, MOVE_FRAMES, FACING_DIRS 等）
  - playtest.htmlから流用予定の定数プレースホルダ（FACTIONS, UNIT_DEFS, SHOP_POOL）
- `main.js` の各関数を責務ごとに分割
  - maze.js ← generateMaze, addLoops, gridToWalls, bfsPath
  - render3d.js ← castRays, drawView3D, drawSprites
  - minimap.js ← drawMinimap, drawCompass
  - player.js ← player state, startMove, startRotate, updatePlayer, markExplored
  - monsters.js ← 既存のWANDER/CHASE AI（後続Phaseで拡張）
  - ui.js ← drawUIRight, drawUIBottom（空枠でよい）
  - input.js ← keydown/keyup/wheel ハンドラ
  - main.js ← gameLoop のみ
- `index.html` の `<script src="main.js">` を12ファイル読み込みに差し替え

**完了条件**：現在と**完全に同じ動作**。機能追加は一切しない。

---

### Phase 2 — マップ拡張と座標系整備

**目的**：playtest相当の51×51マップに拡張し、4陣営のゾーンを可視化する。

**作業内容**
- `GRID_SIZE = 51` 固定（スライダー廃止）
- `LOOP_COUNT` は固定値（200相当）
- 底部UIからスライダー削除（メッセージログ枠に置換、中身はPhase 9）
- `FACTIONS.zone` をplaytestから移植（左上=人間、右上=ゴブリン、左下=リザード、右下=オーガ）
- ミニマップに陣営ゾーンを半透明色で重ね描き

**完了条件**：51×51の3Dダンジョンを探索でき、ミニマップに4陣営の陣地色が見える。

---

### Phase 3 — クリスタル配置と3D描画

**目的**：4陣営×3クリスタル＋中立クリスタルを配置し、3D空間で視認できるようにする。

**作業内容**
- `js/crystals.js` 作成
  - `initCrystals()` 移植（各ゾーンに3個、隣接ゾーンに2個、中央に8個）
- 3D描画：クリスタルをビルボードスプライトとして描画
  - `assets/crystals/crystal_[owner].png` を所有者に応じて切替
  - 深度バッファ対応（モンスタースプライトと同じ方式）
- ミニマップ：クリスタル位置を所有者色のドットで表示

**必要アセット**
- `assets/crystals/crystal_neutral.png`
- `assets/crystals/crystal_human.png`
- `assets/crystals/crystal_goblin.png`
- `assets/crystals/crystal_lizard.png`
- `assets/crystals/crystal_ogre.png`

**完了条件**：マップ各所にクリスタルが見え、所有者色で区別できる。プレイヤーが歩いて接近できる。

---

### Phase 4 — 6種族スポーンと4方向スプライト

**目的**：クリスタルからユニットがスポーンされ、前後左右のスプライトで描画される。

**作業内容**
- `js/monsters.js` に `makeUnit`, `trySpawnFromCrystal`, `updateCrystals` 移植
- UNIT_DEFS を config.js に追加（6種族のHP/ATK/spd）
- スポーン処理：ターン経過で種族ごとのクールダウンに従って生成
- 描画：モンスターの `facing` とプレイヤー相対方向から4方向スプライトを選択
  - 計算式：`angle = atan2(player.y - m.y, player.x - m.x) - facingAngles[m.facing]`
  - 正面/右/背面/左 の4象限に分類して画像選択
- 既存の前後2枚切替ロジック（`isPlayerInFrontHemisphere`）を4方向化

**必要アセット**（6種族 × 4方向 = 24枚）
- `assets/monsters/[race]_front.png`
- `assets/monsters/[race]_back.png`
- `assets/monsters/[race]_left.png`
- `assets/monsters/[race]_right.png`
- races: `human`, `elf`, `dwarf`, `goblin`, `lizard`, `ogre`

**完了条件**：クリスタルから時間経過で6種族のユニットがスポーンし、向きに応じて4方向の絵が切り替わる。

---

### Phase 5 — 種族AI（陣地争奪）

**目的**：ユニットが他種族クリスタルを目指し、接触すると占領。種族間戦闘も自動で起こる。

**作業内容**
- playtestの `updateUnits()` を移植
  - 目標クリスタル選択（ランダム荷重・距離ベース）
  - BFS経路追従
  - 低HP時の撤退＆回復ロジック
  - 他種族との同マス戦闘（AFFINITY_DEBUFF 適用）
  - 他種族クリスタル占領
- 既存の3D用 WANDER/CHASE AI は **プレイヤー発見時のみ** 発動する上位層として保持
  - 通常は陣地争奪AIで動き、プレイヤーを視認したら一時的にCHASE
  - プレイヤー見失い後は陣地争奪AIに復帰

**完了条件**：プレイヤーが動かなくても、ユニット同士が交戦しクリスタル占領が発生する。ミニマップ上で勢力図が動的に変化する。

---

### Phase 6 — Wizardryバトル（プレイヤー＋味方NPC）

**目的**：プレイヤーが敵ユニットと接触するとバトル画面が開き、ターン制コマンドで戦える。隣接8マスの人間族AIも味方として参戦する。

**作業内容**
- `js/battle.js` 作成
  - playtestの `startBattle`, `renderBattle`, `battleAttack`, `battleFlee`, `enemyBattleTurn`, `endBattle` 移植
- `startBattle` で参加ユニットを確定
  - **敵側**：接触した1体＋同種族で接触セルから隣接8マス以内（最大5体）
  - **味方側**：プレイヤー＋人間族AIでプレイヤーから隣接8マス以内（最大4体、計5体）
- `index.html` にバトル用モーダルHTML追加（playtestからコピー）
- `css/style.css` にバトル用スタイル追加
- `checkMonsterContact()` を `startBattle()` 呼び出しに接続
- キー操作：↑↓でターゲット、←→でコマンド、Enterで実行（3D移動キーと競合しないよう状態管理）
- 戦闘中も「世界時間」は進む（ターン制の裏でAI動く）
- `battleLocked` フラグでバトル中の参加ユニット移動を停止

**完了条件**：敵に接触するとバトルモーダル発生。自陣近くなら味方NPCが参戦。戦闘終了後、元の3Dビューに戻る。

---

### Phase 7 — 自陣クリスタル機能

**目的**：自陣クリスタル上でQ=回復／E=ショップを使える。

**作業内容**
- `js/shop.js` 作成
  - playtestの SHOP_POOL, openShop, buyItem 移植
- `healAtCrystal()` 移植
- プレイヤー装備スロット（weapon/armor/accessory）
- `playerStats()` / `playerAtkVs()` 移植
- ショップモーダルHTML/CSS追加
- 入力：クリスタル上でのみQ/E有効、ショップ中は↑↓Enter/Esc

**完了条件**：自陣クリスタルに立って Q で回復、E でショップを開き装備購入ができる。ステータスがサイドバーに反映される。

---

### Phase 8 — 勝敗条件と死亡処理

**目的**：ゲームの始まりと終わりを成立させる。

**作業内容**
- `checkWinLoss()` 移植
- `playerDeath()` 移植：最後の1拠点なら敵陥落→敗北、それ以外は自陣リスポーン（GOLD半減・HP全回復・装備維持）
- リザルト画面モーダル（VICTORY/DEFEAT）
- 全モンスタークリスタル封印で勝利、人間クリスタル全喪失で敗北

**完了条件**：勝利・敗北の両方が正しくトリガーされ、ゲームオーバー画面からリスタートできる。

---

### Phase 9 — UI整備

**目的**：情報を見やすく配置し、ゲーム進行が把握できる状態にする。

**作業内容**
- 底部UI領域（y=500, h=200）をメッセージログに変換
  - 戦闘結果、クリスタル占領、スポーン、勝敗の逐次表示
  - 直近10件程度を表示、古いものはフェードアウト
- 右側UI領域（y=260〜500）に以下を配置：
  - ターン数
  - プレイヤーステータス（HP/ATK/REC/AGI/GOLD）
  - 装備表示（3スロット）
  - 4陣営クリスタル数＆ユニット数
- ミニマップ：クリスタル表示に加え、プレイヤー位置・向きは既存維持

**完了条件**：ゲーム状態が一目で把握できる。メッセージログでバトル結果・勢力図変化が流れる。

---

### Phase 10 — バランス調整と磨き込み

**目的**：プレイテストして面白さを検証・調整する。

**作業内容**
- スポーン間隔・ユニットパラメーター微調整
- 逃走成功率バランス
- 装備プール価格調整
- 効果音・BGM（任意）
- タイトル画面・説明画面（任意）

**完了条件**：1プレイが締まりのある体験になる（10〜30分でクリア or 敗北）。

---

## 依存関係

```
Phase 1 ─→ Phase 2 ─→ Phase 3 ─→ Phase 4 ─→ Phase 5 ─┐
                                                    ├─→ Phase 8 ─→ Phase 9 ─→ Phase 10
                                Phase 6 ─→ Phase 7 ─┘
```

- Phase 5 と Phase 6 は独立しているので並行可能（ただし Phase 4 完了後）
- Phase 7/8 は Phase 6 に依存

---

## 進捗管理

各Phase完了時に：
1. `INDEX_SPEC.md` に実装済み機能として追記
2. 動作確認のスクリーンショット or 動画（任意）
3. 次Phaseで変更する定数・仕様があれば本ファイルを更新
