/**
 * DOM 上で観測したテキスト領域と、Slides API から取得したシェイプ一覧を
 * 突き合わせる純粋ロジック。PLAN.md 3.3節・3.5節・PHASE0_FINDINGS.md 3節で
 * 確定した方針(DOM の id は API の objectId と一致しないため、
 * 位置の近さ→テキスト内容の一致で対応付ける)を実装する。
 */
import type { EmuRect } from './emu';

export interface ApiShapeInfo {
  objectId: string;
  text: string;
  box: EmuRect;
}

export interface MatchCandidate {
  text: string;
  box: EmuRect;
}

function centerOf(box: EmuRect): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export interface MatchOptions {
  /** 2位の候補が1位の何倍以内の近さなら「曖昧」とみなして不採用にするか(既定 1.3) */
  ambiguousRatio?: number;
  /** これより離れていたら別のシェイプとみなす閾値の倍率(候補の対角線に対する倍率、既定 5) */
  maxDistanceRatio?: number;
}

/**
 * DOM 上の1つのテキスト領域(candidate)に対応する Slides API シェイプの
 * objectId を1つ選ぶ。一意に決まらない場合や妥当な候補が無い場合は null を返し、
 * 呼び出し側はグループ化をスキップする(書き込み自体は行える。PLAN.md 3.5節参照)。
 */
export function findMatchingShapeObjectId(
  candidate: MatchCandidate,
  shapes: ApiShapeInfo[],
  options: MatchOptions = {}
): string | null {
  const ambiguousRatio = options.ambiguousRatio ?? 1.3;
  const maxDistanceRatio = options.maxDistanceRatio ?? 5;

  if (shapes.length === 0) return null;

  // テキストが完全一致 or 部分一致するシェイプを優先候補にする。
  // 該当が無ければ位置だけで判断する(全シェイプを候補にする)。
  const textMatches = shapes.filter(
    (s) => s.text.length > 0 && (s.text.includes(candidate.text) || candidate.text.includes(s.text))
  );
  const pool = textMatches.length > 0 ? textMatches : shapes;

  const candidateCenter = centerOf(candidate.box);
  const ranked = pool
    .map((s) => ({ shape: s, d: distance(candidateCenter, centerOf(s.box)) }))
    .sort((a, b) => a.d - b.d);

  const best = ranked[0];
  if (!best) return null;

  const candidateDiagonal = Math.hypot(candidate.box.width, candidate.box.height);
  if (best.d > candidateDiagonal * maxDistanceRatio) {
    return null; // 一番近い候補ですら離れすぎている
  }

  const second = ranked[1];
  if (second && second.d < best.d * ambiguousRatio) {
    return null; // 1位と2位が僅差 = 一意に決まらない
  }

  return best.shape.objectId;
}
