/**
 * ルビのレイアウトに関する純粋な計算ロジック。DOM には依存しないため単体テスト可能。
 */
import type { Rect } from './geometry';

export interface RubyFontSizeOptions {
  /**
   * ルビの最小フォントサイズ(px)。既定 8px。
   * これより小さいと実用上ほぼ判読できなくなる(実機テストで発見。
   * 本文が非常に小さいスライドで 6px にクランプされたルビが
   * 事実上見えなくなってしまった)。
   */
  minFontSize?: number;
  /**
   * 幅方向の制約に掛ける安全係数。1 は「本文の文字送り幅ぴったり」を意味し、
   * 1 より大きい値は多少のはみ出しを許容する。既定 1.05。
   *
   * 【重要】この値は実機での試行錯誤で決定した。本文1文字あたり幅約15.8px・
   * 高さ約22.4pxの実例(「神経」「衰弱」「麻雀」等)で検証:
   *   - 1.4 では、4文字の読み(例:「しんけい」)がまだ隣の語のルビと
   *     わずかに重なった(「い」の一部が隠れる)。
   *   - 0.92 のように厳しすぎると、5文字の読み(例:「まーじゃん」)の
   *     計算値が最小フォントサイズを下回り、最小フォントサイズに
   *     クランプされて読みにくくなる度合いは変わらないが、
   *     4文字の読みでもクランプが起きやすくなり、全体に小さくなりすぎる。
   *   1.05 は、「4文字程度の読みは本文の文字送り幅にほぼ収まりつつ、
   *   5文字以上の極端に長い読みは最小フォントサイズでの多少のはみ出しを
   *   許容する」という妥協点として選んだ。5文字以上が2文字の非常に
   *   狭い本文に乗るケースでは、最小フォントサイズ(既定8px)を守る以上、
   *   隣接語とのわずかな重なりを完全には避けられない
   *   (安全係数をいくら小さくしても、フォントサイズが最小値に貼り付く
   *   だけで、幅の超過分自体は解消しないため)。この場合はユーザーが
   *   popup でルビのサイズ比を下げることで軽減できる。
   */
  widthSafetyFactor?: number;
}

/**
 * ルビのフォントサイズを計算する。
 *
 * 本文の高さに対する比率(sizeRatio)を基本としつつ、ルビの文字数が多く
 * 本文の幅に収まらない場合にフォントサイズをそのまま使うと、隣接する
 * 文字のルビと重なって読めなくなることが実機テストで判明した
 * (例:「神経」+「衰弱」でそれぞれ4文字・5文字のルビが並び、
 * 「神経」側のルビの後半が「衰弱」側のルビの背景に隠れて
 * 「しんけいすいじゃく」が「しんすいじゃく」に見えてしまった)。
 *
 * これを避けるため、CJK の全角文字は概ね「文字送り幅 ≈ フォントサイズ」
 * であることを利用し、ルビの文字数から必要な幅を見積もって、
 * 本文の幅を大きく超えないようフォントサイズを抑える。
 * ただし完全に本文の幅に収めようとする(安全係数を1.0に近づける)と、
 * 今度は本文フォントが小さいスライドで最小フォントサイズにクランプされ
 * 実質読めなくなる不具合が別途見つかったため(実機テストで発見)、
 * 「多少のはみ出しは許容し、最低限の可読性を優先する」設計にしている。
 */
export function computeRubyFontSize(
  boxWidth: number,
  boxHeight: number,
  kanaCharCount: number,
  sizeRatio: number,
  options: RubyFontSizeOptions = {}
): number {
  const minFontSize = options.minFontSize ?? 8;
  const widthSafetyFactor = options.widthSafetyFactor ?? 1.05;
  const heightBased = boxHeight * sizeRatio;

  if (kanaCharCount <= 0 || boxWidth <= 0) {
    return Math.max(minFontSize, heightBased);
  }

  const widthBased = (boxWidth / kanaCharCount) * widthSafetyFactor;
  return Math.max(minFontSize, Math.min(heightBased, widthBased));
}

/**
 * 同じ段落内の複数のルビ候補サイズから、段落全体で統一して使う
 * フォントサイズを 1 つ選ぶ。
 *
 * 【重要】ルビごとに個別最適化したサイズをそのまま使うと、隣り合う単語で
 * 読みの文字数が異なるだけでサイズがバラバラになり、見た目が不自然に
 * なることが実機テストで判明した(例:「最小」+「単位」という一続きの
 * フレーズで、読みが5文字の「さいしょう」だけ小さく、3文字の「たんい」
 * だけ大きく表示され、統一感がなかった)。
 *
 * 最も厳しい制約(最小値)を段落全体の統一サイズとして採用することで、
 * はみ出し・重なりを避けつつ、段落内で一貫した見た目にする。
 */
export function pickUniformRubyFontSize(candidateFontSizes: number[]): number {
  if (candidateFontSizes.length === 0) return 0;
  return Math.min(...candidateFontSizes);
}

/** 1行分のルビ用ボックスの高さ・幅に掛ける安全係数。実機で発見した不具合(下記)の対処。 */
const RUBY_BOX_LINE_HEIGHT_FACTOR = 1.3;
const RUBY_BOX_WIDTH_FACTOR = 1.3;
/** 本文とルビの間に空ける隙間(ルビのフォントサイズに対する比率)。 */
const RUBY_BOX_GAP_FACTOR = 0.15;

