/**
 * テスト用: Docs API の batchUpdate のうち、文字と名前付き範囲に関わるリクエストを文字列の上で再現する。
 * 本物の Docs と同じく index 1 から数え(本文の先頭に見えない 1 文字があるものとして扱う)、
 * リクエストを先頭から順に適用する。
 */
import type { DocsRequest } from '@core/docs/types';

export interface SimNamedRange {
  name: string;
  startIndex: number;
  endIndex: number;
}

export interface SimDoc {
  /** 本文(index 1 の文字が text[0]) */
  text: string;
  namedRanges: SimNamedRange[];
  /** updateTextStyle が適用された範囲と書式(確認用) */
  styles: { startIndex: number; endIndex: number; fields: string }[];
}

export function applyRequests(doc: SimDoc, requests: readonly DocsRequest[]): SimDoc {
  let { text } = doc;
  let namedRanges = doc.namedRanges.map((r) => ({ ...r }));
  const styles = [...doc.styles];

  for (const req of requests) {
    if ('insertText' in req) {
      const at = req.insertText.location.index;
      if (at < 1 || at > text.length + 1) throw new Error(`insertText の位置が範囲外: ${at}`);
      const t = req.insertText.text;
      text = text.slice(0, at - 1) + t + text.slice(at - 1);
      namedRanges = namedRanges.map((r) => ({
        ...r,
        startIndex: r.startIndex >= at ? r.startIndex + t.length : r.startIndex,
        endIndex: r.endIndex > at ? r.endIndex + t.length : r.endIndex,
      }));
    } else if ('deleteContentRange' in req) {
      const { startIndex: s, endIndex: e } = req.deleteContentRange.range;
      if (s === undefined || e === undefined || s < 1 || e > text.length + 1 || e <= s) {
        throw new Error(`deleteContentRange の範囲が不正: ${s}-${e}`);
      }
      const len = e - s;
      text = text.slice(0, s - 1) + text.slice(e - 1);
      const move = (i: number): number => (i >= e ? i - len : i > s ? s : i);
      namedRanges = namedRanges
        .map((r) => ({ ...r, startIndex: move(r.startIndex), endIndex: move(r.endIndex) }))
        .filter((r) => r.endIndex > r.startIndex);
    } else if ('createNamedRange' in req) {
      const { startIndex: s, endIndex: e } = req.createNamedRange.range;
      if (s === undefined || e === undefined || s < 1 || e > text.length + 1) throw new Error('createNamedRange の範囲が不正');
      namedRanges.push({ name: req.createNamedRange.name, startIndex: s, endIndex: e });
    } else if ('deleteNamedRange' in req) {
      namedRanges = namedRanges.filter((r) => r.name !== req.deleteNamedRange.name);
    } else if ('updateTextStyle' in req) {
      const { startIndex: s, endIndex: e } = req.updateTextStyle.range;
      if (s === undefined || e === undefined || s < 1 || e > text.length + 1) throw new Error('updateTextStyle の範囲が不正');
      styles.push({ startIndex: s, endIndex: e, fields: req.updateTextStyle.fields });
    }
  }
  return { text, namedRanges, styles };
}

/** 範囲の文字列を取り出す(index 1 始まり)。 */
export function textAt(doc: SimDoc, startIndex: number, endIndex: number): string {
  return doc.text.slice(startIndex - 1, endIndex - 1);
}
