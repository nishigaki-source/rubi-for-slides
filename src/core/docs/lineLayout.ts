/**
 * 表ルビ(見せ方 E・F、PLAN.md 3.4節)の行の分け方を決める(chrome に依存しない純粋な関数)。
 *
 * 表は行の途中で折り返せないので、段落を「実際の1行」ずつに分け、1行を1つの表にする。
 * 1行の中は「列」の並びで、列は「漢字の語(読み付き)」か「続くかな・記号(読みなし)」。
 * 列の幅は max(本文の幅, 読みの幅) + 余白。文字の幅は呼び出し側が測る(measure。ドキュメントのページ内の
 * canvas.measureText で測った値を使う。PHASE0_FINDINGS.md 4.1節)。
 *
 * 段落の中で文字の大きさ・フォント・書式が変わる場合(太字の語など)に備え、単位ごとに書式を持たせ、
 * 書式の違う単位は同じ列にまとめない。
 */
import type { RubyStyleOverride } from '../types';
import type { DocParagraph, DocTextRun } from './extract';
import type { RubySpan } from './rubySpans';
import type { TextStyle } from './types';

/** 文字の書き方(幅を測るときのフォント)。 */
export interface FontSpec {
  family: string;
  bold: boolean;
  italic: boolean;
}

/** 段落を分けた単位。漢字の語は1単位、それ以外は1文字ずつ。 */
export interface RubyUnit {
  base: string;
  reading: string | null;
  /** 文書の index(この文字を含む) */
  startIndex: number;
  /** 文書の index(この文字を含まない) */
  endIndex: number;
  /** 本文の文字の大きさ(pt) */
  sizePt: number;
  font: FontSpec;
  /** 元の文字の書式(表のセルへ写す) */
  textStyle: TextStyle;
  /** ユーザー辞書で、この語の読みだけに指定した見た目(色・大きさ・フォント) */
  readingStyle?: RubyStyleOverride;
  /** 読みのフォント(設定の「ルビのフォント」。省くと本文と同じ) */
  readingFamily?: string;
}

/** 表の1列。 */
export interface RubyColumn extends RubyUnit {
  /** 読みの文字の大きさ(pt)。F で縮めた場合はその値 */
  readingSizePt: number;
  /** 列の幅(pt) */
  widthPt: number;
}

export interface LineLayoutOptions {
  /** 1行に使える幅(pt)。本文の幅より少し小さくしておく */
  maxWidthPt: number;
  /** 1行目だけ、使える幅から引く幅(pt)。1行目の字下げ */
  firstLineIndentPt?: number;
  /** 1つの表の列の上限(Docs の画面では 20 列までだが、API では 50 列まで作れた) */
  maxColumns: number;
  /** 読みの大きさ(本文に対する比率) */
  readingRatio: number;
  /** text を font・sizePt で書いたときの幅(pt)。大きさに比例すること */
  measure: (text: string, sizePt: number, font: FontSpec) => number;
  /** 列の幅に足す余白(pt)。既定 0.5 */
  paddingPt?: number;
  /**
   * F: 読みの幅が「本文の幅 + allowanceEm 文字分」を超える語は、読みを小さくしてそこに収める。
   * ただし本文の minRatio 倍より、また minPt より小さくはしない(読めなくならないように)。
   * もともとの読みの大きさが minPt より小さいときは、それより大きくはしない。省略すると縮めない(E)。
   */
  shrink?: { allowanceEm: number; minRatio: number; minPt?: number };
}

/** 行の先頭に来てはいけない文字(行頭禁則)。 */
export const NO_LINE_START = '、。，．,.・：；？！?!ー―…‥」』）)］｝〕〉》】〙〗';
/** 行の末尾に来てはいけない文字(行末禁則)。 */
export const NO_LINE_END = '「『（(［｛〔〈《【〘〖';

