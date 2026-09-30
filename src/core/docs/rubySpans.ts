/**
 * 読みの計算結果(RubyToken[]、src/core/reading.ts)を、文書の index で表したルビの区間に変える。
 *
 * 【重要】RubyRange の start/end は「表層形の中の文字(コードポイント)の位置」で数えられている
 * (reading.ts は Array.from で文字に分けて処理する)。Docs API の index は UTF-16 のコード単位なので、
 * 𠮟・𩸽 のようなサロゲートペアの漢字があると位置がずれる。ここで UTF-16 の位置に直す。
 */
import type { RubyStyleOverride, RubyToken } from '../types';
import type { DocParagraph } from './extract';

export interface RubySpan {
  /** 漢字の区間の開始(文書の index、この文字を含む) */
  startIndex: number;
  /** 漢字の区間の終わり(文書の index、この文字を含まない)。読みはここに差し込む */
  endIndex: number;
  /** 漢字の文字列 */
  base: string;
  /** ひらがなの読み */
  reading: string;
  style?: RubyStyleOverride;
}

/** 文字列の先頭から n 文字(コードポイント)が UTF-16 で何単位か。 */
function utf16Length(text: string, codePoints: number): number {
  let units = 0;
  let count = 0;
  for (const ch of text) {
    if (count >= codePoints) break;
    units += ch.length;
    count++;
  }
  return units;
}

/**
 * 段落と、その段落のテキストをトークン化して得た RubyToken[] から、ルビの区間を作る。
 * トークンの表層形をつなげたものが段落のテキストと一致しなければ null(位置の対応が取れないので、その段落は扱わない)。
 */
export function rubySpansForParagraph(paragraph: DocParagraph, tokens: readonly RubyToken[]): RubySpan[] | null {
  if (tokens.map((t) => t.surface).join('') !== paragraph.text) return null;

  const spans: RubySpan[] = [];
  let offset = 0; // 段落のテキストの先頭からの位置(UTF-16)
  for (const token of tokens) {
    for (const range of token.rubyRanges) {
      if (range.end <= range.start || range.kana.length === 0) continue;
      const s = utf16Length(token.surface, range.start);
      const e = utf16Length(token.surface, range.end);
      spans.push({
        startIndex: paragraph.startIndex + offset + s,
        endIndex: paragraph.startIndex + offset + e,
        base: token.surface.slice(s, e),
        reading: range.kana,
        ...(range.style ? { style: range.style } : {}),
      });
    }
    offset += token.surface.length;
  }
  return spans;
}

/** 読みを付ける対象から外す区間(すでに付いているルビなど)と重なる区間を除く。 */
export function excludeOverlapping(
  spans: readonly RubySpan[],
  excluded: readonly { startIndex: number; endIndex: number }[]
): RubySpan[] {
  return spans.filter((s) => !excluded.some((x) => s.startIndex < x.endIndex && x.startIndex < s.endIndex));
}

/**
 * 隣り合う区間(すき間なく続いているもの)を1つにまとめる。読みは半角スペースでつなぐ。
 *
 * 中国語の拼音は漢字1文字ごとの区間になるが、本文に差し込む見せ方(括弧書き・上付き)で1文字ごとに
 * 読みを入れると「汉(hàn)字(zì)」になってしまう。続いた漢字を1つにして「汉字(hàn zì)」の形にする。
 * 途中に句読点・かな・空白があれば、そこで区切る(節ごとに読みが付く)。表ルビは1文字ごとの列が要るので、これは使わない。
 */
export function mergeAdjacentSpans(spans: readonly RubySpan[]): RubySpan[] {
  const merged: RubySpan[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && last.endIndex === span.startIndex && !last.style && !span.style) {
      merged[merged.length - 1] = {
        startIndex: last.startIndex,
        endIndex: span.endIndex,
        base: last.base + span.base,
        reading: `${last.reading} ${span.reading}`,
      };
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}
