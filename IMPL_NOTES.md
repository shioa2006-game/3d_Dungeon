# IMPL_NOTES.md — 実装方針メモ

議論・検討の過程と決定事項を記録するメモ。
Claudeデスクトップからコード修正時の参照用。

> 各項目には優先度ラベルを付ける
> - **[即時]** 現在のPhaseで対応
> - **[Phase6開始前]** Phase 6 着手前に要議論
> - **[Phase6以降]** Phase 6 完了後に検討
> - **[Phase7開始前]** Phase 7 着手前に要議論
> - **[Phase10]** Phase 10 で対応
> - **[Phase10後]** 全Phase完了後に検討
> - **[手作業]** コード修正なし・素材/手動対応

---

## 1. ミニマップへのキャラクター表示

**ラベル：[完了]** | 議論日：2026-04-20 | 完了日：2026-04-26 | 起点：Phase 4実装時

### 現状

ミニマップ（部分表示）にはプレイヤー位置・クリスタル・陣地ゾーン色のみ表示。
ユニットの位置・状態は一切表示されていない。

### 決定事項

**ミニマップ（部分表示・常時表示）**
- 6種族のユニットをドット絵スプライトで表示
- 戦闘中のセルに赤オーバーレイ
- 同一セルに複数ユニットがいる場合はスプライト1体 ＋ 右上に数字バッジ

**全体マップ（ポップアップ）**
- `M` キーで表示、`Esc` で閉じる
- 同様のスプライト・赤オーバーレイ・数字バッジを表示

**スプライト仕様**
- 16×16ピクセルのドット絵（顔のみ）
- 6種族分（human, elf, dwarf, goblin, lizard, ogre）
- HP状態に応じて全体トーンをコードで切替（素材は1種族1パターンのみ）
  - HP > 50%：緑系トーン
  - HP 25〜50%：黄系トーン
  - HP < 25%：赤系トーン
- Phase 6 戦闘画面UIでも流用予定

### 必要アセット・実装メモ

- ドット絵定義：6種族 × 1パターン（16×16ピクセル配列、コード内に定義）
- パレット定義：3色（緑/黄/赤）をコードで制御（素材追加不要）
- `M` キー処理を `input.js` に追加
- 全体マップポップアップの描画処理を `minimap.js` に追加

### 実装結果

**計画との差異**
- スプライトサイズ：16×16 → **32×32** に変更（ユーザー作成素材が32×32だったため）
- HP色変化方式：HSLシフト → **背景色方式** に変更
  - 透明ピクセル（index 0）の背後に HP バケット色を敷く
  - HP > 50%：緑背景 `#1a5c1a` / HP 25〜50%：黄背景 `#7a6a00` / HP < 25%：赤背景 `#7a1a1a`
- 全体マップのユニット表示：スプライトではなく**陣営カラーの色丸**に変更（セルサイズ約12pxのため）
- ミニマップのプレイヤー：○（青丸）を **SPRITE_PLAYER** に置換、方向△は維持

**追加決定事項**
- 同一セル複数ユニットの代表：`monsters` 配列の先頭一致ユニットを表示
- 未探索エリアのユニットも表示する

**実装ファイル**
- `js/sprites.js`：`SPRITES` ルックアップ、`_spriteCache`（OffscreenCanvas、最大21枚）、`drawSpriteAt()` を追加
- `js/minimap.js`：`drawUnitsOnMinimap()`・`drawFullMap()`・`toggleFullMap()` を追加、プレイヤー描画を置換
- `js/input.js`：`M` キー（全体マップ開閉）・`Escape`（閉じる）を追加
- `js/main.js`：`drawFullMap()` をゲームループ末尾に追加

---

## 2. 種族ごとのスプライトサイズ調整

**ラベル：[完了]** | 議論日：2026-04-20 | 完了日：2026-04-26 | 起点：Phase 5実装時

### 現状

全種族が同じ `WALL_HEIGHT_CONST` で描画高さを計算しており、サイズが均一。
縦位置は画面中央センタリング（小さい種族が宙に浮いて見える）。

### 決定事項

**種族ごとの sizeScale を UNIT_DEFS に追加する**

| 種族 | sizeScale |
|---|---|
| goblin | 0.65 |
| dwarf | 0.85 |
| human | 1.0 |
| elf | 1.0 |
| lizard | 1.0 |
| ogre | 1.10 |

**縦位置を床面基準に変更する**
- 変更前：`spriteTop = R.h / 2 - spriteH / 2`（センタリング）
- 変更後：`spriteTop = floorY - spriteH`（床面アンカー）
- クリスタルの描画（`render3d.js` line 225）がすでに同方式のため参考にする

**実装箇所**
- `js/config.js`：UNIT_DEFS の各種族に `sizeScale` を追加
- `js/render3d.js`：`spriteH` 計算に `sizeScale` を乗算、`spriteTop` を床面基準に変更

### 実装結果

**計画との差異**
- ogre の sizeScale を 1.35 → **1.10** に修正（隣接マスで頭が見切れるため、2026-04-29 に調整）

**実装ファイル**
- `js/config.js`：`UNIT_DEFS` 各種族に `sizeScale` を追加
- `js/render3d.js`：line 178–184 を修正
  - `wallH = WALL_HEIGHT_CONST / corrDist`（クランプ前）で `floorY` を算出
  - `spriteH = clamp(wallH * scale, 0, R.h * 2)`（sizeScale 乗算）
  - `spriteTop = floorY - spriteH`（床面アンカー）
  - `scale` は `UNIT_DEFS[m.type]?.sizeScale ?? 1.0` でルックアップ（unit オブジェクトへのコピーは不要）

---

## 3. キャラクタースプライト共通仕様（ミニマップ・戦闘画面）

**ラベル：[完了]** | 議論日：2026-04-20 | 完了日：2026-04-26 | 起点：Phase 4実装時

### 現状

playtest.html の戦闘画面・ミニマップはともに絵文字ベースで画像素材はゼロ。
index.html には戦闘モーダル自体がまだ存在しない。

### 決定事項

**スプライト共有**
- ミニマップ（##1）と戦闘画面で同じドット絵を流用する
- 素材・パレット定義をコード内で一元管理し、両画面から参照する

**フォーマット**
- 16×16ピクセルの2次元インデックス配列（ユーザーが作成）
- インデックス：`0`=透明、`1〜4`=デザイン色（計5値）
- 通常状態は設計した色そのまま（緑に縛らない）

```javascript
// 定義例
const SPRITE_GOBLIN = [
  [0,0,1,1,1,1,0,0, ...],  // 16列
  // ... 16行
];
const PALETTE_GOBLIN = { 1:'#2d2d2d', 2:'#6abf4b', 3:'#4a8f30', 4:'#fff' };
```

**HP状態による色切替**
- 通常（HP > 50%）：PALETTEそのまま
- 中（HP 25〜50%）：HSLのHueを黄方向にシフトして自動生成
- 低（HP < 25%）：HSLのHueを赤方向にシフトして自動生成
- ユーザーは通常パレット（4色）のみ定義すればよい

**描画方法**
- Canvas上で1インデックス = 1矩形（`fillRect`）として描画
- ミニマップ：等倍（16×16）or 状況に応じて拡大
- 戦闘画面：2倍 or 3倍（UIレイアウト実装時に決定）

**必要スプライト（計7種）**
| 識別子 | 説明 |
|---|---|
| human | 人間族NPC |
| elf | エルフ族 |
| dwarf | ドワーフ族 |
| goblin | ゴブリン族 |
| lizard | リザード族 |
| ogre | オーガ族 |
| player | プレイヤー（NPC人間族とは別デザイン） |

### 実装メモ

- スプライト定義は `js/sprites.js` などに集約する
- 戦闘モーダルHTML/CSSは Phase 6 実装時に追加（`js/battle.js` + `css/style.css`）

---

## 4. Phase 6 戦闘シーン実装方針

**ラベル：[完了]** | 議論日：2026-04-27 | 完了日：2026-04-28 | 起点：Phase 5実装時

### 課題

ROADMAP.md に記載の「バトル（プレイヤー＋味方NPC）」については深く検討できていない。
Phase 6 開始前によく検討する。

### 決定事項

**バトル形式**
- playtest.html のバトル方式をそのまま移植する（ターン制、戦う/逃げる の2択コマンド）
- 参加ユニット
  - 敵側：接触した1体 ＋ 同種族で接触セルから隣接8マス以内（最大5体）
  - 味方側：プレイヤー ＋ 人間族AIでプレイヤーから隣接8マス以内（最大4体、計5体）

**プレイヤーステータス**
- Phase 6 で HP/ATK/REC/AGI/GOLD をすべて `player` オブジェクトに追加する
- playtest.html の初期値・計算式をそのまま流用
- 装備スロット（weapon/armor/accessory）は Phase 7 で追加

**世界時間の進行**
- バトル中も `processWorldTurn()` を毎ターン呼び出す（playtest.html と同様）
- `battleLocked` フラグでバトル参加中ユニットの移動を停止
- ワールドターン中に新たなユニットが隣接エリアに来た場合、バトルに追加参戦する
  （敵・味方ともに上限5体を超えない範囲で）

**バトルUI**
- バトル中は 3D ビュー領域をバトル UI に切り替える（右パネル・ミニマップは維持）
- `M` キーによる全体マップはバトル中も使用可能
- キー操作：バトル中は3D移動キーをバトルコマンドに転用
  - ↑↓でターゲット選択、←→でコマンド切替、Enter で実行

**実装ファイル（予定）**
- `js/battle.js`：startBattle / renderBattle / battleAttack / battleFlee / enemyBattleTurn / endBattle
- `js/player.js`：player オブジェクトに HP/ATK/REC/AGI/GOLD 追加、playerStats() / playerAtkVs() 実装
- `js/monsters.js`：checkMonsterContact() を startBattle() 呼び出しに接続
- `index.html`：バトル用 HTML 追加（3Dビュー領域に切替表示）
- `css/style.css`：バトル用スタイル追加

### 実装結果

**計画との差異**
- **バトルUI配置**：計画「3Dビュー領域を切り替え」→ 実装「Canvas の手前に `position: absolute` で `#battle-panel` をオーバーレイ（`hidden` 属性でトグル）」。Canvas は背面に維持されるため、戦闘中も描画ループは継続する
- **ワールドターン処理**：計画「`processWorldTurn()` を毎ターン呼び出す」→ 実装「`triggerMonsterTurn(playerGridR, playerGridC, true)` を直接呼び出し（`processWorldTurn` という関数名は存在しない）」
- **バトル中の追加参戦**：未実装。`startBattle()` 呼び出し時のみ参加者を確定し、その後の追加は行わない
- **`battleNeedsRerender` フラグ**：変数定義のみで未使用。`renderBattle()` を各アクション末尾で直接呼び出す方式に統一

**追加実装（計画外）**
- `playerDeath()` / `checkWinLoss()` / `showResult()` を `battle.js` に追加実装
- `#result-screen`（VICTORY / DEFEAT 終了画面）を `index.html` + `css/style.css` に追加
- キー操作：`←→` コマンド切替・`↑↓` ターゲット選択・`Enter/Space` 実行を `input.js` に追加（`battleState` 有無で処理分岐）
- `player.js` の `startMove()` に接触チェック：移動先に敵がいれば `triggerMonsterTurn()` → `startBattle()` を呼び出してバンプ起動

**実装ファイル**
- `js/battle.js`：`startBattle` / `renderBattle` / `_renderBattleSprites` / `selectBattleTarget` / `battleAttack` / `battleFlee` / `_enemyBattleTurn` / `_worldTurnForBattle` / `endBattle` / `playerDeath` / `checkWinLoss` / `showResult`、ボタンイベント登録
- `js/player.js`：`player` オブジェクトに `hp` / `gold` / `equip` 追加、`playerStats()` / `playerAtkVs()` / `spawnPlayerAtHome()` 追加、`startMove()` に接触バトル起動ロジック追加
- `js/config.js`：`PLAYER_INIT = { hp:40, atk:7, rec:5, agi:10 }` / `FLEE_BASE = 0.5` を追加
- `js/monsters.js`：`battleLocked` フラグを全ユニットに追加、`checkMonsterContact()` を `startBattle()` 呼び出しに接続
- `js/input.js`：バトルコマンドキー処理（`←→↑↓ Enter/Space`）を追加
- `index.html`：`#battle-panel`（敵リスト・味方リスト・プロンプト・ボタン・ログ）と `#result-screen` を追加
- `css/style.css`：`#battle-panel` / `.battle-unit` / `.battle-btn` / `#battle-prompt` / `#battle-log` / `#result-screen` のスタイルを追加

---

## 5. NPC からプレイヤーへのバトル仕掛け（アグロ実装）

**ラベル：[完了]** | 議論日：2026-04-29 | 完了日：2026-04-29 | 起点：Phase 6実装後

### 課題

Phase 6 実装時点では、バトル開始の条件が以下のように非対称だった。

| 対戦 | トリガー | 方式 |
|---|---|---|
| プレイヤー vs 敵 NPC | プレイヤーが敵マスに移動（バンプ） | ターン制バトル画面 |
| 敵 NPC vs 敵 NPC | 同一マス占有（毎ターン自動） | 即時ダメージ |

**敵 NPC がプレイヤーに対してバトルを仕掛けることができない**構造になっており、
プレイヤーが移動しない限り隣に敵がいても何も起きなかった。

### 検討した案

| 案 | 内容 | 評価 |
|---|---|---|
| 案1 | NPC が隣接マスへ移動した直後にバンプ攻撃 | 実装コスト低・既存 startBattle() をそのまま活用 |
| 案2 | NPC vs NPC と同様に同マス侵入で即時ダメージ | UI なしで一方的に削られる感がある |
| 案3 | 一定範囲でプレイヤーを検知・追跡（アグロ） | 予測と回避の余地があり最もフェア |
| 案4 | 隣接時に確率でバトル（奇襲） | ランダム性が理不尽に感じられる可能性 |

### 決定事項

**案1（隣接バンプ） ＋ 案3（アグロ）の組み合わせ** を採用。

- NPC はプレイヤーを検知範囲（aggroRange）以内に捉えると追跡を開始する
- 追跡移動の結果として隣接マスに入ったとき、バンプ攻撃でターン制バトルを起動する
- retreating / healing 中はアグロ無効（既存の逃走・回復ロジックを優先）

**NPC 間のアグロは保留**
NPC 同士にアグロを適用するとクリスタル占領（領土戦争）の優先度が崩れ、
境界で延々と消耗して膠着状態になるリスクがある。
まずプレイヤーへのアグロでゲーム感触を確認してから改めて検討する。

### 実装内容

**aggroRange の設計（陣営別の性格付け）**

| 陣営 | aggroRange | 意図 |
|---|---|---|
| ゴブリン | 1 | 狡猾・慎重。隣接マスのみ反応 |
| リザード | 2 | バランス型。2マス以内で追跡 |
| オーガ | 3 | 好戦的。3マス以内で積極追跡 |

**優先度ルール**
```
1. healing 中       → アグロ無効（クリスタルで回復優先）
2. retreating 中    → アグロ無効（逃走優先）
3. aggroRange 以内  → aggroed = true、BFS でプレイヤー方向へ優先移動
4. それ以外         → 通常の領土移動（クリスタル目標）
```

**発火タイミングの設計**
`pendingBumpCheck` フラグを導入し、プレイヤーとモンスター両方のアニメーションが
完了したタイミングで 1 回だけ `checkMonsterBumpPlayer()` を発火させる。
バトル中ターン（skipAnimation=true）では発火しない。

**実装ファイル**

- `js/config.js`：`UNIT_DEFS` の goblin / lizard / ogre に `aggroRange` を追加
- `js/monsters.js`
  - `makeUnit()` に `aggroed: false` フィールドを追加
  - `pendingBumpCheck` フラグを追加
  - `triggerMonsterTurn()` Step④ にアグロ判定と BFS 追跡移動ロジックを追加
  - `triggerMonsterTurn()` 末尾で `pendingBumpCheck = true`（skipAnimation=false 時のみ）
  - `checkMonsterBumpPlayer()` 関数を追加（aggroed かつ dist=1 の敵がいればバトル起動）
