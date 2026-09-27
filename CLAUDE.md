# CLAUDE.md

このリポジトリは「スノーグリル」（広告系アイドルアーケード：白クマ狩り → 肉を焼く → 配る → 設備解放）です。
メインPC と 4thPC の 2 台から、Claude Code を使って交互にブラッシュアップしています。

## 作業ルール

- **作業を始める前に必ず `git pull`**。一区切りしたら日本語のコミットメッセージで commit → `git push`。
- 改善アイデアは `BRUSHUP.md`。実装したら `[x]`、思いついたら追記。
- ユーザーとのやり取りは日本語で。

## 構成

- 素の HTML / CSS / JavaScript。Canvas 2D で描画。`<script>` は config → audio → story → game → battle → scenery の順。村とストーリーは `js/story.js`、決戦・襲撃・バリケード修理は `js/battle.js`、村ごとの景色（地面・置き物・時間帯の光）は `js/scenery.js` の `SCENES`（村の id ごと。どの村も雪の村のまま）。
- 座標はワールド座標（720 × 1400、y が大きいほど手前）。`CONFIG.viewWidth` ぶんを画面の横幅に映し、カメラがプレイヤーを追う。
- 描画は y の小さい順（奥から手前）。`drawSprite(名前, x, y, 高さ)` は足元基準。画像が無ければ `CONFIG.sprites` の絵文字で描く。
- 肉の受け渡しは `interactStations()`（プレイヤーと運び係で共通）。背中の肉は `stack`（'raw' か 'cooked'、混ぜて持てない）。
- 解放は `CONFIG.unlocks` の順に1つずつ。効果は `applyUnlock()`。セーブにはお金・救った人数・解放した数だけを保存し、ロード時に `applyUnlock` を当て直す。
- 次にやることのガイド（上の吹き出し＋黄色い矢印）は `currentGoal()`。
- セーブは localStorage（キー `snowGrill.v2`、村ごとに解放数・救った人数・仲間 `crew: [{type, kind}]`）。`?reset` で消去。
- 戦闘：白クマは近づく（または攻撃される）と追いかけ、「ため」（赤い円）→ひっかき。数値は `CONFIG.combat`。
- レベル：`VILLAGES` の `level`（無ければ 1）。全体マップはレベルごとのタブ（`LEVELS`・`openMap(open, level)`）。村は配列の順につながり、前の村を終えると次がひらく（レベル2の最初の村は王都のあと）。
- 豪傑（レベル2から）：大斧の大きな助っ人（`h.brute`、絵は `brute_idle/attack/down`）。`CONFIG.brutes[レベル]` に「目標人数の何割を救ったら来るか」を1人ずつ並べる（決戦は最初から全員）。セーブには入れず、村に入ったとき・人を救ったときに `syncBrutes()` で人数を合わせる。一撃でまわりの白クマをまとめて斬って吹き飛ばす（`bruteSmash`、数値は `CONFIG.helper.brute`）。志願者の枠には数えない。レベル3を作るときは `CONFIG.brutes[3]` に人数を足す。初登場は1回だけの演出：`giant.debut` のついた決戦（雪崩の谷）で巨人が出ているあいだにピンチ（`CONFIG.debut` の割合）になると、時間が止まってカットイン（`drawCutin`）→ 空から降ってきて白クマを吹き飛ばす（`garuLands`）→ 会話 `GARU_DEBUT`。それまで豪傑は来ない（`SAVE.seen.garuDebut`）。
- 助っ人は解放ではなく「志願者」から仲間になる（`CONFIG.volunteer`、`maybeVolunteer()` / `openRecruit()`）。手伝う役割は村人の種類で決まる（`CONFIG.villagerRole`）。見た目は役割ごとの服装。
- 領地（歩ける範囲）は `updateTerritory()`。解放した設備と次のパッドのまわりまで広がる。狩り場は `G.hunt`（狩り場拡張で `CONFIG.hunt` まで）。
- 時間差の処理に setTimeout は使わない。`later(秒, fn)`（ゲーム内時間、村を移ると取り消し）を使う。

## 画像

- 原本は `assets/sprites/*.png`（ChatGPT で 3×3 のシートを作り `tools/slice_sheet.py` で切り出し）。
- 原本を変えたら `python tools/optimize.py` で `img/*.webp` を作り直す。
- 村ごとの地面：ChatGPT で「真上から見た地面テクスチャ・1枚に1種類」を頼み、`bash tools/grab_latest.sh <名前>` → `python tools/ground_sheet.py assets/_sheets/<名前>.png <名前>` → `python tools/optimize.py --grounds` で `img/ground_<名前>.webp`（つなぎ目の出ないタイル）。`SCENES` の `ground: { field, camp }` で使う。2×2 にまとめて頼むと特徴の弱い雪ばかりになるので、1枚ずつ英語で具体的に頼む。狩り場に暗い水面があると「白クマや人が海に落ちそう」に見えるので避ける（港の流氷はすき間を `tools/frozen_seams.py` で氷の色に埋めた `port_frozen` を使う）。
- 村ごとの設備の絵：`img/<名前>_<村の id>.webp`（例 `grill_on_lake`）。`js/scenery.js` の `FACILITY_SETS` に村と名前を並べると、描くときに `fac(名前)` が村の絵に差しかえる。ChatGPT には今の設備を並べた画像を添えて「同じ画風・透明背景・2行×3列」で頼み、`python tools/slice_sheet.py assets/_sheets/fac_<村>.png assets/sprites <名前_村,...>` → `python tools/optimize.py`
- BGM：`js/audio.js` の `SONGS`（曲）と `PLAYLIST`（村の id → 2曲。1曲を3回まわしたら次の曲）。村に入ると `Sound.setBgm(id)`、巨人が出ている間は `'giant'`。本物の曲は Suno で作った `bgm/<名前>.mp3`（`FILES` で村 → 曲。8曲）。WebAudio でループ再生し、読み込めるまでと読めなかったときは `SONGS` のピコピコ。曲の差しかえは `python tools/bgm_loop.py <元.mp3> bgm/<名前>.mp3 <BPM>`
- 大きい敵（ボス白クマ・巨人）は `CONFIG.topY` より奥へ行かない（奥だと頭と体力ゲージが画面上の HUD に隠れる）。
- 素材を ChatGPT で追加生成するときの注意は power-tower の CLAUDE.md と同じ（依頼は1〜2分おき、保存は BroadcastChannel 経由）。

## 公開時の注意

- `index.html` の CSS / JS には `?v=日付+記号` を付けている。**JS か CSS を変えたらこの値をそろえて新しくする**（スマホに古いファイルが残るのを防ぐ）。
- 公開URL: https://machino-ai.jp/snow-grill/ （main に push すると GitHub Pages に反映）

## 動作確認

- ブラウザの開発者ツールで、ガイドに従って自動で動くボットを走らせると、解放までの時間を測れる（`currentGoal()` の方向に `G.keys` を押して `update(1/30)` を回す）。

## 紹介用の画面写真

- AIゲーム実験室（mitsukenn/ad-games）の `assets/screens/snow_1〜3.jpg`（540×1052）に使っている。
- 撮り方：開発サーバー（8770）を立ち上げて、headless の Edge で `tools/shot.html?scene=1〜3` を撮る（1＝白クマとの戦い、2＝キャンプで配る、3＝雪の巨人との決戦）。
  `msedge --headless=new --window-size=480,935 --force-device-scale-factor=1.125 --virtual-time-budget=30000 --screenshot=out.png "http://localhost:8770/tools/shot.html?scene=1"`

