/**
 * 拡張機能が差し込んだ読み(名前付き範囲 RUBI_RANGE_NAME)を消して、元の文に戻す batchUpdate リクエストを作る。
 * Phase 0 で、この手順で元の文に完全に戻ることを確認済み(PHASE0_FINDINGS.md 3節)。
 */
import { RUBI_RANGE_NAME } from './inlineRuby';
import type { DocParagraph } from './extract';
import type { DocsRange, DocsRequest, NamedRanges, TextStyle } from './types';

export interface IndexRange {
  startIndex: number;
  endIndex: number;
}

/**
 * 名前付き範囲 RUBI_RANGE_NAME の区間を集める。segmentId を省くと本文のものだけ、指定するとそのヘッダー・フッター・
 * 脚注のものだけ。重なる区間・隣り合う区間は1つにまとめ、index の小さい順に返す。
 */
export function collectRubiRanges(namedRanges: NamedRanges | undefined, segmentId?: string): IndexRange[] {
  const ranges: IndexRange[] = [];
  for (const nr of namedRanges?.[RUBI_RANGE_NAME]?.namedRanges ?? []) {
    for (const r of nr.ranges ?? []) {
      if ((r.segmentId || undefined) !== segmentId) continue;
      if (typeof r.startIndex !== 'number' || typeof r.endIndex !== 'number' || r.endIndex <= r.startIndex) continue;
      ranges.push({ startIndex: r.startIndex, endIndex: r.endIndex });
    }
  }
  ranges.sort((a, b) => a.startIndex - b.startIndex);

  const merged: IndexRange[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.startIndex <= last.endIndex) {
      last.endIndex = Math.max(last.endIndex, r.endIndex);
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

/** 名前付き範囲 RUBI_RANGE_NAME の区間を、まとめずに ID 付きで集める(本文のものだけ。選択した範囲だけ消すとき用)。 */
export function collectRubiRangeEntries(namedRanges: NamedRanges | undefined): (IndexRange & { namedRangeId?: string })[] {
  const out: (IndexRange & { namedRangeId?: string })[] = [];
  for (const nr of namedRanges?.[RUBI_RANGE_NAME]?.namedRanges ?? []) {
    for (const r of nr.ranges ?? []) {
      if (r.segmentId) continue;
      if (typeof r.startIndex !== 'number' || typeof r.endIndex !== 'number' || r.endIndex <= r.startIndex) continue;
      out.push({ startIndex: r.startIndex, endIndex: r.endIndex, ...(nr.namedRangeId ? { namedRangeId: nr.namedRangeId } : {}) });
    }
  }
  return out.sort((a, b) => a.startIndex - b.startIndex);
}

/** 読みの書式として付けた項目(段落の終わりの改行に残ったら戻す)。 */
const READING_STYLE_FIELDS = ['fontSize', 'foregroundColor', 'baselineOffset', 'weightedFontFamily'] as const;

/**
 * 段落の最後に差し込んだ読みを消すと、段落の終わりの改行に読みの書式(小さい文字など)が残る(2026-09-28 実機)。
 * 消した後、改行の書式を読みの直前の文字(漢字)に合わせるリクエストを返す。段落の最後でなければ null。
 * 消した後は、改行は range.startIndex の位置に来る。
 */
export function newlineStyleFix(
  paragraphs: readonly DocParagraph[],
  range: IndexRange,
  tabId?: string,
  segmentId?: string
): DocsRequest | null {
  const p = paragraphs.find((x) => x.endIndex - 1 === range.endIndex);
  if (!p) return null;
  const prev = p.runs.find((r) => range.startIndex - 1 >= r.startIndex && range.startIndex - 1 < r.endIndex);
  const textStyle: TextStyle = {};
  for (const f of READING_STYLE_FIELDS) {
    const v = prev?.textStyle[f];
    if (v !== undefined) (textStyle as Record<string, unknown>)[f] = v;
  }
  return {
    updateTextStyle: {
      range: {
        startIndex: range.startIndex,
        endIndex: range.startIndex + 1,
        ...(segmentId !== undefined ? { segmentId } : {}),
        ...(tabId !== undefined ? { tabId } : {}),
      },
      textStyle,
      fields: READING_STYLE_FIELDS.join(','),
    },
  };
}

/**
 * 読みを消すリクエスト。後ろの区間から順に deleteContentRange し、最後に名前付き範囲そのものを消す。
 * 消すものが無ければ空の配列を返す。
 */
export function buildDeleteRubyRequests(ranges: readonly IndexRange[], tabId?: string, segmentId?: string): DocsRequest[] {
  if (ranges.length === 0) return [];
  const withTab = (r: IndexRange): DocsRange => ({
    ...r,
    ...(segmentId !== undefined ? { segmentId } : {}),
    ...(tabId !== undefined ? { tabId } : {}),
  });
  const deletes: DocsRequest[] = [...ranges]
    .sort((a, b) => b.startIndex - a.startIndex)
    .map((r) => ({ deleteContentRange: { range: withTab(r) } }));
  return [
    ...deletes,
    { deleteNamedRange: { name: RUBI_RANGE_NAME, ...(tabId !== undefined ? { tabsCriteria: { tabIds: [tabId] } } : {}) } },
  ];
}
