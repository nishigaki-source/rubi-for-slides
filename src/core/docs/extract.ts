/**
 * documents.get の返り値から、ルビを振る対象の段落を取り出す(chrome に依存しない純粋な関数)。
 *
 * 段落のテキストは textRun の content をつなげたもの。画像などの文字以外の要素は、その要素が使う
 * index の数だけ U+FFFC(オブジェクト置換文字)で埋める。こうすると「段落の先頭からの位置(UTF-16)」と
 * 「文書の index」が常に `paragraph.startIndex + 位置` で対応する。
 */
import type {
  Body,
  DocsDocument,
  DocsSubSegment,
  DocumentStyle,
  NamedRanges,
  NamedStyles,
  NamedStyleType,
  ParagraphStyle,
  StructuralElement,
  Tab,
  TextStyle,
} from './types';

/** 文字以外の要素の代わりに入れる文字。漢字ではないのでルビは付かない。 */
export const OBJECT_PLACEHOLDER = '\uFFFC';

/** Googleドキュメントの「標準テキスト」の既定の文字の大きさ(pt)。namedStyles に無いときに使う。 */
export const DEFAULT_FONT_SIZE_PT = 11;

export interface DocTextRun {
  /** 文書の index(この文字を含む) */
  startIndex: number;
  /** 文書の index(この文字を含まない) */
  endIndex: number;
  text: string;
  textStyle: TextStyle;
  /** 段落のスタイルと namedStyles を考慮した、実際の文字の大きさ(pt) */
  fontSizePt: number;
}

export interface DocParagraph {
  /** 段落の最初の文字の index */
  startIndex: number;
  /** 段落の終わり(末尾の改行を含む)の index */
  endIndex: number;
  /** 段落のテキスト(末尾の改行を除く。文字以外の要素は OBJECT_PLACEHOLDER) */
  text: string;
  runs: DocTextRun[];
  namedStyleType: NamedStyleType;
  /** 段落の書式(見出し・配置・行間など。表ルビを元に戻すときに使う) */
  paragraphStyle: ParagraphStyle;
  /** 箇条書き・番号付きリストの段落か */
  hasBullet: boolean;
  /** 表のセルの中の段落か */
  inTable: boolean;
  /** 複数タブの文書でのタブ ID(includeTabsContent=true で取得したとき) */
  tabId?: string;
}

/** 1つのタブ(タブの無い取り方なら文書全体)の本文と、付随する情報。 */
/** ヘッダー・フッター・脚注の中身。位置・範囲には segmentId を付ける。 */
export interface DocSubSegment {
  segmentId: string;
  kind: 'header' | 'footer' | 'footnote';
  content: StructuralElement[];
}

export interface DocSegment {
  tabId?: string;
  title?: string;
  body: Body;
  /** ヘッダー・フッター・脚注 */
  subSegments: DocSubSegment[];
  namedRanges?: NamedRanges;
  namedStyles?: NamedStyles;
  documentStyle?: DocumentStyle;
}

function subSegmentsOf(src: {
  headers?: Record<string, DocsSubSegment>;
  footers?: Record<string, DocsSubSegment>;
  footnotes?: Record<string, DocsSubSegment>;
}): DocSubSegment[] {
  const out: DocSubSegment[] = [];
  const add = (kind: DocSubSegment['kind'], map: Record<string, DocsSubSegment> | undefined) => {
    for (const [id, seg] of Object.entries(map ?? {})) {
      if (seg.content) out.push({ segmentId: id, kind, content: seg.content });
    }
  };
  add('header', src.headers);
  add('footer', src.footers);
  add('footnote', src.footnotes);
  return out;
}

/**
 * 文書の本文をタブごとに並べる。includeTabsContent=true で取得した文書は tabs(子タブを含む)から、
 * そうでない文書は body から取る。
 */
export function listSegments(doc: DocsDocument): DocSegment[] {
  if (doc.tabs && doc.tabs.length > 0) {
    const out: DocSegment[] = [];
    const walk = (tabs: Tab[]): void => {
      for (const tab of tabs) {
        const dt = tab.documentTab;
        if (dt?.body) {
          out.push({
            tabId: tab.tabProperties?.tabId,
            title: tab.tabProperties?.title,
            body: dt.body,
            subSegments: subSegmentsOf(dt),
            namedRanges: dt.namedRanges,
            namedStyles: dt.namedStyles,
            documentStyle: dt.documentStyle,
          });
        }
        if (tab.childTabs) walk(tab.childTabs);
      }
    };
    walk(doc.tabs);
    return out;
  }
  if (!doc.body) return [];
  return [
    {
      body: doc.body,
      subSegments: subSegmentsOf(doc),
      namedRanges: doc.namedRanges,
      namedStyles: doc.namedStyles,
      documentStyle: doc.documentStyle,
    },
  ];
}

function styleFontSize(style: TextStyle | undefined): number | undefined {
  const m = style?.fontSize?.magnitude;
  return typeof m === 'number' && m > 0 ? m : undefined;
}

/** 段落の種類(見出しなど)ごとの既定の文字の大きさ。 */
export function namedStyleFontSize(namedStyles: NamedStyles | undefined, type: NamedStyleType): number {
  const find = (t: NamedStyleType): number | undefined =>
    styleFontSize(namedStyles?.styles?.find((s) => s.namedStyleType === t)?.textStyle);
  return find(type) ?? find('NORMAL_TEXT') ?? DEFAULT_FONT_SIZE_PT;
}

export interface ExtractOptions {
  tabId?: string;
  namedStyles?: NamedStyles;
  /** 表のセルの中の段落も取り出すか(既定: true) */
  includeTables?: boolean;
  /**
   * この表を飛ばすか(拡張機能が作った表ルビの表など)。飛ばした表の中の段落は取り出さない。
   * 引数は表の StructuralElement。
   */
  skipTable?: (element: StructuralElement) => boolean;
}