/** 英数字(続けて1語として扱い、行の境目で分けない)。 */
const WORD_CHAR = /[0-9A-Za-z０-９Ａ-Ｚａ-ｚ.,:%％]/;
const DIGIT = /[0-9０-９]/;
const KANJI = /[\u3400-\u9fff\uf900-\ufaff々〆]/u;

/**
 * a と b の間で行を分けてよいか。行頭禁則・行末禁則のほか、英数字の途中と、数字と助数詞の間(30|分)では分けない。
 */
export function canBreakBetween(a: RubyUnit, b: RubyUnit): boolean {
  const last = a.base.slice(-1);
  const first = b.base.charAt(0);
  if (NO_LINE_START.includes(first) || NO_LINE_END.includes(last)) return false;
  if (WORD_CHAR.test(last) && WORD_CHAR.test(first)) return false;
  if (DIGIT.test(last) && KANJI.test(first)) return false;
  return true;
}

/** 既定のフォント(Googleドキュメントの標準テキスト)。 */
export const DEFAULT_FONT: FontSpec = { family: 'Arial', bold: false, italic: false };

export function fontOf(run: DocTextRun | undefined, fallbackFamily = DEFAULT_FONT.family): FontSpec {
  const s = run?.textStyle;
  return {
    family: s?.weightedFontFamily?.fontFamily ?? fallbackFamily,
    bold: s?.bold === true || (s?.weightedFontFamily?.weight ?? 400) >= 600,
    italic: s?.italic === true,
  };
}

function runAt(paragraph: DocParagraph, index: number): DocTextRun | undefined {
  return paragraph.runs.find((r) => index >= r.startIndex && index < r.endIndex) ?? paragraph.runs[0];
}

/**
 * 段落とルビの区間から、単位の並びを作る。ルビの区間は段落の中にあること。
 * defaultFamily は段落の種類(見出しなど)の既定のフォント。
 */
export function unitsForParagraph(
  paragraph: DocParagraph,
  spans: readonly RubySpan[],
  defaultFamily = DEFAULT_FONT.family,
  readingFamily?: string
): RubyUnit[] {
  const sorted = spans
    .filter((s) => s.startIndex >= paragraph.startIndex && s.endIndex <= paragraph.startIndex + paragraph.text.length)
    .sort((a, b) => a.startIndex - b.startIndex);

  const units: RubyUnit[] = [];
  let offset = 0; // 段落のテキストの先頭からの位置(UTF-16)
  let k = 0;
  const text = paragraph.text;
  while (offset < text.length) {
    const index = paragraph.startIndex + offset;
    const run = runAt(paragraph, index);
    // 読みのフォントは、読みのない列(かな)の空の読みの段落にも付ける。本文のフォントのままだと、丸ゴシックなど
    // 行の高さが大きいフォントで読みの行が高くなり、読みと本文の間が空く(2026-09-29 実機で確認)
    const common = {
      sizePt: run?.fontSizePt ?? 11,
      font: fontOf(run, defaultFamily),
      textStyle: run?.textStyle ?? {},
      ...(readingFamily ? { readingFamily } : {}),
    };
    const span = sorted[k];
    if (span && span.startIndex === index) {
      units.push({
        base: span.base,
        reading: span.reading,
        startIndex: span.startIndex,
        endIndex: span.endIndex,
        ...common,
        ...(span.style ? { readingStyle: span.style } : {}),
      });
      offset += span.endIndex - span.startIndex;
      k++;
      continue;
    }
    const ch = String.fromCodePoint(text.codePointAt(offset) as number);
    units.push({ base: ch, reading: null, startIndex: index, endIndex: index + ch.length, ...common });
    offset += ch.length;
  }
  return units;
}

function sameLook(a: RubyUnit, b: RubyUnit): boolean {
  return a.sizePt === b.sizePt && JSON.stringify(a.textStyle) === JSON.stringify(b.textStyle) && JSON.stringify(a.font) === JSON.stringify(b.font);
}

