/**
 * Google Docs API(v1)の型のうち、この拡張機能が使う部分だけを書き出したもの。
 * フィールド名は REST API の JSON と同じ(https://developers.google.com/workspace/docs/api/reference/rest/v1/documents)。
 *
 * 文字の位置(index)は UTF-16 のコード単位で数える。本文は index 1 から始まる(PHASE0_FINDINGS.md 2節)。
 */

export interface Dimension {
  magnitude?: number;
  unit?: 'PT' | 'UNIT_UNSPECIFIED';
}

export interface RgbColor {
  red?: number;
  green?: number;
  blue?: number;
}

export interface OptionalColor {
  color?: { rgbColor?: RgbColor };
}

export type BaselineOffset = 'BASELINE_OFFSET_UNSPECIFIED' | 'NONE' | 'SUPERSCRIPT' | 'SUBSCRIPT';

export interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  smallCaps?: boolean;
  fontSize?: Dimension;
  foregroundColor?: OptionalColor;
  backgroundColor?: OptionalColor;
  baselineOffset?: BaselineOffset;
  weightedFontFamily?: { fontFamily?: string; weight?: number };
  link?: { url?: string } | null;
}

export type NamedStyleType =
  | 'NORMAL_TEXT'
  | 'TITLE'
  | 'SUBTITLE'
  | 'HEADING_1'
  | 'HEADING_2'
  | 'HEADING_3'
  | 'HEADING_4'
  | 'HEADING_5'
  | 'HEADING_6'
  | 'NAMED_STYLE_TYPE_UNSPECIFIED';

export interface ParagraphStyle {
  namedStyleType?: NamedStyleType;
  alignment?: string;
  [key: string]: unknown;
}

export interface ParagraphElement {
  startIndex?: number;
  endIndex?: number;
  textRun?: { content?: string; textStyle?: TextStyle; suggestedInsertionIds?: string[]; suggestedDeletionIds?: string[] };
  // 文字以外の要素(画像・自動テキスト・脚注の参照・改ページなど)。それぞれ index を 1 つ使う。
  inlineObjectElement?: unknown;
  autoText?: unknown;
  pageBreak?: unknown;
  columnBreak?: unknown;
  footnoteReference?: unknown;
  horizontalRule?: unknown;
  equation?: unknown;
  person?: unknown;
  richLink?: unknown;
}

export interface Paragraph {
  elements?: ParagraphElement[];
  paragraphStyle?: ParagraphStyle;
  bullet?: unknown;
}

export interface TableCell {
  startIndex?: number;
  endIndex?: number;
  content?: StructuralElement[];
}

export interface TableRow {
  startIndex?: number;
  endIndex?: number;
  tableCells?: TableCell[];
}

export interface Table {
  rows?: number;
  columns?: number;
  tableRows?: TableRow[];
}

export interface StructuralElement {
  startIndex?: number;
  endIndex?: number;
  paragraph?: Paragraph;
  sectionBreak?: unknown;
  table?: Table;
  tableOfContents?: { content?: StructuralElement[] };
}

export interface Body {
  content?: StructuralElement[];
}

export interface DocsRange {
  startIndex?: number;
  endIndex?: number;
  segmentId?: string;
  tabId?: string;
}

export interface NamedRange {
  namedRangeId?: string;
  name?: string;
  ranges?: DocsRange[];
}

export type NamedRanges = Record<string, { name?: string; namedRanges?: NamedRange[] }>;

export interface NamedStyle {
  namedStyleType?: NamedStyleType;
  textStyle?: TextStyle;
  paragraphStyle?: ParagraphStyle;
}

export interface NamedStyles {
  styles?: NamedStyle[];
}

export interface DocumentStyle {
  pageSize?: { width?: Dimension; height?: Dimension };
  marginLeft?: Dimension;
  marginRight?: Dimension;
}

/** ヘッダー・フッター・脚注。それぞれ独自の index を持ち、位置・範囲には segmentId(= その ID)を付ける。 */
export interface DocsSubSegment {
  headerId?: string;
  footerId?: string;
  footnoteId?: string;
  content?: StructuralElement[];
}

export interface DocumentTab {
  body?: Body;
  headers?: Record<string, DocsSubSegment>;
  footers?: Record<string, DocsSubSegment>;
  footnotes?: Record<string, DocsSubSegment>;
  documentStyle?: DocumentStyle;
  namedRanges?: NamedRanges;
  namedStyles?: NamedStyles;
}

export interface Tab {
  tabProperties?: { tabId?: string; title?: string; index?: number };
  documentTab?: DocumentTab;
  childTabs?: Tab[];
}

/** documents.get の返り値。includeTabsContent=true なら tabs に、そうでなければ body などに中身が入る。 */
export interface DocsDocument {
  documentId?: string;
  title?: string;
  revisionId?: string;
  body?: Body;
  namedRanges?: NamedRanges;
  namedStyles?: NamedStyles;
  documentStyle?: DocumentStyle;
  headers?: Record<string, DocsSubSegment>;
  footers?: Record<string, DocsSubSegment>;
  footnotes?: Record<string, DocsSubSegment>;
  tabs?: Tab[];
}

export interface Location {
  index: number;
  segmentId?: string;
  tabId?: string;
}

/** documents.batchUpdate の1件のリクエスト(この拡張機能が使う種類だけ)。 */
export type DocsRequest =
  | { insertText: { location: Location; text: string } }
  | { updateTextStyle: { range: DocsRange; textStyle: TextStyle; fields: string } }
  | { createNamedRange: { name: string; range: DocsRange } }
  | { deleteContentRange: { range: DocsRange } }
  | { deleteNamedRange: { name?: string; namedRangeId?: string; tabsCriteria?: { tabIds: string[] } } }
  | { updateParagraphStyle: { range: DocsRange; paragraphStyle: ParagraphStyle; fields: string } }
  | { insertTable: { rows: number; columns: number; location: Location } }
  | { updateTableCellStyle: { tableStartLocation: Location; tableCellStyle: TableCellStyle; fields: string } }
  | { updateTableRowStyle: { tableStartLocation: Location; rowIndices: number[]; tableRowStyle: { preventOverflow?: boolean }; fields: string } }
  | {
      updateTableColumnProperties: {
        tableStartLocation: Location;
        columnIndices: number[];
        tableColumnProperties: { widthType: 'FIXED_WIDTH' | 'EVENLY_DISTRIBUTED'; width?: Dimension };
        fields: string;
      };
    };

export interface TableCellBorder {
  color?: OptionalColor;
  width?: Dimension;
  dashStyle?: 'SOLID' | 'DOT' | 'DASH';
}

export interface TableCellStyle {
  borderTop?: TableCellBorder;
  borderBottom?: TableCellBorder;
  borderLeft?: TableCellBorder;
  borderRight?: TableCellBorder;
  paddingTop?: Dimension;
  paddingBottom?: Dimension;
  paddingLeft?: Dimension;
  paddingRight?: Dimension;
  contentAlignment?: 'TOP' | 'MIDDLE' | 'BOTTOM';
}