- `js/main.js`：ゲームループに `pendingBumpCheck` チェックを追加

---

## 6. 左右視点操作の挙動（回転アニメーション）

**ラベル：[完了]** | 議論日：2026-04-28 | 完了日：2026-04-29 | 起点：Phase 5実装時

### 課題

現状は左右キーで瞬時に3Dマップの表示が切り替わる。
切り替わり途中を描画した方が視覚的により面白くなるのでは？

> **補足（コード調査結果）**
> 現行コードには `ROT_FRAMES = 6`（≒100ms）のアニメーションがすでに存在する。
> ただし回転中は次の入力を受け付けないため（`input.js` の `player.rotating` ガード）、
> 連続回転するとその分だけ入力ラグが累積する。

### 決定事項

**スプリング（慣性）モデルを採用する。**

ゲームロジックの `facing`（衝突・バトル判定などに使用）はキー入力と同時に即時確定し、
描画専用の `visualAngle` が目標角度に向かってバネのように追従する方式。

```
// 毎フレーム呼び出し（updatePlayer 内）
const diff = normalizeAngle(targetAngle - player.visualAngle);
player.visualAngle += diff * ROT_SPRING_K;  // 例: ROT_SPRING_K = 0.25
```

**方針の詳細**

- `player.facing` / `player.angle` はこれまで通りキー入力で即時確定（ゲームロジックは変わらない）
- `player.visualAngle` フィールドを `player` オブジェクトに追加
- `render3d.js` のレンダリングパスで `player.angle` の代わりに `player.visualAngle` を参照
- スプライト・敵の可視判定なども `player.visualAngle` に統一
- 入力ロック（`player.rotating` ガード）は不要になるため除去
- `ROT_SPRING_K` を定数化し調整可能にする（推奨範囲 0.15〜0.4）

**メリット**
- 入力ラグゼロ：キビキビした操作感を損なわない
- レイキャスティングの中間角度を毎フレーム描画 → 慣性のある3D空間の動きが得られる
- 定数1つで硬さ・柔らかさを自由に調整できる

**実装予定ファイル**
- `js/config.js`：`ROT_SPRING_K` 定数を追加
- `js/player.js`：`player.visualAngle` フィールド追加、`updatePlayer()` にスプリング計算を追加、`startRotate()` を単純化（`rotating` フラグ廃止）
- `js/render3d.js`：角度参照を `player.visualAngle` に変更
- `js/input.js`：`player.rotating` によるガードを除去

### 実装結果

**計画との差異**
- **`player.rotating` ガードの扱い**：計画「除去」→ 実装「まず除去のみ行い、動作確認後にフィールドごと削除」という2段階で実施
- **ミニマップ方向表示も `visualAngle` に追従**：計画には明記なかったが、ミニマップの方向三角形・全体マップの方向線も `player.visualAngle` に統一（一貫性のため）

**実装ファイル**
- `js/config.js`：`ROT_SPRING_K = 0.1` を追加
- `js/player.js`
  - `player` オブジェクトに `visualAngle: FACING_ANGLES[1]` フィールドを追加
  - `startRotate(dir)` を簡略化：`player.facing` / `player.angle` を即時確定するのみ（`rotating` フラグをセットしない）
  - `updatePlayer()` の線形補間アニメーションブロックをスプリング計算に置き換え
    ```javascript
    const rotDiff = normalizeAngle(player.angle - player.visualAngle);
    player.visualAngle += rotDiff * ROT_SPRING_K;
    ```
  - `spawnPlayerAtHome()` でテレポート時に `player.visualAngle = player.angle` をスナップ
- `js/render3d.js`：`player.angle` → `player.visualAngle` に3箇所置換、`player.rotating` チェック（コンパス表示）を除去
- `js/minimap.js`：`player.angle` → `player.visualAngle` に8箇所置換
- `js/input.js`：`player.rotating ||` ガードを除去
- `js/main.js`：`player.rotating ||` ガードを除去、`newMaze()` で `player.visualAngle` をスナップ

**不要フィールドの削除（動作確認後）**
スプリング導入により以下のフィールドが完全に不要となったため削除：

| フィールド | 旧用途 |
|---|---|
| `player.rotating` | 回転アニメーション中フラグ・入力ガード用 |
| `player.angleFrom` | 回転開始角度（線形補間用） |
| `player.angleTo` | 回転目標角度（線形補間用） |
| `player.rotProgress` | 回転進捗（0〜1） |
| `player.pendingFacing` | 回転完了後に確定する向き |

削除後に `grep` で残存参照がゼロであることを確認済み。

---

## 7. キャラクター重なり時の描画方法

**ラベル：[完了]** | 議論日：2026-04-29 | 完了日：2026-04-29 | 起点：Phase 5実装時

### 課題

現状はキャラクターが同じマスにいた場合に、単純に重なって表示される。
どのような表現にするか検討が必要。

**現状の描画ルール（実装調査結果）**
- 全スプライトを距離の降順（遠→近）にZ-sortして順番に描画（`render3d.js`）
- 同一マスのユニットは `pos` がほぼ同じ → 距離もほぼ同じ → Z-sortが不安定
- 実質的に `monsters` 配列の後方ユニットが前方ユニットを上書きするだけで **1体にしか見えない**
- 移動アニメーション中は `pos` がわずかにずれるため、一瞬2体がちらつく場合がある

**同一マスになる主なケース**

| ケース | 頻度 | 持続時間 |
|---|---|---|
| 同陣営NPCが同じクリスタルを目指して重なる | 中 | 1〜数ターン |
| 異陣営NPCが交差・戦闘直前に重なる | 低 | 瞬間的（即ダメージ） |
| バトルロック中のNPCに別のNPCが重なる | 低 | バトル終了まで |

### 検討した案

| 案 | 概要 | 実装コスト | 近距離の自然さ |
|---|---|---|---|
| 案A | 横オフセット（左右にずらして並べる） | 低 | △（大きくずれる） |
| 案B | 縮小横並び（1/N サイズで横に並べる） | 低〜中 | △（小さくなる） |
| **案C** | **奥行きオフセット（前後にずらして重ねる）** | **低** | **◎** |
| 案D | 代表1体＋数字バッジ（ミニマップ方式） | 最低 | ◎ |

### 決定事項

**案C（奥行きオフセット）を採用する。**

同一マスに複数体いる場合、描画上の `corrDist` を体ごとに少しずつ手前にずらし、
スプライトが自然に前後に重なって見えるようにする。

```
1体目（最後方）: corrDist そのまま
2体目         : corrDist − δ（少し手前・やや大きく描画）
3体目         : corrDist − 2δ（さらに手前）
```

**採用理由**
- 遠近感を壊さず、全員が自然に見える
- δの値1つで見た目を調整できる
- 実装コストが低い（描画ループ前に同一マスグルーピングとindex付与を追加するだけ）

**実装方針**
- `drawSprites()` 内で `monsters` を `{gridR, gridC}` でグルーピングし、各ユニットに同一マス内インデックスを付与
- スプライト描画時に `corrDist -= SAME_CELL_DEPTH_OFFSET * index` を適用
- `SAME_CELL_DEPTH_OFFSET` は `config.js` に定数として追加（調整可能にする）
- depthBuffer との整合性のため、オフセット適用後の `corrDist` で壁オクルージョン判定も行う

**実装ファイル**
- `js/config.js`：`SAME_CELL_DEPTH_OFFSET` 定数を追加
- `js/render3d.js`：`drawSprites()` にグルーピングとオフセット処理を追加

---

## 8. クリスタル勢力圏の連結制限

**ラベル：[完了]** | 議論日：2026-04-27〜2026-04-29 | 完了日：2026-04-29 | 起点：Phase 6検討時

### 現状

スポーン・回復・ショップはクリスタルの所有者のみに依存しており、
自陣営本拠地との地理的な連結は考慮されていない。

### 課題

- 飛び地のクリスタルでもスポーン・回復・ショップが使えるため、戦線の概念が薄い
- 連結した勢力圏のみを「有効な陣地」とすることで戦略的な前線が生まれる

### 決定事項

#### マップのブロック分割

マップ全体を **5×5 = 25ブロック** に分割し、各ブロックに1クリスタルを配置する（計25個）。

**ブロックサイズ**（プレイ範囲 row/col 1〜49 = 49×49マス）

歪みを中央列・中央行に集約し、四隅の陣営ブロック（初期陣地）を完全均等にする。

- 列幅：10, 10, **9**, 10, 10（col 1〜10 / 11〜20 / 21〜29 / 30〜39 / 40〜49）
- 行高：10, 10, **9**, 10, 10（row 1〜10 / 11〜20 / 21〜29 / 30〜39 / 40〜49）

```
     ←─10─→ ←─10─→ ←─9→  ←─10─→ ←─10─→
  1 ┌───────┬───────┬──────┬───────┬───────┐
    │■  H  ■│■  H  ■│□ 中 □│■  G  ■│■  G  ■│ } 10
 11 ├───────┼───────┼──────┼───────┼───────┤
    │■  H  ■│□ 中  □│□ 中 □│□ 中  □│■  G  ■│ } 10
 21 ├───────┼───────┼──────┼───────┼───────┤
    │□ 中  □│□ 中  □│□ 中 □│□ 中  □│□ 中  □│ } 9  ← 歪みを中央に集約
 30 ├───────┼───────┼──────┼───────┼───────┤
    │■  L  ■│□ 中  □│□ 中 □│□ 中  □│■  O  ■│ } 10
 40 ├───────┼───────┼──────┼───────┼───────┤
    │■  L  ■│■  L  ■│□ 中 □│■  O  ■│■  O  ■│ } 10
 49 └───────┴───────┴──────┴───────┴───────┘
     col1    col11  col21  col30   col40
```

**ブロックサイズ内訳**

| 位置 | サイズ | 個数 |
|---|---|---|
| 四隅 2×2 エリア（陣営初期陣地） | 10×10 | 16個 |
| 中央列（col 21〜29）× 上下行 | 9×10 | 4個 |
| 中央行（row 21〜29）× 左右列 | 10×9 | 4個 |
| 中央交差点（col 21〜29, row 21〜29） | 9×9 | 1個 |

#### 初期陣地

各陣営はゲーム開始時に四隅の **L字3ブロック**（すべて10×10）を所有する。
残り **13ブロック** は中立スタート。

| 陣営 | 初期ブロック（行index, 列index） | 形状 |
|---|---|---|
| 人間族（左上） | (0,0), (0,1), (1,0) | L字 |
| ゴブリン（右上） | (0,4), (0,3), (1,4) | 逆L字 |
| リザード（左下） | (4,0), (4,1), (3,0) | L字 |
| オーガ（右下） | (4,4), (4,3), (3,4) | 逆L字 |

#### クリスタル配置

各ブロック内のランダムな通路セル（`grid[r][c] === 0`）に1個配置する。

#### 連結制限ルール

**連結の定義**
- 各ブロックを頂点、上下左右4方向の隣接ブロックをエッジとするグラフを構成する
- 自陣営の初期3ブロックのいずれかから、同一陣営ブロックを BFS でたどって到達できるクリスタルを「有効」とする
- クリスタル所有者が変わるたびに全陣営の連結判定を再計算する

**有効クリスタルのみ以下の機能を利用可能（全陣営に適用）**
- スポーン（AI ユニット生成）
- 回復（`healAtCrystal`）
- ショップ（`openShop`、プレイヤー利用）

**プレイヤーへのフィードバック**
- 飛び地クリスタルの見た目は通常の陣営色のまま（グレーアウトなし）
- 乗っても Q/E キーを受け付けない（キー無効のみ、ログ表示は任意）

**飛び地になったときの既存ユニットの扱い**
- スポーン済みのユニットはそのまま生き続ける（以後のスポーンが停止するだけ）
- 飛び地クリスタルへ撤退中のユニットは、別の有効なクリスタルへ転向する

#### AI の目標クリスタル選択の変更

現状（距離ベース加重ランダム）から以下に変更する：
- 自陣の有効クリスタルに上下左右4方向で隣接するブロックのクリスタルを優先選択
- 有効クリスタルに隣接する候補がない場合は従来の距離ベース選択にフォールバック

### 実装結果

**計画との差異**
- **`FACTIONS.zone` 削除**：旧来の固定矩形ゾーン定義（`zone: [r1,r2,c1,c2]`）は `FACTIONS` オブジェクトから削除。`minimap.js` の `getFactionForCell()` をブロック所有者ベースに書き直したため不要となった。`ui.js` で `f.zone` を使っていた `neutral` 除外ガードも `id === 'neutral'` に変更
- **`humanAutoSpawnIndex` リセット**：旧 `newMaze()` で明示的に `= 0` していたが、`initCrystals()` 内でリセットするよう統合
- **迷路再生成ヘルパー `generateMazeUntilValid()` 追加**：`initCrystals()` が `false` を返す（ブロック内に通路セルがゼロ）ケースに対応するため `main.js` に追加。通常は1回目で成功する

**追加決定事項（実装前の仕様確認 Q&A）**

| 質問 | 決定内容 |
|---|---|
| ブロック内に通路セルがゼロの場合 | 迷路を再生成（案C）。`initCrystals()` が `false` を返し、`generateMazeUntilValid()` がループで再試行 |
| ミニマップのゾーン表示 | ブロック単位の動的表示に変更。`getFactionForCell()` をクリスタル占領に連動するよう書き直し |
| ユニット上限の計算対象 | 所有クリスタル全体（連結問わず）のまま変更なし |
| プレイヤー復活先 | 有効クリスタルのみを対象とし、有効クリスタルがゼロの場合のみ全所有クリスタルにフォールバック |

**実装ファイル**
- `js/config.js`：`FACTIONS.zone` を削除。`BLOCK_COL_STARTS`・`BLOCK_COL_ENDS`・`BLOCK_ROW_STARTS`・`BLOCK_ROW_ENDS`・`BLOCK_INIT_OWNER`・`FACTION_HOME_BLOCKS` を追加
- `js/crystals.js`：`initCrystals()` をブロック分割方式に書き直し（失敗時 `false` 返却）。`updateCrystalConnectivity()` を新規追加。`trySpawnFromCrystal()` に `cr.valid` チェックを追加。各クリスタルに `blockR`・`blockC`・`valid` フィールドを追加
- `js/monsters.js`：`nearestFriendlyCrystal()` に `cr.valid` フィルタを追加。`randomEnemyCrystal()` に有効隣接ブロック優先ロジックを追加。NPC 占領後に `updateCrystalConnectivity()` 呼び出しを追加。退却先の有効チェック（`!m.retreatTarget.valid`）を追加
- `js/shop.js`：`healAtCrystal()` / `openShop()` に `cr.valid` チェックとログメッセージ（「本拠地から切断されています」）を追加
- `js/player.js`：`spawnPlayerAtHome()` を有効クリスタル優先に変更（フォールバックあり）。`checkCrystalClaim()` 後に `updateCrystalConnectivity()` 呼び出しを追加
- `js/minimap.js`：`getFactionForCell()` をブロック所有者ベースに書き直し（クリスタル占領でゾーン色が動的変化）。未使用の `cellToBlockIdx()` は削除
- `js/ui.js`：勢力情報表示ループの `neutral` 除外条件を `!f.zone` → `id === 'neutral'` に変更
- `js/main.js`：`generateMazeUntilValid()` を追加。初期化・`newMaze()` でこれを使用（`initCrystals()` の重複呼び出しを解消）

---

## 9. UI改善（メイン画面）

**ラベル：[完了]** | 議論日：2026-04-29 | 起点：Phase 6実装後

### 現状

**レイアウト（1000×700 Canvas）**
- VIEW3D `(0,0,740,500)`：3Dビュー＋コンパス
- MINIMAP `(740,0,260,260)`：7×7セルのプレイヤー追従ミニマップ
- UI_RIGHT `(740,260,260,240)`：メッセージログ（9件表示）
- UI_BOTTOM `(0,500,1000,200)`：左半分ステータス・装備、右半分勢力