/**
 * 読みを書くフォント: ユーザー辞書でこの語に指定したフォント → 設定の「ルビのフォント」→ 本文と同じ、の順。
 * (2026-09-29: 本文のフォントに合わせると、丸ゴシックなど下の余白が大きいフォントで読みと本文の間が空いた。
 *  スライド版と同じ「ルビのフォント」の設定(既定 Arial)を使う)
 */
export function readingFontOf(unit: RubyUnit): FontSpec {
  const family = unit.readingStyle?.fontFamily ?? unit.readingFamily;
  return family ? { family, bold: false, italic: false } : unit.font;
}

function readingSize(unit: RubyUnit, options: LineLayoutOptions): number {
  const ratio = unit.readingStyle?.sizeRatio ?? options.readingRatio;
  const normal = Math.round(unit.sizePt * ratio * 10) / 10;
  if (!unit.reading || !options.shrink) return normal;
  const baseW = options.measure(unit.base, unit.sizePt, unit.font);
  const allowed = baseW + options.shrink.allowanceEm * unit.sizePt;
  const perPt = options.measure(unit.reading, 1, readingFontOf(unit));
  if (perPt <= 0 || perPt * normal <= allowed) return normal;
  const fitted = Math.floor((allowed / perPt) * 10) / 10;
  const floor = Math.max(Math.round(unit.sizePt * options.shrink.minRatio * 10) / 10, options.shrink.minPt ?? 0);
  return Math.min(normal, Math.max(floor, fitted));
}

/** 単位の並びを列にまとめる(読みの無い単位が、同じ書式で続いたら1列にする)。 */
export function toColumns(units: readonly RubyUnit[], options: LineLayoutOptions): RubyColumn[] {
  const merged: RubyUnit[] = [];
  for (const u of units) {
    const last = merged[merged.length - 1];
    if (!u.reading && last && !last.reading && last.endIndex === u.startIndex && sameLook(last, u)) {
      merged[merged.length - 1] = { ...last, base: last.base + u.base, endIndex: u.endIndex };
    } else {
      merged.push({ ...u });
    }
  }
  const padding = options.paddingPt ?? 0.5;
  return merged.map((c) => {
    const rs = readingSize(c, options);
    const w = Math.max(options.measure(c.base, c.sizePt, c.font), c.reading ? options.measure(c.reading, rs, readingFontOf(c)) : 0);
    // 幅は 1pt 単位に切り上げる(同じ幅の列をまとめて指定し、リクエストを減らすため)
    return { ...c, readingSizePt: rs, widthPt: Math.ceil(w + padding) };
  });
}

function lineWidth(columns: readonly RubyColumn[]): number {
  return columns.reduce((sum, c) => sum + c.widthPt, 0);
}

/**
 * 単位の並びを行に分ける。先頭から詰めていき、幅か列数の上限を超えたら次の行にする。
 * 分けてはいけない所(canBreakBetween)にかかるときは、分けてよい所まで前の単位を次の行へ送る
 * (送れる所が無ければ、そのまま分ける)。1単位だけで幅を超える場合は、その単位だけで1行にする。
 */
export function layoutRubyLines(units: readonly RubyUnit[], options: LineLayoutOptions): RubyColumn[][] {
  const lines: RubyUnit[][] = [];
  let cur: RubyUnit[] = [];

  const fits = (candidate: RubyUnit[]): boolean => {
    const cols = toColumns(candidate, options);
    const max = options.maxWidthPt - (lines.length === 0 ? (options.firstLineIndentPt ?? 0) : 0);
    return lineWidth(cols) <= max && cols.length <= options.maxColumns;
  };

  for (const u of units) {
    const candidate = [...cur, u];
    if (cur.length === 0 || fits(candidate)) {
      cur = candidate;
      continue;
    }
    let cut = cur.length; // cur[0..cut) を今の行に残す
    while (cut > 1 && !canBreakBetween(cur[cut - 1] as RubyUnit, (cut < cur.length ? cur[cut] : u) as RubyUnit)) cut--;
    if (cut <= 1 && !canBreakBetween(cur[0] as RubyUnit, (cur[1] ?? u) as RubyUnit)) cut = cur.length; // 送れる所が無い
    lines.push(cur.slice(0, cut));
    cur = [...cur.slice(cut), u];
  }
  if (cur.length > 0) lines.push(cur);
  return lines.map((line) => toColumns(line, options));
}

