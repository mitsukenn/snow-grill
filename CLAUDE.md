# CLAUDE.md

このリポジトリは「スノーグリル」（広告系アイドルアーケード：白クマ狩り → 肉を焼く → 配る → 設備解放）です。
メインPC と 4thPC の 2 台から、Claude Code を使って交互にブラッシュアップしています。

## 作業ルール

- **作業を始める前に必ず `git pull`**。一区切りしたら日本語のコミットメッセージで commit → `git push`。
- 改善アイデアは `BRUSHUP.md`。実装したら `[x]`、思いついたら追記。
- ユーザーとのやり取りは日本語で。

## 構成

- 素の HTML / CSS / JavaScript。Canvas 2D で描画。`<script>` は config → audio → story → game の順。村とストーリーは `js/story.js`。
- 座標はワールド座標（720 × 1400、y が大きいほど手前）。`CONFIG.viewWidth` ぶんを画面の横幅に映し、カメラがプレイヤーを追う。
- 描画は y の小さい順（奥から手前）。`drawSprite(名前, x, y, 高さ)` は足元基準。画像が無ければ `CONFIG.sprites` の絵文字で描く。
- 肉の受け渡しは `interactStations()`（プレイヤーと運び係で共通）。背中の肉は `stack`（'raw' か 'cooked'、混ぜて持てない）。
- 解放は `CONFIG.unlocks` の順に1つずつ。効果は `applyUnlock()`。セーブにはお金・救った人数・解放した数だけを保存し、ロード時に `applyUnlock` を当て直す。
- 次にやることのガイド（上の吹き出し＋黄色い矢印）は `currentGoal()`。
- セーブは localStorage（キー `snowGrill.v2`、村ごとに解放数・救った人数・仲間 `crew: [{type, kind}]`）。`?reset` で消去。
- 戦闘：白クマは近づく（または攻撃される）と追いかけ、「ため」（赤い円）→ひっかき。数値は `CONFIG.combat`。
- 助っ人は解放ではなく「志願者」から仲間になる（`CONFIG.volunteer`、`maybeVolunteer()` / `openRecruit()`）。見た目は志願した村人の `kind`。
- 時間差の処理に setTimeout は使わない（ボットの高速シミュレーションで動かなくなる）。ゲーム内時間で数える。

## 画像

- 原本は `assets/sprites/*.png`（ChatGPT で 3×3 のシートを作り `tools/slice_sheet.py` で切り出し）。
- 原本を変えたら `python tools/optimize.py` で `img/*.webp` を作り直す。
- 素材を ChatGPT で追加生成するときの注意は power-tower の CLAUDE.md と同じ（依頼は1〜2分おき、保存は BroadcastChannel 経由）。

## 公開時の注意

- `index.html` の CSS / JS には `?v=日付+記号` を付けている。**JS か CSS を変えたらこの値をそろえて新しくする**（スマホに古いファイルが残るのを防ぐ）。
- 公開URL: https://machino-ai.jp/snow-grill/ （main に push すると GitHub Pages に反映）

## 動作確認

- ブラウザの開発者ツールで、ガイドに従って自動で動くボットを走らせると、解放までの時間を測れる（`currentGoal()` の方向に `G.keys` を押して `update(1/30)` を回す）。