**実装上の特徴**
- ミニマップ：壁色 RGB `(105,135,125)` と明るめ、陣営色オーバーレイは α≈0.33（`+'55'`）
- ログ：`logMessage(text)` は文字列1引数のみ、カテゴリ概念なし、重複まとめなし
- ステータス：HP は 14px、装備は `W:` `A:` `Ac:` の略表記
- 勢力欄：`Cr:03  U:5` の略表記でゲーム内の意味が伝わりにくい
- クリスタル上ヒント：`💎 クリスタル上 : Q = 回復   E = ショップ` の単一行テキスト

### 課題

- 右パネル（ミニマップ・ログ）が情報の主従なく並列で並んでおり、戦況把握ツールとして読みにくい
- ログは履歴表示としては機能するが、カテゴリ判別と次行動の判断材料にしにくい
- ステータスは情報階層がなく、HP の重要度が他のステータスと同じ視認性
- 勢力欄の `Cr` `U` 略語はゲーム概念（クリスタル占領・兵数）と直結しないため初見で意味不明

### 検討した案

提案を3グループに分け、優先度を付けて整理。詳細はチャット内議論を参照。

| グループ | 内容 | 採否 |
|---|---|---|
| A〜E（採用推奨） | ログ拡張・ミニマップ調色・ステータス階層化・勢力表記・アクションバー | 採用 |
| F・G（採用検討） | コンパス装飾控えめ化・3Dビュー枠上品化 | 今回スコープ外 |
| ゴシック装飾枠 | 参考画像の枠テクスチャ再現 | 却下（コスト過大・方針と矛盾） |

### 決定事項

#### A. ログにカテゴリタグ + 重複まとめ

- `logMessage(text, category)` に拡張する
- カテゴリは `'占領' | '戦闘' | '発見' | '報酬' | 'システム'` の5種
- 描画時：行頭に `【占領】` などの**文字バッジ**（アイコンは付けない）＋カテゴリ別の色でアクセント、本文は控えめなライトグレーに統一
- カテゴリ別アクセント色（暫定）

  | カテゴリ | 色 |
  |---|---|
  | 占領 | 陣営色相当の青系 `#66aaff` |
  | 戦闘 | 赤系 `#ff7766` |
  | 発見 | 黄系 `#ffcc66` |
  | 報酬 | 金系 `#ffd84a` |
  | システム | 灰系 `#aaaaaa` |

- **重複まとめ**：直前ログと本文一致のときのみ count を増やして `×3` を末尾に追加。間に別ログが挟まれた場合は別件扱い
- 既存の `logMessage(...)` 呼び出しを全件カテゴリ付きに更新（`crystals.js` / `monsters.js` / `battle.js` / `shop.js` / `player.js`）

#### B. ミニマップの壁色を暗く + 陣営色をやや強める

- 壁色 RGB `(105,135,125)` → `(45,55,52)` 程度に暗くする
- 陣営色オーバーレイの α を `+'55'`（≈0.33）→ `+'6e'`（≈0.43）程度に引き上げる
- 目的：地形情報よりも「誰が支配しているか・誰が動いているか」を強調する

#### C. ステータスの情報階層化

- HP 数値を **24〜28px** に拡大、HPバーは現状の長さ（200px前後）を維持しつつ高さを少し上げる
- ATK / REC / AGI / GOLD は HP の下に**小さめ横一列**（13px、間隔均等）
- 装備欄は `武器` / `防具` / `アクセサリ` の**3行縦並び**に統一、空欄は em dash `—`
- 略表記 `W:` `A:` `Ac:` は廃止

#### D. 勢力欄の表記を意味のある日本語に

- `Cr:03  U:5` → `結晶 3 / 8` ・ `兵数 5` の表記に変更
- **「兵数」は単純なユニット数**（既存 `un` 値そのまま、ラベルだけ変更）。HP合計などには変更しない
- セクションヘッダーに `解放進捗 NN%` を追加表示
  - 算出式：`自陣営（人間族）の有効クリスタル数 / 全クリスタル数 × 100`
  - 連結判定済みの `cr.valid && cr.owner === 'human'` を分子とする

#### E. クリスタル上のアクションバーをキーキャップ風に

- 現状：`💎 クリスタル上 : Q = 回復   E = ショップ`（単純なテキスト1行）
- 改善：`[Q] 回復` ・ `[E] ショップ` を**ボックス枠**で囲み、`Q` `E` のキーラベルは反転色（暗背景に明文字）で囲んだキーキャップ風にする
- 配置：左下ステータス枠の最下段、現状の黄色テキストの位置をそのまま流用

#### スコープ外（今回見送り）

- **F. コンパス装飾の控えめ化**：枠線・背景透明度・文字色の調整
- **G. 3Dビュー枠の上品化**：内側ベベル風2重線
- いずれも効果は中程度だが、A〜E と独立した装飾調整であり、A〜E 完了後にゲーム全体の見栄えを再評価して着手判断する

### 残課題（未決事項）

- ログの「文字バッジ」のフォーマット（`【占領】` か `[占領]` か `占領|` か）→ 実装時に視認性確認
- ミニマップの陣営色 α 値・壁色 RGB は実機確認しながら微調整する前提
- HP 数値フォントサイズの最終値（24px / 26px / 28px）は実装時にレイアウト確認

### 実装ファイル（予定）

- `js/ui.js`
  - `logMessage(text, category)` に第2引数追加、内部データ構造を `{ text, category, count }` に変更
  - `drawUIRight()` をカテゴリバッジ表示・色分け・重複まとめ表示に対応
  - `_drawUIStatus()` の HP 大型化、ATK/REC/AGI/GOLD 横一列、装備3行縦並び化
  - `_drawUIFactions()` の表記を `結晶 N / M`・`兵数 N` に変更、解放進捗ヘッダー追加
  - クリスタル上アクションバーをキーキャップ風に再描画
- `js/minimap.js`
  - `drawMinimap()` の壁色 RGB 変更、陣営オーバーレイ α 値変更
- `js/crystals.js` / `js/monsters.js` / `js/battle.js` / `js/shop.js` / `js/player.js`
  - 既存の `logMessage(...)` 呼び出しに第2引数（カテゴリ）を追加

---

## 10. UI改善（戦闘画面）

**ラベル：[完了]** | 議論日：2026-04-29 | 起点：Phase 6実装後

### 現状

**戦闘パネルの構造**
- `#battle-panel` は HTML overlay（`position: absolute`、z-index 10）で、3Dビュー領域 `740×500` のみを覆う
- 右側（ミニマップ・ログ）と下部（ステータス・勢力）は**戦闘中もそのまま見えている**（Canvas 描画ループは継続）
- パネル内構造：header → 敵/味方リスト2列 → プロンプト1行 → ボタン2個 → 戦闘ログ（90px）

**右ログとの関係**
- `UI_RIGHT` の `messageLog` はワールドターン由来のログ（占領・スポーン等）
- 戦闘パネル内の `#battle-log` は完全に別物（戦闘中の攻撃ダメージのみ）
- → 構造上は既に「戦闘ログ」と「外の戦況ログ」が分離されている

**選択状態の表現**
- 選択中の敵カード：赤枠（`#ff5555`）＋ 暗赤背景（`#2a0808`）＋ 名前末尾に `◀`
- プロンプト1行：`► オーガA を選択中　[⚔ 戦う]　←→コマンド / ↑↓ターゲット / Enter実行`
- コマンドボタン：`kb-selected` クラスで青系ハイライト

### 課題

**情報の不足（プレイヤーが頭で計算する必要がある）**
- 予測ダメージ表示なし（`playerAtkVs(target.type)` の結果がUIに出ていない）
- 相性デバフ表示なし（`AFFINITY_DEBUFF` の存在自体がUIに表れていない）
- 空きスロット表示なし（最大5対5の小隊戦であることが視覚化されていない）

**視認性の問題**
- ターゲット選択の視覚表現が弱い（赤枠＋背景のみ、矢印は名前末尾の小さな `◀`）
- 戦闘中に右ログのタイトルが `[ Message Log ]` のままで、「外の戦況」を見ているという文脈が伝わらない
- 非選択コマンドボタンが控えめでない（選択強調が相対的に弱い）

### 検討した案

| グループ | 内容 | 採否 |
|---|---|---|
| A〜E（採用推奨） | 空きスロット表示・ターゲット強化・行動情報欄追加・ログタイトル切替・ボタン強調 | 採用 |
| F-1（フッター化＋拡大） | 戦闘パネルを 1000×640 に拡大し細いフッターを新設 | 却下 |
| F-2（現状維持） | 740×500 のまま、下部 Canvas は通常画面と共通 | 採用 |

**F-1 却下の理由**
- 実装コスト大：`drawUIBottom()` を戦闘中分岐させる、または HTML フッターを新設する必要がある
- 既存の Canvas Status/Factions と HTML フッターで二重管理になる
- ##11 改善後の Status/Factions は戦闘中もそのまま意味を持つため、不要

### 決定事項

#### A. 5スロット固定表示（小隊戦らしさ）

- 敵5枠・味方5枠を**常に描画**する
- 未使用枠は**グレーの空白カード**（テキストなし、`opacity: 0.25` 程度のプレースホルダ）
- 死亡ユニットは現状通り `dead` クラス（line-through + 半透明）で残す
- カードサイズ・構造（顔アイコン位置、HP/ATK表示位置）は敵味方で統一
- プレイヤーカードは現状の青系ボーダー（`#335599`）を維持・強調

#### B. ターゲット選択の視覚強化

- **色味は現状の赤系を維持**（`border-color: #ff5555`、`background: #2a0808`）
- 選択カードに**外側矢印**を追加：`◀` を `position: absolute` で大きめに左外側へ配置
- 枠線にアニメーション付き発光を追加：`box-shadow: 0 0 8px rgba(255, 80, 80, 0.6)`
- 名前末尾の小さな `◀` は廃止（外側矢印に置換）

#### C. 行動情報欄の追加（機能追加）

- 戦闘パネル下部、ボタンの直前に**新たな1ブロック**を追加
- 4フィールド横並び表示：

  | 項目 | 内容 | データソース |
  |---|---|---|
  | 対象 | 例「オーガA」 | `battleState.enemies[selectedTarget]` |
  | コマンド | 「戦う」/「逃げる」 | `selectedCommand` |
  | 予測ダメージ | 例「7」 | `playerAtkVs(target.type)` |
  | 相性 | 「通常」 or 「相性不利 ×0.7」 | `AFFINITY_DEBUFF.has('human-{type}')` |

- **相性は2状態のみ**（`通常` / `相性不利 ×0.7`）。武器の種族ボーナス倍率（×1.8）は表示しない
- 「逃げる」選択時は予測ダメージ・相性は `—` 表示
- 既存のプロンプト1行 `► ... を選択中　[⚔ 戦う]　...` は廃止し、この行動情報欄に統合する

#### D. 右ログのタイトルを戦闘中だけ「外の戦況」に切替

- `drawUIRight()` 内で `battleState` の有無を判定して見出しを切り替える
- 通常時：`[ Message Log ]`（##11 で改修済み）
- 戦闘中：`[ 外の戦況 ]`
- ##11 のカテゴリタグ実装と同時に行えば追加コスト最小

#### E. コマンドボタンの選択強調強化

- 非選択ボタンに `opacity: 0.5` を適用
- 選択ボタンは現状の `.kb-selected`（青系背景・ボーダー・インナーシャドウ）を維持
- CSS の `.battle-btn:not(.kb-selected)` 1ルール追加で対応

#### F. 下部フッター化は**見送り**（現状維持）

- 戦闘パネルは 740×500 のまま
- 下部 Canvas（Status / Factions）は通常画面と共通の描画を維持
- ##11 改善（HP大型化・勢力日本語化・解放進捗）は戦闘中もそのまま有効
- 戦闘パネル拡大（1000×640 への変更）も行わない

### 残課題（未決事項）

- 行動情報欄の具体レイアウト（参考画像のように罫線付きグリッド型 or シンプルな1行）→ 実装時に視認性確認
- ターゲット発光アニメーションの周期（1.5秒 or 2秒、`@keyframes` で対応）→ 実装時に微調整
- 5スロット固定にした際の縦スクロール挙動（5枠固定なら縦スクロールは事実上不要）の最終確認

### 実装ファイル（予定）

- `js/battle.js`
  - `renderBattle()` を5スロット固定（敵・味方ともに5枠を `for (let i = 0; i < 5; i++)` で生成）に変更
  - 既存のプロンプト1行（`#battle-prompt`）の役割を行動情報欄に置き換え
  - 行動情報欄に予測ダメージ・相性を計算して表示するロジックを追加
- `index.html`
  - `#battle-prompt` を「行動情報欄」（`#battle-action-info`）として4フィールド構成に書き換え
- `css/style.css`
  - `.battle-unit.empty`（空きスロット用、`opacity: 0.25` のグレー）を追加
  - `.battle-unit.selected` に外側矢印（`::before` で `◀` を絶対配置）と発光アニメーションを追加
  - `.battle-btn:not(.kb-selected)` の `opacity: 0.5` を追加
  - `#battle-action-info` のスタイル追加
- `js/ui.js`
  - `drawUIRight()` の見出しを `battleState` 有無で切り替え（`[ Message Log ]` ↔ `[ 外の戦況 ]`）

---

## 11. リファクタリング Step A / B / C

**ラベル：[完了]** | 議論日：2026-05-01 | 完了日：2026-05-01 | 起点：全Phase完了後の保守性向上

### 現状（Before）

- ルート直下に死蔵化した `main.js`（34KB、`index.html` から未参照）
- `index.html` に `<style>` ブロックが残存（`style.css` と二重）
- `shuffle` が `crystals.js` の `shuffleArr` と `shop.js` の `shuffle` で重複定義
- HP色しきい値（`> 0.5 ? '#44cc44' : ...`）が `battle.js` × 2、`ui.js`、`sprites.js` に四重複
- 陣営RGB値が `ui.js` 内で `factionRGB` として `FACTIONS.color` と二重に直書き
- `crystals.find(...)` 線形探索が 7 箇所で頻出
- `getFactionForCell` がブロック判定で毎フレーム 5+5 回ループ
- `_drawUIFactions` が毎フレーム `crystals.filter` × 5回 / `monsters.filter` × 4回
- 全21個の可変グローバル変数が 7 ファイルに散在し、`battleState` だけで 71 箇所で参照
- 静的 HTML 要素に `onclick="closeShop()"` 等のインライン属性
- `castRays` が毎フレーム 1198 全壁を 300 レイ × 全件走査 + 配列を毎回 new

### 決定事項

3段階に分割し、各段階で動作確認のうえ次へ進む方針：

- **Step A（低リスク・即効性）**：死蔵削除・重複統合・インライン属性除去
- **Step B（構造改善）**：lookup テーブル化・関数の責務再配置・1パス集計化
- **Step C（描画最適化＋ドキュメント整合）**：壁の水平/垂直分割と方向半カット・バッファ再利用・README/JSDoc 整備

`Game` 名前空間化（Step B のうち最大規模、約200箇所の置換）はリスクが高いため Step B 内で独立タスクとして扱い、ユーザー確認のうえ実施。

### 実装結果

#### Step A
- ルート `main.js` 削除（34KB）
- `index.html` の `<style>` ブロックを `css/style.css` 冒頭へ統合
- `shuffle`（共通） / `hpColorFor(ratio)` / `hexToRgb(hex)` を `config.js` に集約
- `factionRGB` 直書きを `hexToRgb(FACTIONS[id].color)` に置換（単一情報源化）
- 静的 HTML 4ボタンの `onclick=` を `id` 化し `addEventListener` で `js/main.js` から登録

