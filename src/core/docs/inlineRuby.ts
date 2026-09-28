/**
 * 見せ方 A・B・C(本文に読みを差し込む方式、PLAN.md 3.4節)の batchUpdate リクエストを作る。
 *
 * - A 'paren':       漢字（かんじ） 読みは本文と同じ大きさ・書式(直前の文字の書式を引き継ぐ)
 * - B 'paren-small': 漢字(かんじ)   読みは本文の sizeRatio 倍の大きさ・色付き
 * - C 'superscript': 漢字^かんじ    読みは上付き・色付き(大きさは Docs の上付きの既定に任せる)
 *
 * 差し込んだ読み(括弧を含む)には名前付き範囲 RUBI_RANGE_NAME を付け、あとで消せるようにする
 * (buildDeleteRubyRequests)。Phase 0 で、この方法で元の文に完全に戻ることを確認済み(PHASE0_FINDINGS.md 3節)。
 */
import { hexToRgbFraction, isValidHexColor } from '../color';
import type { RubySpan } from './rubySpans';
import type { DocsRange, DocsRequest, TextStyle } from './types';

/** 拡張機能が差し込んだ読みに付ける名前付き範囲の名前。この名前の範囲だけを消す。 */
export const RUBI_RANGE_NAME = 'rubi-furigana';

export type InlineRubyStyle = 'paren' | 'paren-small' | 'superscript';

export interface InlineRubyOptions {
  style: InlineRubyStyle;
  /** 複数タブの文書で、書き込むタブの ID */
  tabId?: string;
  /** ヘッダー・フッター・脚注に書き込むときの ID(本文なら省略) */
  segmentId?: string;
  /** B の読みの大きさ(本文に対する比率) */
  sizeRatio: number;
  /** B・C の読みの色(`#rrggbb`)。省略すると本文の色を引き継ぐ */
  color?: string;
  /** 漢字の位置(index)の本文の文字の大きさ(pt) */
  fontSizeAt: (index: number) => number;
}

const PARENS: Record<InlineRubyStyle, readonly [string, string]> = {
  paren: ['（', '）'],
  'paren-small': ['(', ')'],
  superscript: ['', ''],
};

/** 差し込む文字列(括弧を含む)。 */
export function readingText(style: InlineRubyStyle, reading: string): string {
  const [open, close] = PARENS[style];
  return `${open}${reading}${close}`;
}

/** 読みの大きさ(pt)。0.5pt 単位に丸め、1pt 未満にはしない。 */
export function readingFontSize(basePt: number, ratio: number): number {
  return Math.max(1, Math.round(basePt * ratio * 2) / 2);
}

function where(options: { tabId?: string; segmentId?: string }): { tabId?: string; segmentId?: string } {
  return {
    ...(options.segmentId !== undefined ? { segmentId: options.segmentId } : {}),
    ...(options.tabId !== undefined ? { tabId: options.tabId } : {}),
  };
}

function readingTextStyle(span: RubySpan, options: InlineRubyOptions): TextStyle {
  const style: TextStyle = {};
  const color = span.style?.color ?? options.color;
  const ratio = span.style?.sizeRatio ?? options.sizeRatio;

  if (options.style === 'paren-small') {
    style.fontSize = { magnitude: readingFontSize(options.fontSizeAt(span.startIndex), ratio), unit: 'PT' };
  }
  if (options.style === 'superscript') {
    style.baselineOffset = 'SUPERSCRIPT';
  }
  if (options.style !== 'paren' || span.style?.color) {
    if (color && isValidHexColor(color)) {
      style.foregroundColor = { color: { rgbColor: hexToRgbFraction(color) } };
    }
  }
  if (span.style?.fontFamily) {
    style.weightedFontFamily = { fontFamily: span.style.fontFamily };
  }
  return style;
}

/**
 * ルビの区間から、読みを差し込む batchUpdate のリクエストを作る。
 * 1回の batchUpdate で送る前提で、次の順に並べる:
 *   1. insertText(後ろの位置から順に。前の位置の index がずれないように)
 *   2. updateTextStyle・createNamedRange(すべて差し込んだ後の index で指定する)
 */
export function buildInlineRubyRequests(spans: readonly RubySpan[], options: InlineRubyOptions): DocsRequest[] {
  const sorted = [...spans].sort((a, b) => a.endIndex - b.endIndex);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1] as RubySpan;
    const cur = sorted[i] as RubySpan;
    if (cur.startIndex < prev.endIndex) throw new Error('ルビの区間が重なっています');
  }

  const inserts: DocsRequest[] = [];
  const after: DocsRequest[] = [];
  let shift = 0; // それより前に差し込んだ文字数(差し込み後の index を求めるため)

  for (const span of sorted) {
    const text = readingText(options.style, span.reading);
    const at = span.endIndex; // 差し込む前の index
    inserts.push({
      insertText: { location: { index: at, ...where(options) }, text },
    });

    const start = at + shift;
    const range: DocsRange = { startIndex: start, endIndex: start + text.length, ...where(options) };
    const textStyle = readingTextStyle(span, options);
    const fields = Object.keys(textStyle);
    if (fields.length > 0) {
      after.push({ updateTextStyle: { range, textStyle, fields: fields.join(',') } });
    }
    after.push({ createNamedRange: { name: RUBI_RANGE_NAME, range } });
    shift += text.length;
  }

  return [...inserts.reverse(), ...after];
}