/** 先頭に入れる見えない列を、これより狭いときは入れない(pt)。 */
const MIN_PAD_PT = 2;

/**
 * 表は API で字下げ・中央揃え・右揃えにできないので、行の先頭に「見えない空の列」を入れて再現する。
 * availableWidthPt は字下げを除いた、1行に使える幅(左の字下げの位置から右の字下げの位置まで)。
 *
 * 【字下げの数え方】Docs の indentFirstLine は indentStart に足す量ではなく、余白からの1行目の位置そのもの
 * (2026-09-28 実機: indentStart 36pt・indentFirstLine 36pt の段落は、1行目も 36pt から始まった。
 * 箇条書きの段落も indentFirstLine 18pt・indentStart 36pt で、記号が 18pt・文字が 36pt)。
 */
export function alignLines(
  lines: readonly RubyColumn[][],
  geometry: { alignment: 'START' | 'CENTER' | 'END' | 'JUSTIFIED'; indentStartPt: number; indentFirstLinePt: number },
  availableWidthPt: number
): RubyColumn[][] {
  return lines.map((line, i) => {
    const first = line[0];
    if (!first) return line;
    const width = lineWidth(line);
    let pad = i === 0 ? geometry.indentFirstLinePt : geometry.indentStartPt;
    if (geometry.alignment === 'CENTER') pad = geometry.indentStartPt + Math.max(0, (availableWidthPt - width) / 2);
    if (geometry.alignment === 'END') pad = geometry.indentStartPt + Math.max(0, availableWidthPt - width);
    pad = Math.round(pad);
    if (pad < MIN_PAD_PT) return line;
    const padColumn: RubyColumn = {
      base: '',
      reading: null,
      startIndex: first.startIndex,
      endIndex: first.startIndex,
      sizePt: 1,
      font: first.font,
      textStyle: {},
      readingSizePt: 1,
      widthPt: pad,
    };
    return [padColumn, ...line];
  });
}

/** 段落の中の文字(と読み)を、フォントごとに重複なく集める(ページで幅を測るため)。 */
export function charactersToMeasure(units: readonly RubyUnit[]): Map<string, { font: FontSpec; chars: Set<string> }> {
  const out = new Map<string, { font: FontSpec; chars: Set<string> }>();
  const add = (font: FontSpec, text: string) => {
    const key = fontKey(font);
    const entry = out.get(key) ?? { font, chars: new Set<string>() };
    for (const ch of text) entry.chars.add(ch);
    out.set(key, entry);
  };
  for (const u of units) {
    add(u.font, u.base);
    if (u.reading) add(readingFontOf(u), u.reading);
  }
  return out;
}

export function fontKey(font: FontSpec): string {
  return `${font.bold ? 'b' : ''}${font.italic ? 'i' : ''}|${font.family}`;
}

/**
 * 文字ごとの幅の表(100px で測った px)から measure を作る。表に無い文字は、全角なら 1em、半角なら 0.55em とみなす。
 * canvas の px と Docs の pt は 1pt = 1.333px の関係だが、100px で測った幅 w は「大きさ s pt で w/100×s pt」になる。
 */
export function measureFromTable(table: ReadonlyMap<string, ReadonlyMap<string, number>>): LineLayoutOptions['measure'] {
  return (text, sizePt, font) => {
    const widths = table.get(fontKey(font));
    let em = 0;
    for (const ch of text) {
      const w = widths?.get(ch);
      em += w !== undefined ? w / 100 : (ch.codePointAt(0) as number) > 0xff ? 1 : 0.55;
    }
    return em * sizePt;
  };
}