#### Step B
- `cellToBlock[r][c]`（起動時生成、O(1) ブロック逆引き）を `config.js` に追加
- `crystalAtCell[r][c]` / `crystalByBlock[bR][bC]` lookup を `crystals.js` に追加し、`initCrystals` 末尾で `rebuildCrystalLookups()` を呼ぶ
- `crystals.find(...)` 7 箇所を全廃 → lookup 経由に置換
- `drawCrystalsOnMinimap` を `crystals.js` → `minimap.js` へ移動（責務の単一化）
- `groupMonstersByCell()` ヘルパーを `minimap.js` に抽出（`drawUnitsOnMinimap` と `drawFullMap` の重複を排除）
- `_drawUIFactions` の filter 9回ループ → 1パス集計（`crystalsByOwner` / `monstersByFaction`）
- **Game 名前空間化**：21個の可変グローバルを `Game.state`（15）/ `Game.flags`（6）に集約
  - `js/state.js` を新規作成し `<script>` ロード順の 2 番目に配置
  - 全 11 ファイル × 約 200 箇所を `Game.state.X` / `Game.flags.X` 経由に置換
  - 旧グローバル（`monsters` / `battleState` / `gameEnded` 等）は完全に消滅（`typeof === 'undefined'` で確認）

#### Step C
- 壁を水平 `wallsH`（599）/ 垂直 `wallsV`（599）に分割（`a.y === b.y` / `a.x === b.x` で判定）
- `castRays` を方向別 2 ループに分け、レイ方向の符号で前方半分のみ走査
  - 水平壁は `sy = 0`、垂直壁は `sx = 0` が既知のため交差判定式も簡略化
  - **実測 2.09x 高速化**（旧 3.195ms → 新 1.526ms / 200 回平均）
- `_hitsBuffer` を固定長 RAY_COUNT で再利用、`_spritesBuffer` / `_cellCounter` / `_monsterCellIdx` も再利用（毎フレーム new せず in-place 更新）
- `README.md` を最新ファイル構成に更新（`state.js` / `css/style.css` 追加、責務を最新化、`Game.*` 参照規約セクション新設）
- `state.js` に **JSDoc typedef × 8 個**追加（Crystal / Monster / EquipItem / Player / BattleState / LogEntry / Wall）
- 主要関数（`makeUnit` / `triggerMonsterTurn` / `startBattle` / `drawSprites` / `initCrystals` / `rebuildCrystalLookups`）に JSDoc 追加

### 実装ファイル

#### 新規
- `js/state.js`：`Game = { state, flags }` 定義 + JSDoc typedef 群

#### 削除
- `main.js`（ルート直下、死蔵化）

#### 変更
- `index.html`：`<style>` 削除、`<script>` ロード順に `state.js` 追加、4 ボタンの `onclick=` を `id` 化
- `css/style.css`：ページ reset セクション追加
- `js/config.js`：`shuffle` / `hpColorFor` / `hexToRgb` / `cellToBlock` 追加
- `js/state.js`（新規）：上記
- `js/crystals.js`：`shuffleArr` 削除、lookup テーブル追加、`drawCrystalsOnMinimap` を minimap.js に移送、`Game.state.*` 化
- `js/player.js`：`Game.state.player` 初期化、全関数を `Game.state.*` 経由に
- `js/monsters.js`：`Game.state.monsters` / `Game.flags.monstersAnimating` 化、JSDoc 追加
- `js/battle.js`：`Game.state.battleState` 化、`hpColorFor` 利用、`crystalAtCell` 利用
- `js/shop.js`：重複 `shuffle` 削除、`Game.state.*` 化
- `js/ui.js`：`hpColorFor` / `hexToRgb` 利用、`factionRGB` 撤去、1パス集計、`Game.state.*` 化
- `js/minimap.js`：`drawCrystalsOnMinimap` / `groupMonstersByCell` を集約、高速化された `getFactionForCell`、`Game.state.*` / `Game.flags.fullMapOpen` 化
- `js/render3d.js`：`wallsH` / `wallsV` を使った半カット castRays、`_hitsBuffer` / `_spritesBuffer` 再利用
- `js/input.js`：`Game.state.*` / `Game.flags.*` 化
- `js/main.js`：`_setWalls` ヘルパー、`Game.*` 化、4 ボタンの `addEventListener` 登録
- `README.md` / `INDEX_SPEC.md`：ファイル構成・状態管理規約を最新化

### 計測

| 観点 | Before | After |
|---|---|---|
| 死蔵コード | 34 KB（root main.js） | 0 |
| `crystals.find()` 呼び出し | 7 箇所 | 0（O(1) lookup） |
| `_drawUIFactions` 毎フレーム filter | 9 回 | 1 回（1パス集計） |
| `castRays` 平均所要時間 | 3.195 ms | 1.526 ms（**2.09x**） |
| 散在グローバル変数 | 21 個（7ファイル） | 0（`Game.state` / `Game.flags` 集約） |
| HP色しきい値の重複 | 4 箇所 | 1 箇所（`hpColorFor`） |
| JSDoc typedef | 0 | 8 |

---

## 12. 3Dダンジョン探索体験の強化（ミニマップ依存からの脱却）

**ラベル：[完了]** | 議論日：2026-05-01〜2026-05-02 | 完了日：2026-05-02 | 起点：全Phase完了後の体験課題

### 課題

現状、プレイヤーは左の3Dビューよりも**右上のミニマップを見ながら**ゲームを進めてしまう傾向が強い。

ミニマップ（近傍7×7セル・霧なし）には以下の情報が高密度で集約されており、攻略判断に必要な情報がほぼ全てミニマップ側に揃っている：

- クリスタル位置・所有者色
- 敵・味方ユニットの種族別スプライト
- ブロック占有陣営色のリアルタイム反映（ミニマップ全面を陣営色で塗り分け）
- プレイヤー位置・向き

一方の3Dビューは、壁・床が単色で（`render3d.js` の固定色 `fillRect`）、ランドマークがクリスタルスプライト1枚のみ。**情報密度差が大きすぎて、ミニマップ監視がプレイ上の合理解になっている**。

### 設計方針

**3視点の役割分担を再設計する。**

| 視点 | 役割 | 持たせる情報 |
|---|---|---|
| 3Dビュー | 探索・索敵・発見・遭遇 | クリスタルの光・陣営エリアの空気感 |
| ミニマップ | 迷子防止と方角のみ | 地形・自分の位置と向き・近傍のクリスタル/NPC |
| Mキー全体マップ | 戦略・勢力図 | 全クリスタル所有者・ブロック占有色・全ユニット |

ミニマップを消すのではなく、**情報を絞ることで自然に3Dへ視線を戻す**設計。

### 検討した案と却下案

| 案 | 内容 | 採否 |
|---|---|---|
| 円内フィルタ | ミニマップ詳細情報をプレイヤー中心の円内のみ表示 | **採用** |
| 床占有色 | ブロック占有色をミニマップから廃止、3Dの床へ移植 | **採用** |
| クリスタル床グロー | クリスタル周辺の床に陣営色のグロー、角の先でも光が漏れる | **採用** |
| 天井柱 | クリスタルから空に向かって光柱を立てる | 却下（黒い天井の世界観を壊す） |
| HUD矢印（最寄りクリスタル） | コンパスに方向ヒント | 却下（誘導が強すぎる） |
| Tab長押しミニマップ | ミニマップを一時表示に変更 | 見送り（情報削減で十分） |
| 壁テクスチャの陣営別差分 | 陣営エリアごとに壁色を変える | 見送り（コスト過大、床塗りで代替） |
| 視野5×5化 | ミニマップ視野を縮小 | 不要（円内フィルタで代替） |
| 発見ステート管理 | 一度視界に入ったクリスタルのみミニマップ表示 | 不要（円内フィルタで代替・状態管理が増える） |

### 決定事項

3点を順番に実装する。

#### 提案1：ミニマップから「ブロック占有色」廃止 → 3Dマップの床に塗る

- ミニマップでの陣営色オーバーレイ（`minimap.js:167–171` の `getFactionForCell` ベース）を**廃止**する
- Mキー全体マップ側（`minimap.js:262–267`）には残す（戦略画面として機能）
- 3Dビューの床描画（`render3d.js:90` の単色1枚塗り）を**ピクセル単位**に変更し、各床ピクセルから逆算したワールド座標に該当するブロックの陣営色を α≈0.15 で乗せる
- 中立ブロックは塗らない（無彩色のまま、未占領感を残す）

#### 提案2：ミニマップに「プレイヤー中心の円」を導入

- 円外：迷路の地形のみ表示
- 円内：上記に加えてクリスタル・NPC を表示
- 円の半径はチェビシェフ距離 2（5×5相当）が初期値
- 円の境界1セル分はαフェードで自然に
- 円の輪郭をうっすら描画して「ここから外は見えない」ことをプレイヤーに伝える
- 実装：`drawCrystalsOnMinimap` / `drawUnitsOnMinimap` に距離フィルタを追加するだけ（状態管理なし）

#### 提案3：クリスタルの光の柱（床のグロー演出）

- 当初案の「天井に向かう光柱」は**黒い天井の世界観を壊すため却下**
- 採用案：**クリスタル位置を中心に床面の円形グロー**を陣営色で描画
- 角を曲がった先のクリスタルでも、床に光が漏れて視認できる（プロトタイプ画像で確認済み）
- 実装は床ピクセル処理に統合：床占有色と同じループの中で、各床ピクセルから最寄りクリスタルまでの距離に応じて陣営色を加算合成

| パラメータ | 推奨初期値 |
|---|---|
| グロー半径 | 1.5〜2.0 セル相当 |
| 中心の濃度 | α 0.55 |
| エッジの濃度 | α 0.0（2乗フォールオフ） |
| 床占有色の濃度 | α 0.15 |
| 合成方式 | 加算（複数クリスタル重複時は色が重なる） |
| 距離フォールオフ | 遠いほど薄く（自然な減衰） |

### 実装順

コスト軽 → 重 で進める。提案2と3は同じ床ピクセル処理インフラを共有するので、2 → 3 の順が効率的。

1. **円内フィルタ**（提案2）— 5〜10行の変更で済む。最初に体験差を確認
2. **クリスタル床グロー**（提案3）— 床ピクセル処理の基礎を作る
3. **床占有色**（提案1）— 上記処理に乗せるだけで完成

### 想定される懸念と対処

| 懸念 | 対処 |
|---|---|
| 床塗りで奥行き感が失われる | α を控えめに、グリッド境界の影や明度差は残す |
| 複数クリスタル光の重なりで色が飽和 | 加算合成 + 上限クランプ |
| 占有色とグロー色が違う陣営になる | グロー優先表示。占有色はそのまま（侵攻ストーリーが視覚化される） |
| グロー半径が広すぎてうるさい | 距離フォールオフを強めに、遠いクリスタルほど細く・薄く |
| 床ピクセル処理の負荷 | 740×250 ≒ 185k px。FOV 内のクリスタルだけ走査すれば十分軽量 |

### 実装ファイル（予定）

- `js/render3d.js`
  - `drawView3D()` の床描画（line 90 周辺）を**ピクセル単位**に変更
  - 床ピクセルから逆算した距離→ワールド座標→セル→ブロック→陣営色 / クリスタルグローを 1 ループで合成
- `js/minimap.js`
  - `getFactionForCell()` ベースのブロック占有色オーバーレイ（line 167–171）を**ミニマップ部分のみ**廃止（全体マップ側は残す)
  - `drawCrystalsOnMinimap()` / `drawUnitsOnMinimap()` にプレイヤーからのチェビシェフ距離フィルタを追加
- `js/config.js`
  - `MINIMAP_DETAIL_RADIUS`（円半径、初期値 2）
  - `FLOOR_FACTION_TINT_ALPHA`（床占有色 α、初期値 0.15）
  - `CRYSTAL_GLOW_RADIUS_CELLS`（グロー半径、初期値 2.0）
  - `CRYSTAL_GLOW_ALPHA_CENTER`（グロー中心α、初期値 0.55）

### 実装結果

予定通り Step 1 → 2 → 3 の順で実装。ユーザー検証フィードバックを受けた中間調整（Step 2 後の壁グロー追加・パラメータ強化）あり。

#### 計画との差異

**Step 2（クリスタル床グロー）：パラメータと範囲を中間調整**

最初の実装（半径2.0セル / 中心α 0.55 / 2乗フォールオフ）ではユーザー検証時に「中距離（3-5セル）でクリスタルが視認できているのに光が見えない」「壁が光らない」というフィードバックが発生。原因と対応：

| 問題 | 原因 | 対応 |
|---|---|---|
| 中距離でグロー消失 | `maxFloorDist` 距離フィルタが `fh-1`（最近床）基準でカメラから3セル超のクリスタルを誤って除外 | 距離フィルタを廃止、FOVコーンフィルタ（`asin(glowR/D)` マージン）のみに |
| 壁が照らされない | 床ピクセル処理しか実装していなかった | 壁描画ループ（300レイ）にも同じ計算を追加、α は床の70%（白飛び防止） |
| 全体的に暗い | 中心α 0.55 + 2乗フォールオフだと中央集中で外側が薄すぎ | 半径 2.0 → 3.0、中心α 0.55 → 0.65、フォールオフを線形に変更 |

**Step 3（床占有色）：パフォーマンス対策**

素直に `cellToBlock[r][c]` の2階層ルックアップを per-pixel で行ったところ 6.6ms → 11.2ms に悪化。対策として：

- セル → ブロック平坦インデックスの静的テーブル `cellBlockIdx`（`Uint8Array(GRID_SIZE²)`）を `config.js` に追加
- ブロック外セル用に sentinel スロット（index = 25）を確保し、`_blockTint*` を `Float32Array(26)` に拡張して常に 0
- ホットループの条件分岐を1段（範囲チェックのみ）に削減

→ 11.2ms → 9.3ms に短縮。

#### 採用パラメータ（最終値）

| 項目 | 当初設計 | 最終値 | 変更理由 |
|---|---|---|---|
| `MINIMAP_DETAIL_RADIUS` | 2 | 2 | そのまま |
| `CRYSTAL_GLOW_RADIUS_CELLS` | 2.0 | **3.0** | 中距離での視認性向上 |
| `CRYSTAL_GLOW_ALPHA_CENTER` | 0.55 | **0.65** | 同上 + 壁グローの強度に合わせる |
| グローのフォールオフ | 2乗（`t²`） | **線形（`t`）** | 中心集中ではなく halo 的に広く滲ませる |
| `CRYSTAL_GLOW_WALL_RATIO` | （未定義） | **0.7** | 壁グローを床より弱く（白飛び抑制） |
| `FLOOR_FACTION_TINT_ALPHA` | 0.15 | 0.15 | そのまま |

#### 追加実装（計画外）

- **円内フィルタの境界視覚化**（Step 1）: ミニマップ中央にプレイヤーから半径 `(R+0.5) * cellDraw` の点線円を描画（rgba(180,200,200,0.20)）。「ここから外は見えない」を直感的に伝える
- **詳細表示距離のαフェード**（Step 1）: 円の境界1セル分は `alpha = clamp(R+1 - cheb, 0, 1)` でフェード。プレイヤー移動アニメーション中の急なポップイン/アウトを防ぐ
- **`_glowsBuf` の Step 2 → 壁ループへの再利用**（Step 2拡張）: 床のクリスタル絞り込みを壁ループでも共有するため `_nGlows` をモジュール変数に昇格
- **ImageData バッファの再利用**（Step 2-3）: 毎フレーム `createImageData` せず初回のみ作成して使い回す
- **per-column ray キャッシュ**（Step 2）: `_rayCos` / `_raySin` / `_cosCorr`（`Float32Array(R.w)`）を毎フレーム冒頭で更新し、内側ループの `cos`/`sin` 呼び出しゼロに

#### 検証

ユーザー検証用のスクリーンショットは preview ツール側のタイムアウト不調により取得困難となったため、**ピクセル単位サンプリングで計算結果を直接検証**:

| 領域 | 期待 | 結果 RGB | 判定 |
|---|---|---|---|
| 人間領域の床 | base + #4488ff×0.15 | (30, 35, 48) | ✓ 計算と完全一致 |
| ゴブリン領域の床 | base + #44cc44×0.15 | (30, 46, 20) | ✓ 一致 |
| リザード領域の床 | base + #ff8844×0.15 | (58, 35, 20) | ✓ 一致 |
| オーガ領域の床 | base + #cc44cc×0.15 | (51, 25, 41) | ✓ 一致 |
| 中立領域の床 | base のみ（陣営色なし） | グロー寄与のみ | ✓ tint 0 |
| クリスタル付近の壁 | wall + 陣営色×α×0.7 | (108, 161, 197) vs base (86, 115, 105) | ✓ デルタ比が陣営色に対応 |

機能面も corridor 視点（角の先からのグロー漏れ）/ ミニマップ非表示 / Mキー全体マップ温存 を全件確認。

#### パフォーマンス計測（30回ループ平均、worst-case 11 グロー可視）

| 改修ポイント | drawFloor avg |
|---|---|
| Step 2 初期実装 | 10.18 ms |
| FOV コーンカリング追加 | 1.06 ms |
| Step 2 中間調整（半径3 / 線形 / α 0.65） | 6.6 ms |
| Step 3 床占有色（素直な実装） | 11.2 ms |
| `cellBlockIdx` flat lookup 最適化 | **9.3 ms** |

60fps 予算 16.67ms 内で他描画（castRays ≈ 4.5ms / drawView3D ≈ 5ms / drawSprites <1ms）と合わせて余裕あり。

#### 実装ファイル

- `js/config.js`
  - 新規定数: `MINIMAP_DETAIL_RADIUS = 2`、`CRYSTAL_GLOW_RADIUS_CELLS = 3.0`、`CRYSTAL_GLOW_ALPHA_CENTER = 0.65`、`CRYSTAL_GLOW_WALL_RATIO = 0.7`、`FLOOR_FACTION_TINT_ALPHA = 0.15`
  - 新規 lookup: `cellBlockIdx`（`Uint8Array(GRID_SIZE²)`、sentinel = 25）、`CELL_BLOCK_NONE`
- `js/render3d.js`
  - `drawFloor()` 関数を新規追加（ImageData ベースのピクセル単位床描画）
  - モジュール変数: `_floorImageData` / `_rayCos` / `_raySin` / `_cosCorr` / `_glowsBuf` / `_nGlows` / `_blockTintR/G/B`
  - `drawView3D()`: 床 fillRect → `drawFloor()` 呼び出しに置換
  - `drawView3D()` 壁ループに `_glowsBuf` を使ったクリスタルグロー加算ロジックを追加（壁RGBに `WALL_RATIO` 倍で加算）
- `js/minimap.js`
  - `drawCrystalsOnMinimap()`: チェビシェフ距離フィルタ + αフェード（`ctx.save/globalAlpha/restore`）
  - `drawUnitsOnMinimap()`: 同上、シグネチャに `pcx, pcy` 追加
  - `drawMinimap()`: 陣営色オーバーレイ（line 167–171）を削除、境界点線円（半径 `(R+0.5)*cellDraw`）を追加
- `IMPL_NOTES.md`、`INDEX_SPEC.md`: 完了状態に更新

#### ユーザー設計判断の振り返り

- **「天井柱」案を却下したのは正解**: 黒い天井の世界観は守られ、床面グローは物理的にも自然（光源 → 床面照射）。プロトタイプ画像と一致する見た目を実現
- **「3視点の役割分担を再設計する」フレーム**は実装の北極星として機能。各案の採否判断（Tab長押し見送り、視野5×5不要、発見ステート不要など）が一貫した
- **円内フィルタを最初に実装**したのは正解。最も軽い変更でミニマップの「過剰情報」が一気に解消され、Step 2-3 の効果を確認しやすい状態を作れた

---

## 13. ゲームプレイログ機能（バランス調整用 / `gamelog v1`）

**ラベル：[完了]** | 議論日：2026-05-02 | 実装完了：2026-05-02 | 起点：プレイヤー含む人間族が他種族に対して強すぎるためバランス調整を行うにあたり、原因を客観的に特定する材料を取得する目的

### 背景・目的

現状、プレイヤー操作を含めた人間族（human / elf / dwarf）がほぼ負けることがなく、ゲームバランスが崩れている。調整に着手するにあたり、以下を客観的に切り分けるためのログ機能を追加する。

- **A. プレイヤー本人の貢献**（プレイヤー操作によって人間族が勝っているのか）
- **B. 人間族AIの貢献**（人間族AIが単独で他種族AIに勝ち上がっているのか）
- **C. マクロな勢力推移**（クリスタル数・ユニット数の時系列）
- **D. セッションサマリ**（最終結果・所要ターン・kill 行列など）

これらが取れれば、「ユニットステータス（HP/ATK）」「スポーン間隔」「相性補正 ×0.7」「装備特攻 ×1.8」「プレイヤー初期パラメータ」のどれを調整すべきか、または機能修正が必要かを判断できる。

### 仕様

#### 出力

- **形式**：JSON（1ゲーム = 1ファイル）
- **ファイル名**：`gamelog_YYYYMMDD_HHMMSS_<result>.json`（例：`gamelog_20260502_153012_CLEAR.json`）
- **タイミング**：ゲーム終了時（CLEAR / GAMEOVER 確定時）に**自動でブラウザダウンロード**を発火
- **保存先**：ブラウザの既定ダウンロードフォルダ → ユーザーが手動で `logs/` へ移動
- **既存メッセージログ（`Game.state.messageLog`）とは独立**した分析専用ログとして実装する

#### モジュール構成（実装時の指針）

- 新規ファイル `js/gamelog.js` を追加し、グローバル `GameLog` オブジェクトを公開する
- API 案：
  - `GameLog.start()` — 新規ゲーム開始時に呼ぶ。セッション初期化＋`session_start` イベント記録。
  - `GameLog.event(type, payload)` — 各イベント記録ポイントから呼ぶ。
  - `GameLog.snapshot()` — `factionTimeline` 用のサンプリング(10ターン毎に呼ぶ)。
  - `GameLog.end(result)` — 終了時に呼ぶ。サマリ計算 → JSON 化 → ダウンロード発火。
- 各記録ポイント（占領・スポーン・戦闘・装備購入など）に `GameLog.event(...)` 呼び出しを差し込む

#### ファイル構造（トップレベル）

```jsonc
{
  "schemaVersion": 1,
  "sessionId": "uuid",
  "startedAt": "ISO8601",
  "endedAt":   "ISO8601",
  "result":    "CLEAR" | "GAMEOVER",
  "totalTurns": 1234,
  "config": {
    "gridSize": 51,
    "unitStats":          { "human": {hp,atk}, ... },
    "spawnIntervals":     { "human":10, ... },
    "compatibilityTable": [...],
    "playerInitial":      { "hp":40, "atk":7, "rec":5, "agi":10 }
  },
  "summary": { /* 後述 */ },
  "events":  [ /* 後述 */ ]
}
```

#### 集計済みサマリ（`summary`）

- `finalCrystalsByFaction`：終了時の各陣営クリスタル数
- `totalKills`：陣営別／種族別 kill 総数
- `killMatrix`：6×6 種族間 kill 行列（例：`"human→goblin": 12`）
- `playerStats`
  - `directKills`（プレイヤーがトドメを刺した数）
  - `directKillsByVictimRace`
  - `totalKillsAll`
  - `playerKillRatio = directKills / totalKillsAll` ← **プレイヤー貢献度の核**
  - `deaths`, `goldEarned`, `goldSpent`
  - `battlesWon`, `battlesEscaped`, `battlesLost`
  - `crystalsCapturedByPlayer`, `crystalsCapturedByHumanAI`
  - `finalEquip`
- `factionTimeline`：10ターン毎にサンプリングした各陣営のクリスタル数・ユニット数（events から再構築可能だが利便性のため同梱）

#### イベント種別（`events[]`）

すべてイベント駆動。すべてのイベントに `turn` フィールドを持つ。

| type | 主要フィールド | 量・備考 |
|---|---|---|
| `session_start` | 初期クリスタル配置・初期プレイヤー状態 | 1件 |
| `crystal_capture` | r, c, blockR, blockC, fromOwner, toOwner, capturer:{kind:"player"\|"unit", race?, faction?} | 占領のたび |
| `unit_spawn` | r, c, type, faction, factionUnitCount, factionUnitCap | スポーンのたび |
| `ai_battle_kill` | r, c, attackerType, defenderType, attackerFaction, defenderFaction, finalDamage, compatMul | **kill が発生したケースのみ記録**（軽量化） |
| `battle_start` | enemyRace, enemies[], allies[], playerHp, playerEquip | プレイヤー戦闘の入口 |
| `battle_kill` | attacker:{kind:"player"\|"ally", race}, victim:{race}, compatMul, equipBonusMul | プレイヤー戦闘内の kill のみ記録（**1攻撃ごとは記録しない**＝軽量化）|
| `battle_end` | outcome:"win"\|"escape"\|"lose", turnsElapsed, playerHpAfter, goldGained, killsByPlayer, killsByAlly | プレイヤー戦闘終了時 |
| `player_death` | r, c, killerType, killerFaction, goldLost | プレイヤー死亡時 |
| `player_heal` | r, c, hpBefore, hpAfter | Q キーで回復したとき |
| `shop_open` | lineup:[{slot,name,price}] | E キーでショップを開いたとき |
| `shop_purchase` | item, price, soldBack:{item,price}, goldAfter | 購入のたび |
| `timeline_snapshot` | factionCrystals:{...}, factionUnits:{...} | **10ターン毎**にサンプリング |

#### 軽量化の方針（決定事項）

- **AI 同士のバトル**：kill 発生時のみ記録（被弾だけのケースは省略）
- **プレイヤー戦闘の1攻撃ごとのログ**は取らず、**kill 発生時のみ** `battle_kill` として記録
- **`player_move` は記録しない**（移動は膨大かつ分析価値が低い）
- **迷路シードは記録しない**（再現性は今回スコープ外）

### 期待される分析の出口

ログから以下の指標を事後集計で算出し、調整方針を決める：

1. **プレイヤー貢献度**：`playerKillRatio` と `crystalsCapturedByPlayer / 人間族占領総数` から、プレイヤーを抜いた場合の人間族の強さを推定
2. **AI戦の種族別勝率行列**（`killMatrix`）：相性補正 ×0.7 が想定通りに機能しているか
3. **スポーン圧**：陣営ごとのスポーン累計と上限到達タイミング（`unit_spawn` イベント集計）
4. **戦闘所要ターン分布**：`battle_end.turnsElapsed` 中央値 → プレイヤーが瞬殺できているかで装備強度を判定
5. **特攻武器の寄与**：`battle_kill.equipBonusMul=1.8` の発動率と kill 寄与
6. **クリスタル支配時間**：`crystal_capture` から各陣営の累積支配ターンを再構築

### 想定される調整候補（ログ分析後）

- ユニットステータス調整（人間族3種の HP/ATK、特に dwarf の HP=40 やオーガ HP=52 のバランス）
- スポーン間隔調整（人間族 10 ターンが他陣営より過剰でないか）
- 相性補正値（×0.7 / ×1.0 のメリハリ）
- 装備特攻倍率（×1.8 が強すぎないか）
- プレイヤー初期パラメータ（HP=40, ATK=7, REC=5, AGI=10）
- 機能修正：味方参戦数上限（現状4体）、戦闘中の世界時間進行ペース、回復の制約付与など

### 実装順（実施済み）

1. `js/gamelog.js` 新規作成（モジュール骨格・API・JSON生成・ダウンロード処理）
2. `js/main.js` の `newMaze()` で `GameLog.start()` を呼ぶ
3. 各イベント発生箇所に `GameLog.event(...)` を差し込む
   - 占領：`crystals.js`
   - スポーン：`crystals.js` or `monsters.js`
   - AI戦闘kill：`monsters.js` / `battle.js`（バトル外戦闘）
   - プレイヤー戦闘：`battle.js`
   - プレイヤー死亡・回復・ショップ：`player.js` / `shop.js`
4. ターン進行ロジックに10ターン毎の `GameLog.snapshot()` 呼び出しを追加
5. ゲーム終了判定箇所で `GameLog.end(result)` を呼ぶ
6. 動作確認：1ゲームプレイして `logs/` 配下に妥当な JSON が出力されることを確認

> 実プレイによるバランス調整サイクルは [BALANCE_TUNING_LOG.md](BALANCE_TUNING_LOG.md) を参照。

---

## 14. 死亡スパイラル問題

**ラベル：[実装予定]** | 議論日：2026-05-03 | 起点：Iter 3 ログ分析（[BALANCE_TUNING_LOG.md](BALANCE_TUNING_LOG.md)）にて、装備喪失後に丸腰のまま連続死するパターンが死亡件数の46%を占めていたことを確認

### 背景・現象

死亡時に装備をランダム1個ロストする仕様（Iter 1 で導入）の副作用として、
装備をすべて失ったプレイヤーがリスポーン地点付近の敵に絡まれ、丸腰のまま
連続して死亡する「死亡スパイラル」が発生している。

#### Iter 3 で観測された典型ケース

- **ゲーム4 (GAMEOVER)**: ターン 705 で最後の装備（リザード特攻の槍）を喪失 → ターン 727〜791 の間に**丸腰のまま 12 連続死**（全てリザード）
- **ゲーム1 (GAMEOVER)**: オーガに 9 連続死亡（402〜626 ターン）
- **ゲーム3 (GAMEOVER)**: 終盤オーガに 7 連続死亡（617〜749 ターン）

総死亡 56 回中 26 回（**46%**）が「装備3スロット全空（丸腰）」状態での死亡。
一度装備を失うと、リスポーン地点に居座る敵から逃れられず、ATK 7・HP 40 の
丸腰プレイヤーでは挽回できない。

### 課題

- ゴールドが残っていてもショップに辿り着けず装備を再購入できない
- 拠点付近に強い敵（オーガ等）が居座ると即死ループに陥る
- ゲームバランス調整（モンスター HP/ATK 調整）では解消できない構造的問題
- 「死亡ペナルティ強化でプレイヤーを慎重にさせる」という Iter 1 の設計意図を超えて、ゲーム継続そのものを阻害している

#### 現行のリスポーン仕様の問題