/** 本文(または表のセルの中身)から段落を順に取り出す。目次(tableOfContents)の中は対象外。 */
export function extractParagraphs(content: StructuralElement[] | undefined, options: ExtractOptions = {}): DocParagraph[] {
  const out: DocParagraph[] = [];
  const includeTables = options.includeTables ?? true;

  const visit = (elements: StructuralElement[] | undefined, inTable: boolean): void => {
    for (const el of elements ?? []) {
      if (el.paragraph) {
        const p = toDocParagraph(el, inTable, options);
        if (p) out.push(p);
      } else if (el.table && includeTables) {
        if (options.skipTable?.(el)) continue;
        for (const row of el.table.tableRows ?? []) {
          for (const cell of row.tableCells ?? []) visit(cell.content, true);
        }
      }
    }
  };
  visit(content, false);
  return out;
}

function toDocParagraph(el: StructuralElement, inTable: boolean, options: ExtractOptions): DocParagraph | null {
  const paragraph = el.paragraph;
  const elements = paragraph?.elements ?? [];
  if (elements.length === 0) return null;

  const namedStyleType = paragraph?.paragraphStyle?.namedStyleType ?? 'NORMAL_TEXT';
  const baseSize = namedStyleFontSize(options.namedStyles, namedStyleType);

  let text = '';
  const runs: DocTextRun[] = [];
  let startIndex: number | undefined;
  let cursor: number | undefined;

  for (const pe of elements) {
    // index が 0 の項目は API の応答で省かれる(ヘッダー・フッター・脚注の最初の段落。2026-09-29 に実物で確認)
    const e = pe.endIndex;
    const s = pe.startIndex ?? (typeof e === 'number' ? 0 : undefined);
    if (typeof s !== 'number' || typeof e !== 'number' || e < s) return null;
    if (startIndex === undefined) startIndex = s;
    // 要素の間にすき間があると index の対応が崩れるので、その段落は扱わない(安全側)
    if (cursor !== undefined && s !== cursor) return null;
    cursor = e;

    if (pe.textRun) {
      const content = pe.textRun.content ?? '';
      if (content.length !== e - s) return null;
      const textStyle = pe.textRun.textStyle ?? {};
      runs.push({ startIndex: s, endIndex: e, text: content, textStyle, fontSizePt: styleFontSize(textStyle) ?? baseSize });
      text += content;
    } else {
      text += OBJECT_PLACEHOLDER.repeat(e - s);
    }
  }
  if (startIndex === undefined || cursor === undefined) return null;

  // 段落の末尾の改行はテキストに含めない(index の範囲 endIndex には含める)
  if (text.endsWith('\n')) text = text.slice(0, -1);

  return {
    startIndex,
    endIndex: cursor,
    text,
    runs,
    namedStyleType,
    paragraphStyle: paragraph?.paragraphStyle ?? {},
    hasBullet: paragraph?.bullet !== undefined,
    inTable,
    ...(options.tabId !== undefined ? { tabId: options.tabId } : {}),
  };
}

/** 段落の書式のうち、表ルビの位置に関わるもの(段落の種類の既定を含めて決める)。 */
export interface ParagraphGeometry {
  alignment: 'START' | 'CENTER' | 'END' | 'JUSTIFIED';
  indentStartPt: number;
  indentEndPt: number;
  indentFirstLinePt: number;
}

export function paragraphGeometry(paragraph: DocParagraph, namedStyles: NamedStyles | undefined): ParagraphGeometry {
  const named = namedStyles?.styles?.find((s) => s.namedStyleType === paragraph.namedStyleType)?.paragraphStyle ?? {};
  const pick = (key: string): unknown => paragraph.paragraphStyle[key] ?? named[key];
  const pt = (key: string): number => {
    const v = pick(key) as { magnitude?: number } | undefined;
    return typeof v?.magnitude === 'number' ? v.magnitude : 0;
  };
  const a = pick('alignment');
  return {
    alignment: a === 'CENTER' || a === 'END' || a === 'JUSTIFIED' ? a : 'START',
    indentStartPt: pt('indentStart'),
    indentEndPt: pt('indentEnd'),
    indentFirstLinePt: pt('indentFirstLine'),
  };
}

/** 本文の幅(pt) = 用紙の幅 − 左右の余白。わからなければ A4・余白 1 インチの 451pt。 */
export function textAreaWidthPt(style: DocumentStyle | undefined): number {
  const w = style?.pageSize?.width?.magnitude;
  const l = style?.marginLeft?.magnitude ?? 72;
  const r = style?.marginRight?.magnitude ?? 72;
  return typeof w === 'number' && w > l + r ? w - l - r : 451.3;
}

/** 段落の種類(見出しなど)の既定のフォント名。namedStyles に無ければ undefined。 */
export function namedStyleFontFamily(namedStyles: NamedStyles | undefined, type: NamedStyleType): string | undefined {
  const find = (t: NamedStyleType): string | undefined =>
    namedStyles?.styles?.find((s) => s.namedStyleType === t)?.textStyle?.weightedFontFamily?.fontFamily;
  return find(type) ?? find('NORMAL_TEXT');
}

/** 段落の中の、指定した index の文字の大きさ(pt)。見つからなければ段落の最初の文字の大きさ。 */
export function fontSizeAt(paragraph: DocParagraph, index: number): number {
  const run = paragraph.runs.find((r) => index >= r.startIndex && index < r.endIndex) ?? paragraph.runs[0];
  return run?.fontSizePt ?? DEFAULT_FONT_SIZE_PT;
}