/**
 * 本文の矩形(bodyBox)から、その真上に配置する「ルビ自身のボックス」を計算する。
 *
 * 【重要】モード B(スライドへの書き込み)で実機テストにより発見した不具合:
 * `computeParagraphRubyPlan` が返す `RubyPlacement.box` は本文文字そのものの
 * 矩形であり、モード A(画面表示)はこれを元に `createRubySpan` 内で
 * 独自に「本文の少し上」へ座標をずらして描画していた。モード B の
 * `writeController.ts` はこの本文矩形をそのまま書き込みシェイプの矩形として
 * 使っていたため、(1) ルビが本文の真上ではなく本文とほぼ同じ位置に配置され、
 * (2) シェイプの幅が本文文字の幅(=ルビのフォントサイズ計算時に使った、
 * 折り返しがぎりぎりの幅)のままだったため、Slides 側でルビ文字列が
 * 複数行に自動折り返しされてしまい、本文の上に縦積みで乗る形になっていた
 * (実機で「麻雀」→「まーじゃん」が本文と重なって縦に3分割される不具合を確認)。
 *
 * この関数は、本文の中心に水平方向を合わせつつ、ルビの文字数×フォントサイズから
 * 折り返しが起きない幅を確保し、本文の直上に十分な隙間を空けて配置する
 * ボックスを返す。モード A・B の両方から呼べるよう DOM に依存しない純粋関数にする。
 */
export function computeRubyBoxAboveBody(
  bodyBox: Rect,
  fontSizePx: number,
  kanaCharCount: number,
  /** ルビの水平方向の中心(省略時は本文の中心)。隣のルビとの重なりを避けてずらした位置を渡す */
  centerX: number = bodyBox.x + bodyBox.width / 2
): Rect {
  const height = fontSizePx * RUBY_BOX_LINE_HEIGHT_FACTOR;
  const width = Math.max(bodyBox.width, kanaCharCount * fontSizePx * RUBY_BOX_WIDTH_FACTOR);
  const gap = fontSizePx * RUBY_BOX_GAP_FACTOR;
  return {
    x: centerX - width / 2,
    y: bodyBox.y - height - gap,
    width,
    height,
  };
}

/**
 * 本文の矩形の並び(段落内の順序どおり)から、「同じ行で、すき間なく隣り合っている」
 * ものどうしをまとめる。漢字ごとのルビ(例: 始|業|式)は、1つの熟語が複数の
 * 隣り合う区間に分かれるため、サイズと位置はこのまとまり単位で決める。
 * 戻り値は元の添字のまとまりの配列(順序は保つ)。
 */
export function groupAdjacentBoxes(boxes: Rect[]): number[][] {
  const groups: number[][] = [];
  boxes.forEach((box, i) => {
    const current = groups[groups.length - 1];
    const prev = i > 0 ? (boxes[i - 1] as Rect) : undefined;
    if (current && prev && areAdjacentOnSameLine(prev, box)) {
      current.push(i);
    } else {
      groups.push([i]);
    }
  });
  return groups;
}

function areAdjacentOnSameLine(a: Rect, b: Rect): boolean {
  const height = Math.max(a.height, b.height);
  const sameLine = Math.abs(a.y + a.height / 2 - (b.y + b.height / 2)) <= height * 0.5;
  const gap = b.x - (a.x + a.width);
  // 文字の並びのすき間は字間程度。かな1文字(=本文の高さ程度)以上離れていれば隣り合っていない
  return sameLine && gap > -height * 0.3 && gap < height * 0.3;
}

/**
 * 隣り合うルビが重ならないよう、各ルビの水平方向の中心を決める。
 * 各ルビをできるだけ本来の位置(本文の中心 `center`)に近づけつつ、
 * 左右の並び順を保ったまま「隣のルビと `gap` 以上離れる」制約を満たす
 * (中心のずれの二乗和を最小にする。ブロックを結合していく PAV 法で厳密解を求める)。
 *
 * 例:「業」の上の「ぎょう」は本文1文字より幅があるので、隣の「始」「式」のルビを
 * 左右に押し広げる。重ならないものは動かさない。
 *
 * @param items 左から順に並んだルビ(center: 本来の中心 x、width: ルビの幅)
 * @returns 各ルビの中心 x(items と同じ順序)
 */
export function resolveRubyCenters(items: { center: number; width: number }[], gap: number): number[] {
  if (items.length === 0) return [];
  // 位置 x_i = y_i + offset_i とおくと、制約は y_i が非減少になることと同値になる
  const offsets: number[] = [0];
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1] as { width: number };
    const cur = items[i] as { width: number };
    offsets.push((offsets[i - 1] as number) + prev.width / 2 + gap + cur.width / 2);
  }
  const targets = items.map((it, i) => it.center - (offsets[i] as number));

  // PAV(pool adjacent violators)で targets の非減少な最小二乗近似を求める
  const blocks: { sum: number; count: number }[] = [];
  for (const t of targets) {
    blocks.push({ sum: t, count: 1 });
    while (blocks.length >= 2) {
      const last = blocks[blocks.length - 1] as { sum: number; count: number };
      const before = blocks[blocks.length - 2] as { sum: number; count: number };
      if (before.sum / before.count <= last.sum / last.count) break;
      blocks.splice(blocks.length - 2, 2, { sum: before.sum + last.sum, count: before.count + last.count });
    }
  }
  const fitted: number[] = [];
  for (const b of blocks) {
    for (let k = 0; k < b.count; k++) fitted.push(b.sum / b.count);
  }
  return fitted.map((y, i) => y + (offsets[i] as number));
}