現行の [`spawnPlayerAtHome()`](js/player.js#L73) は「死亡地点から最も近い人間族クリスタル」に復活するロジックのため、
敵に囲まれた地点で死亡 → 同じ敵に近接するクリスタルに復活 → 即再戦闘 → 再死亡 のループが起きる。

### 実装方針

#### 方針① リスポーン位置の固定化（本拠地優先）

**「死亡地点から最も近いクリスタル」 ではなく、「本拠地クリスタル → 本拠地から最も近い人間族クリスタル」 の順で復活先を決定する。**

復活ロジック（[`spawnPlayerAtHome()`](js/player.js#L73)）を以下に変更：

1. **本拠地クリスタル**＝ブロック (0, 0)（左上）に配置されたクリスタルを取得（`Game.state.crystalByBlock[0][0]`）
2. 本拠地が人間族保有 → そこに復活
3. 本拠地が他陣営に陥落 → 本拠地座標から**マンハッタン距離が最短**の人間族クリスタルに復活
4. 人間族クリスタルが1つもない場合は既存の `checkWinLoss()` で GAMEOVER

**Why:** 死亡地点近接の復活ループを断ち切り、地理的に距離を取って再出撃させる。
**How to apply:** ゲーム開始位置（セル `(1,1)` → 本拠地クリスタル）と一致するため、プレイヤーの戦況把握が常に「本拠地起点」で予測可能になる。

#### 方針② 復活待機ターン（10 ターン消費）

**死亡してから即復活せず、ワールドが10ターン進むのを待つ。** その間に敵が残りクリスタルを奪取して GAMEOVER 条件（人間族クリスタル0）が成立すれば、復活を打ち切って GAMEOVER。

##### 状態遷移

```
プレイヤー HP=0
  ↓
playerDeath() — 既存ペナルティ（ゴールド半減・装備ロスト）はそのまま発生
  ↓
復活待機状態へ突入：Game.state.respawnCountdown = 10
  ↓
1秒ごとに以下を繰り返し：
  - triggerMonsterTurn() / updateCrystals() を実行（ワールドターン進行）
  - respawnCountdown を 1 減算
  - checkWinLoss() で GAMEOVER 判定 → 該当なら即終了（カウント打ち切り）
  ↓
カウント0 → spawnPlayerAtHome()（方針① のロジック）で復活
  ↓
入力ロック解除
```

##### パラメータ（決定事項）

| 項目 | 値 | 備考 |
|---|---|---|
| 待機ターン数 | **10** | 仮設定。Iter 4 以降のバランス調整で変動の可能性あり |
| 1ターンあたり実時間 | **1 秒** | 10 秒で復活 |
| 早送り機能 | **なし** | プレイヤーは時間経過を待つしかない（ペナルティの一部） |
| 死亡中の入力 | **基本的にロック**（移動・戦闘・ショップ・回復は全て無効） |
| 例外：M キー | **有効**（全体マップ表示で戦況を確認可能） | 既存 `toggleFullMap()` をそのまま許容 |
| 死亡中に GAMEOVER 条件成立 | **即カウント打ち切り → GAMEOVER 表示** | `checkWinLoss()` を毎ターン呼ぶ |

##### UI 仕様

- 3D ビュー上に半透明オーバーレイ（暗転）
- 中央に大きく「**復活まで N**」を表示（毎ターン更新）
- ミニマップは通常通り表示し、戦況の悪化が視覚的に伝わるようにする
- M キーで全体マップを開けば、敵勢力がどこまで侵攻したかを確認できる

##### 既存ペナルティとの関係

- **ゴールド半減**：維持（既存仕様）
- **装備ロスト**：維持（Iter 1 で導入）
- **復活待機 10 ターン**：新規追加

3つを併存させる。「世界が10ターン進む間、プレイヤーは戦線に居ない」という時間的損失そのものが新たなペナルティになる。

### 実装影響範囲

| ファイル | 変更内容 |
|---|---|
| [`js/player.js`](js/player.js) | `spawnPlayerAtHome()` を本拠地優先ロジックに書き換え |
| [`js/battle.js`](js/battle.js) | `playerDeath()` 末尾で `spawnPlayerAtHome()` を直接呼ばず、`Game.state.respawnCountdown = 10` を設定 |
| [`js/main.js`](js/main.js) | アニメーションループに「復活待機の進行（1秒1ターン）」処理を追加。`Game.state.respawnCountdown` をフラグに `triggerMonsterTurn()` / `updateCrystals()` / `checkWinLoss()` を呼ぶ |
| `Game.state` | `respawnCountdown`（数値、0 なら通常状態）を追加 |
| `Game.flags` | 入力ロック判定に使う。既存の `gameEnded` / `monstersAnimating` と並列で扱う |
| `index.html` + CSS | 復活オーバーレイ用 DOM とスタイル追加 |
| 入力ハンドラ | 死亡中は M キーのみ通す。それ以外の操作は無効 |

### 期待効果

- 死亡地点近接の即死ループが断たれる（方針①）
- 詰み状態は10ターンの間に敵が残りクリスタルを奪い、自然に GAMEOVER（方針②）
- 「丸腰連続12回死」のような長時間の不愉快なプレイ時間が圧縮される
- 死亡コストが「ゴールド・装備・時間」の3軸で表現され、「死を恐れる」設計意図が強化される

### 検証

実装後、5戦して [`BALANCE_TUNING_LOG.md`](BALANCE_TUNING_LOG.md) Iter 4 として記録する。
特に以下を確認：

- 丸腰死亡件数が減少しているか（46% → 目標 20% 以下）
- 平均死亡数が減少しているか（11.2 → 目標 6 以下）
- 「復活待機 → 即 GAMEOVER」のシナリオが意図通り発生しているか
- プレイ感（10秒待ちが許容範囲か、UI が分かりやすいか）

### 検討して却下した代替案（参考）

| 案 | 内容 | 却下理由 |
|---|---|---|
| A. 最弱装備の無料支給 | 死亡時に鉄の剣等を支給 | 「敵に囲まれた状態」では装備があっても挽回困難 |
| B. リスポーン直後の数ターン無敵 | 復活直後数ターン戦闘不可 | 一時しのぎで本質的な詰み構造は変わらない |
| C. 装備ロスト発動条件の緩和 | 残装備1個なら発動しない等 | 死亡ペナルティ自体は維持したいので不採用 |
| D. 挽回不能の数値的判定 | 敵ユニット飽和＋人間族劣勢で即 GAMEOVER | 閾値設定が恣意的。方針②（10ターン消化）で同じ効果が自然に得られる |

---

## 15. ダンジョン生成アルゴリズム

**ラベル：[時期未定]** | 議論日：2026-04-20 | 起点：Phase 4実装時

### 現状

`index.html` はDFS + パターン駆動のループ追加で迷路を生成している。
GRID_SIZE=51、LOOP_COUNT=200 の固定パラメータ。
行き止まりは少ないが、廊下主体の構造になりやすく広い空間（部屋）は生まれない。

> playtest.html との実装差異の詳細は付録を参照

### 課題

- 現状では「廊下主体」の迷路になりやすく、広い空間（部屋）が生まれない
- 部屋状の空間を作る場合は別アルゴリズム（BSP分割、セルオートマトンなど）の検討が必要

### 決定事項

- **現状の実装（index.html方式）を維持する**
- 迷路形状の変更（部屋＋廊下構造など）は **Phase 10完了後に検討**
- Phase 10後の検討候補：
  - BSP（二分空間分割）で部屋を先に作り廊下でつなぐ
  - 現アルゴリズムに「部屋彫り」パスを追加する
  - LOOP_COUNT の調整で開放感を増す（低コスト案）

---

## 付録：playtest.html vs index.html ダンジョン生成の差異

| 項目 | playtest.html | index.html |
|------|------|------|
| 迷路生成 | 反復DFS（スタック）| 再帰DFS |
| 配列型 | Uint8Array | 通常のArray |
| ループ追加方式 | ランダム2000回試行 ＋ 3パスクリーンアップ | パターン駆動・単一パス |
| ループ品質 | 無効除去が混入しうる | 全除去が有効な分岐になる |
| マップ表現 | grid[r][c] = 0/1 をそのまま使用 | Segmentオブジェクト（始点・終点・RGB）に変換 |
| 経路探索 | BFS（Map + [r,c]タプル） | BFS（Set + {r,c}オブジェクト） |
| グリッドサイズ | 51×51 | 51×51 |
| ループ数 | 200 | 200 |
| クリスタル数 | 28 | 28 |

---

## 16. 装備入手方式の変更（ショップ → ガチャ）

**ラベル：[時期未定]** | 議論日：2026-04-20 | 起点：Phase 4実装時 | 方針変更：2026-04-27

### 現状

Phase 7 では playtest.html の `openShop` / `buyItem` をそのまま移植するショップ形式を採用する（方針を元に戻した）。

### 方針

**Phase 7 では playtest.html 通りのショップ実装を行う。ガチャへの変更は Phase 10 以降に改めて検討する。**

**Why:** まず playtest.html の再現を完成させることを優先し、バランス調整は全 Phase 完了後にまとめて行う方が整合が取りやすい。

**How to apply:** Phase 7 実装時はガチャ関連コードを書かず、`openShop` / `buyItem` / `SHOP_POOL` をそのまま移植する。

### ガチャ案（Phase 10 以降の検討候補）

- 金額3段階（低額／中額／高額）で確率が変わる抽選方式
- 排出物は装備品のみ（SHOP_POOL を確率テーブルに変換）
- 当選時：現在の装備と差し替えるか保持するかを選択できる
- 期待効果：運の要素・ゴールドの使いどころが生まれ戦略の幅が広がる

---

## 17. 3Dビューのリアル化（テクスチャ + 距離ライティング + スプライト陰影）

**ラベル：[完了]** | 議論日：2026-05-03 | 完了日：2026-05-03 | 起点：見た目の質感改善

### 課題

##12 でクリスタルグロー・床ティント・ミニマップ役割再設計が入って探索体験は改善したが、3Dビューの**素材感そのもの**は依然として Wolfenstein 風の単色 `fillRect` のまま。参考画像（リアル系ダンジョン）と比較して以下の差分が大きい：

- 壁・床・天井がベタ塗りで質感ゼロ
- 距離フォグが線形 `1 - d/500` で「奥行きの闇」が浅い
- 壁面の凹凸感がなく、廊下の角の立体感が出ない
- フォグ色が真っ黒で「松明の届かない暖かい闇」感がない
- スプライトが距離・光源に関係なく常にフル輝度で浮く

### 検討した案

| 案 | 内容 | 採否 |
|---|---|---|
| WebGL/Three.js 移行 | 真の3D・PBR・ノーマルマップが使える | **却下**（CLAUDE.md の「Canvas API」制約） |
| Canvas 2D + 段階的強化 | テクスチャ → ライティング → スプライト陰影の順で積み上げ | **採用** |

Canvas 2D の枠内で達成可能な範囲を5段階（Lv.1〜Lv.5）に整理：

| Lv | 内容 | コスト | 効果 |
|---|---|---|---|
| Lv.1 | テクスチャマッピング（壁/床/天井） | 中 | ★★★★ |
| Lv.2 | 距離ライティング | 低 | ★★★★ |
| Lv.3 | プレイヤー松明（ポイントライト） | 低 | ★★★ |
| Lv.4 | 壁面松明スプライト+フリッカー | 中 | ★★★ |
| Lv.5 | ビネット/ブルーム等ポストエフェクト | 中〜高 | ★★ |

今回は **Lv.1 + Lv.2 + スプライト環境光** までを実装。Lv.3 以降は別件で検討。

### 決定事項

#### A. テクスチャマッピング（Lv.1）

3枚の石造りテクスチャ（512×512 PNG、シームレスタイル）を導入：

| ファイル | サイズ | タイル | 用途 |
|---|---|---|---|
| `assets/textures/wall_stone.png` | 512×512 | 横シームレス | 壁（1セル＝CELL_SIZE=40 ワールド単位＝テクスチャ幅） |
| `assets/textures/floor_stone.png` | 512×512 | 4方向シームレス | 床 |
| `assets/textures/ceiling_stone.png` | 512×512 | 4方向シームレス | 天井 |

描画方式：

- **壁**: `drawImage(img, texX, 0, 1, texH, x0, y0, colW+0.5, wallH)` で**1px 列スライス**を縦方向にストレッチ。perspective-correct な texturing になる
- **床/天井**: per-pixel ImageData サンプリング。各ピクセルからワールド座標逆算 → `(wx * texPerCell) & mask` で UV ルックアップ
- **天井**: 床と対称（horizon 距離が同じピクセルは同じ corrDist）なので、1ループで両方の ImageData を埋める
- テクスチャ未ロード時は旧来の単色描画にフォールバック

#### B. 距離ライティング（Lv.2、4要素）

`render3d.js` 上部に定数ブロックを追加：

```js
const LIGHT_SCALE_FLOOR   = 160;
const LIGHT_SCALE_CEILING = 110;
const WALL_DIR_SHADE_V    = 0.60;
const FOG_R = 14, FOG_G = 9, FOG_B = 5;
```

| 要素 | 内容 |
|---|---|
| ① 指数フォールオフ | `shade = exp(-d / SCALE)` で線形フォグから置換 |
| ② 方向別シェーディング | 縦壁(E/W面)を `WALL_DIR_SHADE_V=0.6` 倍に減光（廊下の角に立体感） |
| ③ 環境光カラー | 黒オーバーレイ → **暗い暖茶色 (14,9,5)** に向けて減衰 |
| ④ 天井スケール分離 | 床=160, 天井=110 で天井がより速く闇に沈む（上方向の閉塞感） |

数値は当初 (250 / 180 / 0.82) で実装したが**変化が控えめすぎた**ため攻めの値 (160 / 110 / 0.60) に再調整。距離 200 で shade 0.45→0.29、距離 400 で 0.20→0.08 と差が顕著に。

#### C. クリスタルグローを天井にも適用

##12 のクリスタルグロー実装では床と壁にのみ加算していたが、**天井が照らされない違和感**がプレイテストで判明。

修正：床ループ内の glow 計算を**床/天井の共通計算ブロック**として外に出す。同じ `(wx, wy)` を使うため計算は1回で両方に流用、コスト増ゼロ。天井は壁と同じ `CRYSTAL_GLOW_WALL_RATIO=0.7` で減衰。

#### D. スプライトの環境光（モンスター・クリスタル）

スプライトが距離・光源と無関係にフル輝度で描画されており「遠景・近景・光源近く」のキャラクターが全て同じ明るさで浮く問題を解決。

**設計**：スプライトの世界座標で「環境光の総量」を計算し、その明るさで描画：

```
sprite_brightness = distShade + glowContribution
                  = exp(-dist/scale) + Σ(crystal_color * intensity at sprite pos)
```

| シチュエーション | 結果 |
|---|---|
| 遠景・光源なし | 暗いシルエット |
| 近景・光源なし | フル輝度 |
| 遠景・光源近く | その色で照らされて明るい（違和感なし） |
| 近景・光源近く | 着色強め |

クリスタル自身は光源そのものなので、距離減光のみ適用しグロー着色はスキップ。

### 実装で発見した落とし穴と対処

#### 落とし穴1：`source-atop` がスプライト周辺に四角い色枠

最初の実装では本キャンバスに直接 `source-atop` で色オーバーレイをかけたが、`source-atop` は「**既存の不透明ピクセル**に上書き」する仕様。スプライト周辺の壁/床も「既存の不透明ピクセル」なのでバウンディングボックス内が全部着色されてしまった。

**対処**：使い回しのオフスクリーンキャンバス（`_spriteTintCanvas`）を導入。

1. オフスクリーン（透明背景）にスプライトを描画
2. オフスクリーン上で `source-atop` 着色 → スプライト形状のみに作用
3. 結果を本キャンバスに drawImage（列単位、depthBuffer 占有判定維持）

#### 落とし穴2：`globalAlpha` 減光が「半透明」に見える

距離減光を `globalAlpha = distShade` で実装したところ、遠景キャラが**壁が透けて見える半透明状態**になった。物理的には「影の中のキャラ」は**暗いシルエット（不透明）**であるべき。

**対処**：`globalAlpha` を使わず、オフスクリーン上で `source-atop` + 黒オーバーレイ `rgba(0,0,0, 1-shade)` を載せる方式に変更。スプライト形状のみが暗くなり、不透明性は維持される。

#### 落とし穴3：遠景クリスタルが色付き四角ブロックに

クリスタルが光源として常に視認できるよう `CRYSTAL_DIST_SHADE_MIN = 0.5` で下限を設けていたが、遠景クリスタルが「**色付きの小さな四角**」として奇妙に表示された。クリスタル PNG のソリッド領域が縮小+半透明化された結果。

**対処**：下限を撤廃。クリスタルも普通にフェードアウトする。位置は床/壁に乗る環境光（グロー）で察知可能なので、ゲームプレイ上の問題なし。

### 実装結果

#### 変更ファイル

- `js/render3d.js`
  - 上部にテクスチャロード処理（`WALL_TEXTURE` / `FLOOR_TEXTURE` / `CEILING_TEXTURE`）と Lv.2 ライティング定数を追加
  - `drawFloor()` を per-pixel テクスチャサンプリング + 床/天井同時描画に書き換え
  - `drawView3D()` の壁描画を `drawImage` 列スライス + 距離フォグオーバーレイ + 方向別シェードに書き換え
  - `drawSprites()` にスプライト環境光（オフスクリーンキャンバス経由の減光+着色）を追加

#### アセット

- `assets/textures/wall_stone.png` 新規（412KB）
- `assets/textures/floor_stone.png` 新規（396KB）
- `assets/textures/ceiling_stone.png` 新規（339KB）

#### パラメータ最終値

| 定数 | 値 | 備考 |
|---|---|---|
| `LIGHT_SCALE_FLOOR` | 160 | 床/壁のフォグスケール |
| `LIGHT_SCALE_CEILING` | 110 | 天井のフォグスケール（より急峻） |
| `WALL_DIR_SHADE_V` | 0.60 | 縦壁の方向別減光係数 |
| `FOG_R, FOG_G, FOG_B` | 14, 9, 5 | 環境光カラー（暖茶の闇） |
| `SPRITE_GLOW_TINT_MAX` | 0.45 | スプライト着色の上限α |

#### 性能

- `drawView3D` ≈ 14ms/frame（70fps相当）。per-pixel 床/天井ループが支配的だが実用範囲
- スプライト着色のオフスクリーンキャンバスは1枚使い回し（リサイズのみ）でアロケーション最小

#### 仕様反映

`INDEX_SPEC.md` の `## 3Dビューの環境演出（##12 改修）` セクションに、本件の現状仕様（テクスチャ・距離ライティング・スプライト環境光）を追記する想定。アセット一覧にも `assets/textures/` 配下を追加。

---

## 18. 3Dビュー描画のパフォーマンス最適化（Web 配信時の体感対応）

**ラベル：[検討中]** | 議論日：2026-05-04 | 起点：##17 リッチ描画導入後の Web 配信検証

### 課題

##17 でテクスチャマッピング・距離ライティング・スプライト環境光を導入し、ビジュアルは大きく改善したが、配信環境による体感差が顕在化した。

#### 体感差

| 環境 | 動作感 |
|---|---|
| **ローカル PC** | サクサク動く（フレーム落ちを感じない） |
| **GitHub Pages 経由（Web）** | 処理のもたつきを感じる（移動・回転の引っかかり、戦闘UI の遅延感） |

#### 既知の負荷源

ローカル測定値（##17 完了時点）：

- `drawView3D` ≈ 14ms / frame
- `drawFloor`（床+天井 per-pixel ループ単独）≈ 19ms / call
- 60fps の予算（16.6ms）に対して**ローカルでも既にギリギリ**

per-pixel 処理量：

- 床+天井ループ：740 × 250 = 185,000 ピクセル × 2 = **37万ピクセル / frame**
- 各ピクセルで実行：`exp` 2回（床・天井別スケール）、テクスチャルックアップ 2回、陣営タイント 1回、グロー累積（視野内クリスタル数だけループ）、上限クランプ
- 壁：300 ray × 1px 列 `drawImage` + 距離フォグ `fillRect` = 600回 / frame
- スプライト：オフスクリーンキャンバス合成（モンスターごとに `drawImage` + `source-atop` 2 回）

#### 推測される「ローカル vs Web」の差分要因

1. **JIT 暖機の差**：ローカルは何度もリロードして JIT がホット。初回アクセスのユーザーは未最適化コードで実行
2. **ハードウェア差**：開発者の PC はハイエンドだが、Web 来訪者の PC スペック分布は広い
3. **アセット読み込みのオーバーヘッド**：Web では PNG デコードに時間がかかる（テクスチャ + キャラスプライト多数）
4. **ブラウザ間差**：Chrome 以外のブラウザで Canvas 2D 性能が劣る場合あり
5. **GitHub Pages の HTTP/2 multiplexing**：初回ロードの並列ダウンロード負荷で初期数フレームが重くなる

#### 維持すべき要件

ビジュアルの質は**できるだけ維持**したい：

- テクスチャは引き続き貼る（単色化はしない）
- 距離フォグ・方向別シェーディング・環境光カラーは維持
- クリスタルグロー（床/壁/天井/スプライト）は維持
- スプライトの距離減光・光源着色は維持

許容できる劣化：

- フレーム解像度の若干の低下（縮小+拡大による滲み）
- フォグの微妙な誤差（lookup table 化）
- 着色の段階化（連続値 → ビン分け）

### 検討すべき方向（次フェーズで具体化）

- 床/天井の**ハーフ解像度レンダリング**（per-pixel コスト 1/4）
- per-row 計算の**事前計算**（同じ y のピクセルで `corrDist` などを共有）
- スプライトのオフスクリーン**キャッシュ化**（type × HP × shade ビンで再利用）
- グロー寄与の**事前計算テーブル化**または**フレームスキップ**
- `exp()` の**lookup table 化**
- アセット**プリロード**と読み込み完了までタイトル画面で隠す
- 動的な **dirty rect 描画**（プレイヤー停止中は再描画しない）

### 実装方針

未定。本セクションに続けて分析と決定事項を追記する想定。

---

## 19. NPC 同士のアグロシステム（人間族含む全陣営）

**ラベル：[完了]** | 議論日：2026-05-09 | 完了日：2026-05-10 | 起点：ゲームAI調整・人間族の弱さ分析

### 課題

##5 でプレイヤーへのアグロは実装済みだが、NPC 間のアグロは「境界で消耗して膠着するリスク」を理由に保留していた。

その後の運用で人間族（プレイヤー陣営の AI ユニット）が他陣営に比べて弱いことが顕在化。原因を分析した結果、構造的な要因が2点判明した。

1. **人間族には `aggroRange` が定義されていない**（[config.js:139-141](js/config.js:139)）。
   `monsters.js:315` でも `m.faction !== 'human'` が明示的に除外されており、人間族は能動的な追跡を一切行わない。
2. **そもそも NPC 間のアグロが存在しない**（##5 の保留事項）。
   攻撃 AI の対象は `pDestR, pDestC`（プレイヤー）のみ。射程持ち陣営（ゴブリン1・リザード2・オーガ3）も互いを追跡せず、AI 同士の戦闘は「同一マス偶発遭遇」「スワップ衝突」だけで起きるため発生頻度が低い。

結果として、射程持ちが**プレイヤー（人間族の本体）を一方的に殴れる**一方、人間族 NPC は領土 AI でクリスタルへ向かう道中の偶発戦闘に頼るしかなく、戦力比で押される。

### 決定事項

**全陣営（人間族含む）に NPC 間アグロを導入する。**

#### 種族別 `aggroRange`（NPC 間アグロでも同じ値を流用）

| 種族 | aggroRange | 備考 |
|---|---|---|
| human | 2 | 新規 |
| elf | 2 | 新規 |
| dwarf | 1 | 新規（重装＝近距離寄り） |
| goblin | 1 | 既存（##5） |
| lizard | 2 | 既存（##5） |
| ogre | 3 | 既存（##5） |

#### 対象選定

射程内に複数の異陣営 NPC がいる場合は **最も近い敵**（マンハッタン距離）を追跡対象とする。同距離が複数ある場合は配列順での最初の1体（実装が単純で挙動が読みやすい）。相性倍率や HP は考慮しない。

#### プレイヤーアグロとの優先順位

ゴブリン・リザード・オーガがプレイヤーと敵 NPC を**同時に**射程内に検出した場合、**マンハッタン距離が近い方を優先**する。同距離ならプレイヤー優先（既存挙動の踏襲）。

#### 退却中・回復中の挙動

`retreating === true` または `healing === true` の NPC は NPC 間アグロも発動しない（##5 のプレイヤーアグロと同じルール）。

#### 隣接バンプ攻撃（NPC 間）

アグロ中の NPC が敵 NPC の**隣接マス**に到達した時点で、強制的に敵 NPC のマスに踏み込んで戦闘を発生させる。これにより「追跡したのに同マスに踏めず空振り」を防ぎ、戦闘発生頻度を確保する。

NPC 間戦闘は ##5 のプレイヤーバンプと違い**ターン制バトル画面を起動しない**（既存の同マス即時ダメージ処理 [monsters.js:274-294](js/monsters.js:274) を流用）。

### 実装方針（実装前メモ）

- `UNIT_DEFS` の human / elf / dwarf に `aggroRange` を追加（[config.js:139-141](js/config.js:139)）
- `monsters.js:315` の `m.faction !== 'human'` 除外を撤去
- `triggerMonsterTurn()` Step④ のアグロ判定を拡張：
  - プレイヤーまでの距離 `distP` と、最も近い異陣営 NPC までの距離 `distN` を算出
  - 両方が射程内なら近い方を追跡対象に設定（距離同値はプレイヤー優先）
  - NPC 追跡時は `bfsPath` で1歩前進、隣接到達時は同マスに踏み込む経路を採用
- `aggroed` フラグはプレイヤーアグロ用と兼用するか、NPC 用フラグを別途用意するか実装時に判断（既存の `checkMonsterBumpPlayer` がプレイヤー隣接時のみ発火する仕様なので、フラグ意味の混在は要注意）
- 仕様反映：実装後に `INDEX_SPEC.md` のアグロ仕様セクションに人間族の射程と NPC 間アグロを追記

### 懸念と監視ポイント

##5 で挙げられた「境界での消耗膠着」リスクは依然として存在する。実装後にプレイテストで以下を確認：

- AI 同士の戦闘が増えすぎてクリスタル占領が止まらないか
- 人間族の戦力比が他陣営に追いつくか（`gamelog` の `ai_battle_kill` 件数で陣営別の戦果を比較）
- プレイヤーが射程持ちに襲われる頻度が変わらないか（NPC 同士で潰し合って減る可能性あり）

問題が出た場合は `aggroRange` の値や優先順位ルールを再調整する。

### 計測1回目の結果と射程フラット化（2026-05-09）

初回設定（human=2 / elf=2 / dwarf=1 / goblin=1 / lizard=2 / ogre=3）でユーザーが5ゲーム実施。`logs/gamelog_20260509_17*.json` を解析した結果:

| 陣営 | 累計 K/D | 備考 |
|---|---:|---|
| human | 0.80 | ##19 前は ATK ほぼ0 → 528キル達成。意図通りアグロ発動 |
| goblin | 0.67 | 個体K/Dは劣勢だがスポーン総数 1183 で人海戦術 |
| lizard | 1.12 | バランス型 |
| ogre | **2.53** | 突出。174156試合では K/D 6.55 で支配 |

5試合の最終勝者は human=1(CLEAR) / goblin=2 / lizard=1 / ogre=1 で人間族は依然不利。人間族のサブ種族別キル数は `human:111 / elf:219 / dwarf:198` で、射程2の elf/human が射程1の dwarf より明確に多く、**射程の差が戦果に直結している**ことが裏付けられた。

#### 決定: 全種族 `aggroRange = 2` に統一

理由は「射程を変数から外して、HP・atk・スポーン頻度のどこに本質的な不均衡があるかを浮かび上がらせる」ため。種族個性としての射程差（##5 で設計したゴブリン狡猾・オーガ好戦的）は一旦失われるが、計測終了後に「個性として射程差を再導入するか / HP・atk で個性付けするか」を判断する二段階の進め方とする。

予測される変化:
- ogre が最大の優位（射程3）を失い K/D 低下
- dwarf が射程2に強化され human/elf に追随
- goblin は射程アップで多少強化されるが、本質はスポーン頻度なので大幅変化しない見込み

#### 次のプレイテストで観察したい点

- ogre K/D が 1.5 程度に落ちるか
- 人間族 K/D が 1.0 前後に近づくか
- ゴブリンのスポーン頻度過多が浮上するか（K/D が変わらないなら `AI_SPAWN.goblin = 8` の見直し対象）
- 試合結果の偏り（特定陣営支配試合）が減るか

### 計測2回目の結果と相性表B1適用（2026-05-09）

射程フラット化後にユーザーが5ゲーム実施。`logs/gamelog_20260509_18*.json`（2146ターン）を解析:

| 陣営 | フラット化前 K/D | フラット化後 K/D | 変化 |
|---|---:|---:|---:|
| human | 0.80 | **0.57** | ▼0.23（**悪化**） |
| goblin | 0.67 | 0.52 | ▼0.15 |
| lizard | 1.12 | **1.47** | ▲0.35 |
| ogre | 2.53 | 2.04 | ▼0.49 |

5試合の最終支配陣営: lizard=3, human=1(CLEAR), ogre=1。射程3を失った ogre から **lizard が新たな覇権**に。一方で human は射程2据え置きでありながら K/D が悪化した。

#### 構造的な原因の特定（相性表の非対称）

[config.js:151](js/config.js:151) `AFFINITY_DEBUFF` を分析した結果、人間族の不利は射程ではなく**相性デバフの非対称**にあると判明:

| 自分(防御) | 0.7x で殴ってくる相手 | 防御debuff率 |
|---|---|---:|
| human/elf/dwarf | なし | **0%** |
| goblin/lizard/ogre | 各2race | **40%** |

人間族3race は被攻撃で常に等倍ダメージを受けるが、非人間族は4割の攻撃を軽減する。平均ダメージ交換比は人間族 0.90、非人間族 1.07 で、構造差約 17%。

#### 決定: B1（守備側相性の追加）

`AFFINITY_DEBUFF` に3エントリを追加し、各人間族 race に「天敵かつ守護神」関係を成立させる:

```js
'goblin-human', 'lizard-elf', 'ogre-dwarf'
```

意味: ゴブリンが人間を攻撃すると 0.7x、リザードがエルフを攻撃すると 0.7x、オーガがドワーフを攻撃すると 0.7x。既存の人間族の攻撃 debuff（`human-goblin` 等）と対称ペアになる。

予測されるダメージ交換比:
- 人間族: 与 0.9x / 被 0.9x → **1.00**（バランス取れる）
- 非人間族: 与 0.94x / 被 0.88x → 1.07（変化なし）

人間族の K/D が 0.57 → 0.85〜1.00 程度に改善することを期待。lizard・ogre は変化なし想定。

#### 次のプレイテストで観察したい点

- 人間族 K/D が 0.9〜1.0 に近づくか
- lizard / ogre の K/D に意図しない変化が出ないか
- 試合の支配陣営分布が均一化するか（前回 lizard=3勝の偏り解消）
- プレイヤー戦闘でのゴブリン遭遇時の被ダメ軽減が体感できるか（プレイヤーは内部的に human race）

### 計測3回目の結果と A+B 適用（2026-05-09）

B1 適用後にユーザーが5ゲーム実施。`logs/gamelog_20260509_19*.json`（2452ターン）を解析:

| 陣営 | 計測1（初期） | 計測2（射程フラット） | 計測3（B1適用後） |
|---|---:|---:|---:|
| human | 0.80 | 0.57 | **0.85** ▲ |
| goblin | 0.67 | 0.52 | 0.53 |
| lizard | 1.12 | 1.47 | 1.28 ▼ |
| ogre | 2.53 | 2.04 | 1.57 ▼ |

B1 は意図通り効いた:
- human が +0.28 で最大改善（守備側相性で被ダメが減少）
- ogre が -0.47（ogre-dwarf debuff の効果）
- lizard が -0.19（lizard-elf debuff の効果）

人間族サブ種族別では `human:97 / elf:158 / dwarf:101` と全種族で ATK 増、DEF 減を確認。

ただし試合の最終支配陣営は計測2と同じ `lizard=3, ogre=1, human=1` で、**lizard が固定的に強い**状態が続いた。lizard はスポーン総数も計測2の656→866と急増（陣営として勝ちやすい）。

#### 残課題と原因

- **lizard.atk=7（最高）** が他種族（human=5, elf=6, dwarf=4, goblin=5, ogre=6）から突出
- **human.atk=5** で elf=6 より低く、人間族内で平均値が低い
- 結果: lizard 中心の支配構造、human K/D は 0.85 で目標 1.0 に未到達

#### 決定: A + B 同時適用

| 案 | 変更 | 狙い |
|---|---|---|
| A | `lizard.atk` 7 → 6 | 最大値を ogre と同列に。新覇権を抑える |
| B | `human.atk` 5 → 6 | elf と同列に。人間族の平均火力を底上げ |

両方適用後の atk 分布: human=6, elf=6, dwarf=4, goblin=5, lizard=6, ogre=6（dwarf のみ低く特殊化）。

#### 次のプレイテストで観察したい点

- lizard K/D が 1.28 → 1.0 付近に下がるか
- human K/D が 0.85 → 1.0 付近に上がるか
- 試合支配陣営が分散するか（lizard=3勝の固定が解消するか）
- dwarf（atk=4 据え置き）が相対的に弱化していないか
- goblin の K/D 0.53 が改善するか（lizard 弱体化で間接的に上がる可能性）

### 計測4回目の結果と総合バランス調整（2026-05-09）

A+B 適用後（lizard.atk 7→6, human.atk 5→6）にユーザーが5ゲーム実施。`logs/gamelog_20260509_20*.json`（2506ターン）を解析:

| 陣営 | 計測3 | 計測4（A+B） | 変化 |
|---|---:|---:|---:|
| human | 0.85 | 0.77 | ▼ |
| goblin | 0.53 | **0.27** | ▼0.26（最弱化） |
| lizard | 1.28 | **0.66** | ▼0.62 |
| ogre | 1.57 | **2.98** | ▲1.41（**急騰**） |

支配陣営: 計測3 lizard=3 → 計測4 **ogre=3**, lizard=1, human=1。プレイヤー死因も ogre=12 が最多に。

#### 想定外の原因

A（lizard.atk 7→6）で lizard が ogre に逆転負け（1点の atk 差が勝敗ラインを跨いだ）。同時に atk が 6 に均一化されたことで、**HP差（28〜44）が支配的要素**に。HP44 のオーガが圧倒的有利に。

#### 決定: 全体バランス調整（##19 計測5回目）

ユーザー指定の数値で複数項目を同時に調整:

| 種族 | HP | atk | スポーン | 変更点 |
|---|---:|---:|---:|---|
| human | 35 | **5** | **10** | atk 6→5、スポーン 13→10 |
| elf | 30 | 6 | **10** | スポーン 13→10 |
| dwarf | 40 | 4 | **10** | スポーン 13→10 |
| goblin | 28 | **4** | 8 | atk 5→4 |
| lizard | **35** | **5** | 13 | hp 28→35、atk 6→5 |
| ogre | 44 | 6 | **20** | スポーン 18→20 |

#### 各変更の意図

- **human.atk 6→5**：計測4 で human(atk 6) が 191キルと突出していたので軽減
- **goblin.atk 5→4**：goblin はスポーン頻度で勝負させる方針、火力は最低に
- **lizard.hp 28→35**：HP差を縮める。ogre HP 44 との差が16→9に縮小
- **lizard.atk 6→5**：lizard を「タンク寄り」に再定義（HP↑/atk↓）
- **HUMAN_SPAWN_COOLDOWN 13→10**：人間族のスポーン頻度UP、数的優位を狙う
- **AI_SPAWN.ogre 18→20**：オーガのスポーン頻度を更に下げて覇権を抑制

これは「1変数ずつ」方針から外れた多変数同時調整だが、計測4で複数の問題が顕在化したため一括対応とする。

#### 次のプレイテストで観察したい点

- ogre K/D が 2.98 → 1.5 前後に落ちるか
- goblin が atk 4 で更に弱化していないか（スポーン頻度 8 で帳尻が合うか）
- human K/D が 1.0 付近に近づくか（atk↓ だがスポーン↑）
- lizard が新HP35+atk5 でタンク役として機能するか
- 試合支配陣営の分布が均等化するか

### 計測5回目の結果と人間族スポーン抑制（2026-05-09）

総合バランス調整後にユーザーが5ゲーム実施。`logs/gamelog_20260509_21*.json`（2361ターン）を解析:

| 陣営 | 計測4 | 計測5（総合調整後） | 変化 |
|---|---:|---:|---:|
| human | 0.77 | **0.94** | ▲0.17 |
| goblin | 0.27 | 0.31 | ▲0.04 |
| lizard | 0.66 | 0.77 | ▲0.11 |
| ogre | **2.98** | 2.29 | ▼0.69 |

支配陣営: 計測4 ogre=3 → 計測5 **human=4(CLEAR)**, ogre=1。人間族が4/5戦勝利し、過剰強化が顕在化。

#### 主因の特定：スポーン総数の過剰

| 陣営 | 計測4 spawn | 計測5 spawn | 倍率 |
|---|---:|---:|---:|
| human | 721 | **1097** | ×1.52 |
| goblin | 549 | 400 | ×0.73 |
| lizard | 609 | 377 | ×0.62 |
| ogre | 652 | 443 | ×0.68 |

`HUMAN_SPAWN_COOLDOWN` 13→10 の変更が、3 sub-race のローテーション構造と相まって人間族の総数を他陣営の2.4〜2.9倍に押し上げた。K/D 0.94 自体は適正だが、**数で押し切る**構図に。

#### 決定: `HUMAN_SPAWN_COOLDOWN` 10 → 12

完全に元（13）には戻さず、12に微減。理由:
- 計測4の ogre 圧政（K/D 2.98）から計測5でちょうど落ち着き（2.29）方向に動いている
- 人間族の K/D 0.94 は維持したい
- 12 なら他陣営との差を保ちつつ、数の優位を抑制できる

他のステータス（atk/HP）は据え置き。

#### 次のプレイテストで観察したい点

- 試合支配陣営が均等化するか（CLEAR率が4/5から下がるか）
- human K/D が 0.94 を維持できるか
- ogre が再び覇権化しないか
- goblin K/D 0.31 が改善するか（人間族数の減少で間接的に）

### 計測6回目の結果と goblin/ogre 微調整（2026-05-09 → 2026-05-10）

`HUMAN_SPAWN_COOLDOWN=12` 適用後にユーザーが計10ゲーム実施。`logs/gamelog_20260509_22*.json` ＋ `logs/gamelog_20260510_07*.json`（4866ターン）を解析:

| 陣営 | 計測5 | **計測6（10戦合算）** |
|---|---:|---:|
| human | 0.94 | **0.92** |
| goblin | 0.31 | **0.22** |
| lizard | 0.77 | **0.92** |
| ogre | 2.29 | **2.28** |

10戦の支配陣営: human=5, ogre=3, lizard=2, **goblin=0**。CLEAR/GAMEOVER 比率は 5:5。

#### 良くなった点

- human と lizard が K/D 0.92 で同等に着地（バランス取れた状態）
- 試合支配が3陣営に分散（前回 human=4 / ogre=1 から改善）
- 人間族サブ種族が均等貢献（dwarf も互角）

#### 残課題

1. **goblin が壊滅的**: K/D 0.22、10戦で1勝もなし。ATK合計146（次点 human 1034 の 1/7）
2. **ogre が個体強さを維持**: K/D 2.28、勝利時は圧倒（HP44 が決定的優位）
3. **プレイヤー死因の偏り**: lizard=16, ogre=9, goblin=2（lizard が主敵）

#### 決定: goblin 微強化 + ogre 微弱化

ユーザー指定の数値で2項目調整:

| 種族 | HP | atk | スポーン | 変更点 |
|---|---:|---:|---:|---|
| goblin | **30** | 4 | **7** | hp 28→30、スポーン 8→7（atk据え置き） |
| ogre | **42** | 6 | 20 | hp 44→42 |

#### 各変更の意図

- **goblin.hp 28→30**: 対 human族（atk×0.7=3.5）の被弾耐久が 8→8.6ターンに延長。微小だが「人間族との打ち合いで1ターン余分に耐える」効果
- **AI_SPAWN.goblin 8→7**: 100ターンあたり 12.5体→14.3体（+14%）。「数で押す」ゴブリンの個性を強化
- **ogre.hp 44→42**: 個体耐久を微弱化。ogre の決定的優位（HP 44）を縮小。1〜2ターン早く倒せるようになる
- **goblin.atk は据え置き**: 「個体は弱いが数で押す」設計理念を保つため atk 4 のまま

#### 予測効果

- goblin K/D: 0.22 → **0.30〜0.35**（限定的だが改善方向）
- goblin 勝利数: 0/10 → **0〜2/10**
- ogre K/D: 2.28 → **2.0前後**（HP -2 の効果は控えめ）
- 試合支配陣営: 4陣営に分散することを期待

#### 次のプレイテストで観察したい点

- goblin がついに勝利を1つでも掴めるか
- ogre K/D が 2.0 付近に落ちるか
- human / lizard の K/D 0.92 が維持されるか
- 試合支配陣営の分布が4陣営に均等化するか

### 計測7回目の結果とプレイヤー強化＋ショップ仕様変更（2026-05-10）

goblin/ogre 微調整後にユーザーが6ゲーム実施。`logs/gamelog_20260510_08*.json`（2689ターン）を解析:

| 陣営 | 計測6 | 計測7（goblin↑/ogre↓） | 変化 |
|---|---:|---:|---:|
| human | 0.92 | **0.63** | ▼0.29 |
| goblin | 0.22 | **0.36** | ▲0.14（+64%） |
| lizard | 0.92 | **1.24** | ▲0.32 |
| ogre | 2.28 | 2.67 | ▲0.39 |

支配陣営: lizard=4, ogre=2, **human=0**, goblin=0。**人間族が1勝もできない事態**に。

#### 主因の分析

ogre.hp 44→42 が想定以上に効いた:
- lizard atk 5 vs ogre HP 42 = 8.4t、ogre atk 6×0.7 vs lizard HP 35 = 8.3t
- 計測6（ogre HP44）では ogre が0.5t先に倒していたが、HP42で逆転 → lizard が ogre を倒せる構造に
- 結果として lizard が ogre を蹂躙し、その勢いで人間族も押し流した

goblin の K/D 0.36 は明確に改善（HP+2 と spawn-1 の効果）したが勝利には至らず。プレイヤー個人の戦闘成績は114勝21敗で圧倒的だが陣営崩壊で GAMEOVER。

#### 決定: プレイヤー強化＋ショップ仕様変更（陣営バランスから方針転換）

陣営バランスの調整は計測7で頭打ちの兆候。プレイヤー個人を強化することで「陣営は押されるが個人は粘れる」体験を作り、ゲーム性を改善する方向に転換。

##### プレイヤー強化（3項目）

1. **`PLAYER_INIT.hp` 40 → 45**: 序盤の耐久を底上げ
2. **初期ゴールド 0 → 40**: 序盤からショップ装備可能（鉄の剣30G・革の鎧30G・治癒の指輪40G が買える）
3. **死亡時の装備ロスト順固定化**: 旧仕様はランダム選出 → 新仕様は **accessory → armor → weapon** の優先順で消失。武器が残りやすく戦闘力が維持される

##### ショップ仕様変更（2項目）

旧仕様の問題点:
- E キーで開店時、ターン消費なしで5個ランダム抽選
- 閉じて再度開けば新しい5個 → **無限リロード可能**で狙いのアイテムが必ず出せた

新仕様:
1. **開店ごとに1ターン消費**: `openShop()` 末尾に `triggerMonsterTurn` を追加。再抽選には世界ターンのコストが伴う
2. **装備中アイテムをプールから除外**: `equippedNames` で装備中3スロット分を除外してから抽選。ターン消費が必要だが未所持アイテムが出る確率が上がる

#### 実装ファイル

- [js/config.js:248](js/config.js:248) `PLAYER_INIT.hp` 40→45
- [js/player.js:48](js/player.js:48) `player.gold = 40`
- [js/battle.js:438-448](js/battle.js:438) ロスト順を `['accessory', 'armor', 'weapon']` ループに変更
- [js/shop.js:33-52](js/shop.js:33) `openShop()` で装備中除外＋ターン消費

#### 動作確認結果

- `PLAYER_INIT.hp = 45`、初期ゴールド = 40 を確認
- ロスト順: 全装備→acc / acc無し→armor / weapon のみ→weapon / 空→null（仕様通り）
- ショップ開店で `worldTurn` が +1 進むことを確認
- 装備中アイテム（鉄の剣・革の鎧）を装備した状態でプールが14→12に減少することを確認

#### 次のプレイテストで観察したい点

- プレイヤーの戦闘継続力（連戦が増えるか、序盤死亡が減るか）
- 初期ゴールド40で開幕装備購入 → 序盤生存率の向上
- ショップターン消費による戦略性（リロード回数の自然な抑制）
- 武器ロスト頻度の低下（accessory→armor の順で消えるため）
- 全体的なCLEAR率の改善

### 計測8回目の結果と本シリーズの完了（2026-05-10）

プレイヤー強化＋ショップ仕様変更後にユーザーが10ゲーム実施。`logs/gamelog_20260510_11*.json`（4468ターン）を解析:

| 指標 | 値 |
|---|---|
| 試合結果 | **CLEAR=5 / GAMEOVER=5**（50/50） |
| プレイヤー個人戦績 | **169勝 18敗（90%勝率）** |
| プレイヤー死亡数 | 18（10ゲーム） |
| 試合支配陣営 | human=5, ogre=3, lizard=1, **goblin=1** ←初の goblin 勝利 |

| 陣営 | 計測7 | 計測8（最終） |
|---|---:|---:|
| human | 0.63 | **0.92** |
| goblin | 0.36 | 0.25 |
| lizard | 1.24 | **0.97** |
| ogre | 2.67 | 2.63 |

過去最良のバランスに到達。CLEAR/GAMEOVER 完全に半々、4陣営すべてが少なくとも1勝、human と lizard の K/D がほぼ同列、ショップは**購入率68%**で機能（旧仕様の無限リロード抑制が効いている）。

#### 達成項目

| 目標 | 達成 |
|---|---|
| NPC間アグロでAI戦闘活性化 | ✓ per 100t kills 78 |
| 人間族の戦力を他陣営と同等に | ✓ K/D 0.92 |
| 4陣営すべてが勝利可能 | ✓ 4種すべて1勝以上 |
| プレイヤー CLEAR/GAMEOVER 比率の適正化 | ✓ 50/50 |
| プレイヤー戦闘の達成感 | ✓ 90%勝率 |
| ショップの戦略性 | ✓ 68%購入率 |
| 構造的不均衡（被ダメdebuff非対称）の解消 | ✓ B1 |

#### 残課題（許容範囲として固定）

- **ogre K/D 2.63**：個体は強いが勝率3/10で覇権ではない。設計上の「重戦士」キャラとして許容
- **goblin K/D 0.25**：個体は弱いが1勝達成。「個体は弱いが数で押す」設計として許容
- **プレイヤー死因が lizard 偏重**（10/18）：エリア難易度の差として許容

### 最終確定値

##19 シリーズの計測終了時点（2026-05-10）の全パラメータを以下に固定する。

#### ユニット定義（[js/config.js:138-145](js/config.js:138)）

| 種族 | 陣営 | HP | atk | aggroRange | sizeScale |
|---|---|---:|---:|---:|---:|
| human | human | 35 | 5 | 2 | 1.00 |
| elf | human | 30 | 6 | 2 | 1.00 |
| dwarf | human | 40 | 4 | 2 | 0.85 |
| goblin | goblin | 30 | 4 | 2 | 0.65 |
| lizard | lizard | 35 | 5 | 2 | 1.00 |
| ogre | ogre | 42 | 6 | 2 | 1.10 |

#### スポーン頻度（[js/config.js:130-131](js/config.js:130)）

- `HUMAN_SPAWN_COOLDOWN = 12`
- `AI_SPAWN = { goblin: 7, lizard: 13, ogre: 20 }`

#### 相性デバフ（[js/config.js:151-156](js/config.js:151)、9エントリ）

```
攻撃debuff: human-goblin, elf-lizard, dwarf-ogre, goblin-ogre, lizard-goblin, ogre-lizard
守備debuff: goblin-human, lizard-elf, ogre-dwarf  ← B1で追加
```

#### プレイヤー（[js/config.js:248](js/config.js:248), [js/player.js:48](js/player.js:48)）

- `PLAYER_INIT = { hp: 45, atk: 7, rec: 5, agi: 10 }`
- 初期ゴールド: 40
- 装備ロスト順: accessory → armor → weapon

#### ショップ（[js/shop.js:33-52](js/shop.js:33)）

- 開店ごとに1ターン消費
- 装備中アイテムはプールから除外

#### NPCアグロ（[js/monsters.js:311-348](js/monsters.js:311)）

- 全種族に aggroRange=2 を付与
- 異陣営NPC・プレイヤーの両方を検知（同距離はプレイヤー優先）
- 退却中・回復中は無効

これらの値は BALANCE_TUNING_LOG.md の累積調整テーブル、INDEX_SPEC.md・GAME_DESIGN.md にも反映済み（2026-05-10）。
