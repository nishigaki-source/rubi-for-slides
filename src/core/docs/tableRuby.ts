/**
 * 見せ方 E・F(表ルビ、PLAN.md 3.4節)の batchUpdate リクエストを作る・元に戻す(chrome に依存しない純粋な関数)。
 *
 * 1つの段落を、行の数だけの「1行×N列の枠なしの表」に置き換える。1つのセルには「読み」と「本文」の2段落を入れる。
 *
 * 【表の index の規則】(2026-09-28 に実際の文書で確かめた。PHASE0_FINDINGS.md 4.2節)
 *   空の段落(index L)に insertTable(1行×C列)を送ると、次のように並ぶ:
 *     L: 改行だけの段落(表の前に自動で入る)
 *     L+1: 表の始まり / L+2: 行の始まり / L+3+2j: j 列目のセル / L+4+2j: そのセルの中の段落(改行だけ)
 *     表の大きさは 2C+3。表の後ろに、元の空の段落が続く
 *   同じ L に表を続けて入れると、後から入れた表が前に来る。そこで、行を後ろから順に入れる。
 *
 * 1つの段落から作った表と、その間の段落(表と表の間には必ず段落が入る)をまとめて名前付き範囲で囲み、
 * 名前に元の段落の書式と表の数を記録する(RUBI_TABLE_PREFIX + JSON)。元に戻すときは、表の中の「本文」の段落から
 * 文字と書式を集め、表の後ろに残した元の段落へ戻す。
 *
 * 【名前付き範囲は最後の表の終わりまで】(2026-09-28 実機で発見)名前付き範囲の中に文字を足すと範囲が広がる。
 * 元の段落(表の後ろの段落)まで範囲に入れると、そこに先生が打った文字まで「消す」ときに取り込んでしまう。
 * そこで範囲は「最初の段落の改行 〜 最後の表の終わり」にし、元の段落は範囲に入れない。
 */
import { hexToRgbFraction, isValidHexColor } from '../color';
import type { DocParagraph } from './extract';
import { readingFontOf, type RubyColumn } from './lineLayout';
import type { DocsRange, DocsRequest, Location, NamedRanges, ParagraphStyle, StructuralElement, TextStyle } from './types';

/** 表ルビのまとまりに付ける名前付き範囲の名前の先頭。後ろに元の段落の書式(JSON)が続く。 */
export const RUBI_TABLE_PREFIX = 'rubi-table:';

/** 表と表の間の段落の文字の大きさ(pt)。小さくして、行と行の間が空きすぎないようにする。 */
export const SPACER_SIZE_PT = 2;

/** 元に戻すときに使う、元の段落の書式の項目。 */
const SAVED_PARAGRAPH_FIELDS = [
  'namedStyleType',
  'alignment',
  'lineSpacing',
  'spaceAbove',
  'spaceBelow',
  'indentStart',
  'indentEnd',
  'indentFirstLine',
] as const;

type SavedParagraphStyle = Partial<Pick<ParagraphStyle, (typeof SAVED_PARAGRAPH_FIELDS)[number]>>;

/** 名前付き範囲の名前で、表の数を入れる項目の名前。 */
const TABLE_COUNT_KEY = 'tables';

/** 長さ(pt)で持つ項目。名前が長くなりすぎるときは、数だけにして短く書く。 */
const DIMENSION_FIELDS: readonly string[] = ['spaceAbove', 'spaceBelow', 'indentStart', 'indentEnd', 'indentFirstLine'];

/**
 * 元の段落の書式と表の数を名前付き範囲の名前にする(256 文字まで)。
 * 字下げ・余白をすべて持つ段落(Word から変換した文書に多い)は、そのままでは 256 文字を超える。そのときは
 * 長さを数だけ(pt)で書く(`"indentStart":36`)。以前は段落の種類だけを残していたため、ルビを消したときに
 * 揃え方・字下げ・行間が失われた(2026-10-05 修正)。
 */
export function encodeGroupName(style: ParagraphStyle, tableCount?: number): string {
  const saved: Record<string, unknown> = {};
  for (const f of SAVED_PARAGRAPH_FIELDS) if (style[f] !== undefined) saved[f] = style[f];
  const count = tableCount !== undefined ? { [TABLE_COUNT_KEY]: tableCount } : {};
  const name = RUBI_TABLE_PREFIX + JSON.stringify({ ...saved, ...count });
  if (name.length <= 256) return name;
  const compact: Record<string, unknown> = { ...saved };
  for (const f of DIMENSION_FIELDS) {
    const d = compact[f] as { magnitude?: number } | undefined;
    if (d !== undefined) compact[f] = Math.round((d.magnitude ?? 0) * 1000) / 1000;
  }
  const short = RUBI_TABLE_PREFIX + JSON.stringify({ ...compact, ...count });
  return short.length <= 256 ? short : RUBI_TABLE_PREFIX + JSON.stringify({ namedStyleType: style.namedStyleType, ...count });
}

export function decodeGroupName(name: string): { style: SavedParagraphStyle; tables?: number } | null {
  if (!name.startsWith(RUBI_TABLE_PREFIX)) return null;
  try {
    const v = JSON.parse(name.slice(RUBI_TABLE_PREFIX.length)) as unknown;
    if (typeof v !== 'object' || v === null) return null;
    const { [TABLE_COUNT_KEY]: tables, ...style } = v as Record<string, unknown>;
    // 短く書いた長さ(数だけ)を、Docs の形に戻す
    for (const f of DIMENSION_FIELDS) if (typeof style[f] === 'number') style[f] = PT(style[f] as number);
    return { style: style as SavedParagraphStyle, ...(typeof tables === 'number' ? { tables } : {}) };
  } catch {
    return null;
  }
}

export interface TableRubyOptions {
  tabId?: string;
  /** 読みの色(`#rrggbb`)。省略すると本文の色を引き継ぐ */
  color?: string;
}

const PT = (magnitude: number) => ({ magnitude, unit: 'PT' as const });
const NO_BORDER = { color: { color: {} }, width: PT(0), dashStyle: 'SOLID' as const };

/** 表ルビの位置の計算結果(テスト・確認用)。index はすべて書き込み後のもの。 */
export interface TableRubyLayout {
  groupStart: number;
  /** まとまり(名前付き範囲)の終わり = 最後の表の終わり = 元の段落の始まり */
  groupEnd: number;
  tableStarts: number[];
  spacers: number[];
  cells: { reading: [number, number]; base: [number, number] }[][];
}

/** 列の本文の書式(元の文字の書式 + 大きさ)。 */
function baseStyleOf(c: RubyColumn): TextStyle {
  return { ...c.textStyle, fontSize: PT(c.sizePt) };
}

/** 行の中で一番多い本文の書式(表全体に先に付け、違う列だけあとで直す)。 */
function commonBaseStyle(line: readonly RubyColumn[]): TextStyle {
  const counts = new Map<string, { style: TextStyle; n: number }>();
  for (const c of line) {
    if (c.base === '') continue; // 先頭の見えない列は数えない
    const style = baseStyleOf(c);
    const key = JSON.stringify(style);
    const e = counts.get(key) ?? { style, n: 0 };
    e.n += 1;
    counts.set(key, e);
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  if (!best) return { fontSize: PT(line[0]?.sizePt ?? 11) };
  // リンクは表全体には付けない(改行だけのセルにはリンクが付かず、あとから入れる文字も引き継がないため、
  // 行の大半がリンクの段落でリンクが消える)。リンクのある列は、7. で列ごとに付ける
  const withoutLink = { ...best.style };
  delete withoutLink.link;
  return withoutLink;
}

/**
 * 1つの段落を表ルビに置き換えるリクエストと、書き込み後の位置を返す。
 * 同じ batchUpdate で複数の段落を処理するときは、後ろの段落から順に並べること(前の段落の index がずれないように)。
 *
 * 【リクエストを減らす工夫】(2026-09-28 実機: 約4,000字で 9,395 件・42 秒かかったため)
 * - 表を入れる前に、空にした段落へ「左揃え・字下げなし・余白なし・行間 100%・2pt」を付けておく。
 *   新しく入る表の前後の段落と、表のセルの段落は、この書式を引き継ぐ(実機で確認)
 * - 表ごとに「中央揃え」と「その行で一番多い本文の書式」を1回ずつ送る。セルに入れる文字はこれを引き継ぐ(実機で確認)
 * - セルごとに送るのは、読みの書式と、本文の書式がほかと違う列だけ
 * - 同じ幅の列は、まとめて1回で幅を指定する
 */
export function buildTableRubyRequests(
  paragraph: DocParagraph,
  lines: readonly (readonly RubyColumn[])[],
  options: TableRubyOptions = {}
): { requests: DocsRequest[]; layout: TableRubyLayout } {
  if (lines.length === 0 || lines.some((l) => l.length === 0)) throw new Error('表ルビの行が空です');
  const tab = options.tabId !== undefined ? { tabId: options.tabId } : {};
  const loc = (index: number): Location => ({ index, ...tab });
  const range = (startIndex: number, endIndex: number): DocsRange => ({ startIndex, endIndex, ...tab });

  const ps = paragraph.startIndex;
  const textLength = paragraph.text.length;
  const requests: DocsRequest[] = [];

  // 1. 段落の文字を消して空の段落にし、表の前後の段落の書式を先に付けてから、行の表を後ろから順に入れる。
  //    Docs は表を、入れた段落の揃え方・字下げに合わせて動かす(2026-09-28 実機: 中央揃えの段落で表が中央に寄った)。
  //    字下げ・揃え方は先頭の見えない列(alignLines)で再現するので、ここでは左揃え・字下げなしにする。
  //    段落の種類(見出しなど)は変えない(最後に残る元の段落の見出しの ID を保つため。元に戻すときにこの段落へ文字を戻す)
  if (textLength > 0) requests.push({ deleteContentRange: { range: range(ps, ps + textLength) } });
  const spacerStyle: ParagraphStyle = {
    alignment: 'START',
    indentStart: PT(0),
    indentEnd: PT(0),
    indentFirstLine: PT(0),
    spaceAbove: PT(0),
    spaceBelow: PT(0),
    lineSpacing: 100,
  };
  requests.push({ updateParagraphStyle: { range: range(ps, ps + 1), paragraphStyle: spacerStyle, fields: Object.keys(spacerStyle).join(',') } });
  for (let k = lines.length - 1; k >= 0; k--) {
    requests.push({ insertTable: { rows: 1, columns: (lines[k] as RubyColumn[]).length, location: loc(ps) } });
  }

  // 2. セルに文字を入れる前の位置
  const tableStart0: number[] = [];
  const spacer0: number[] = [ps];
  let pos = ps + 1;
  for (const line of lines) {
    tableStart0.push(pos);
    pos += 2 * line.length + 3;
    spacer0.push(pos);
    pos += 1;
  }
  // 表の前後の段落を 2pt にする。新しく入った段落は文字の大きさを引き継がないことがあった(2026-09-28 実機)ので、
  // まとまり全体(元の段落の改行まで)に1回で付ける。セルの文字にはこのあと本文・読みの書式を付けるので上書きされる
  requests.push({ updateTextStyle: { range: range(ps, pos), textStyle: { fontSize: PT(SPACER_SIZE_PT) }, fields: 'fontSize' } });

  // 3. 文字を入れる前に、表ごとにセルの段落を中央揃えにし、行で一番多い本文の書式を付ける(入れる文字が引き継ぐ)。
  //    【注意】段落の種類(namedStyleType)を送ると、Docs はその段落の文字の書式と、隣の段落の書式まで初期状態に戻す
  //    (2026-09-28 実機: 表の前後の段落の 2pt・行間が消えて、行の間が大きく空いた)。
  //    - 普通の段落: セルは標準テキストを引き継ぐので、段落の種類は送らない。範囲はセルの中だけ(表の始まり・終わりの印は含めない)
  //    - 見出しなどの段落: セルが見出しにならないよう、文字を入れた後にセルごとに標準テキストにしてから書式を付ける(7.)
  const isNormal = paragraph.namedStyleType === 'NORMAL_TEXT';
  const commons = lines.map(commonBaseStyle);
  if (isNormal) {
    lines.forEach((line, k) => {
      const t0 = tableStart0[k] as number;
      const cellsRange = range(t0 + 3, t0 + 2 * line.length + 2);
      requests.push({ updateParagraphStyle: { range: cellsRange, paragraphStyle: { alignment: 'CENTER' }, fields: 'alignment' } });
      const common = commons[k] as TextStyle;
      requests.push({ updateTextStyle: { range: cellsRange, textStyle: common, fields: Object.keys(common).join(',') } });
    });
  }

  // 4. セルに「読み\n本文」を入れる(後ろのセルから)
  const cellTexts = lines.map((line) => line.map((c) => `${c.reading ?? ''}\n${c.base}`));
  const fills: { index: number; text: string }[] = [];
  lines.forEach((line, k) =>
    line.forEach((_c, j) => fills.push({ index: (tableStart0[k] as number) + 3 + 2 * j, text: cellTexts[k]?.[j] ?? '' }))
  );
  for (const f of [...fills].sort((a, b) => b.index - a.index)) {
    requests.push({ insertText: { location: loc(f.index), text: f.text } });
  }

  // 5. 文字を入れた後の位置
  const layout: TableRubyLayout = { groupStart: ps, groupEnd: 0, tableStarts: [], spacers: [ps], cells: [] };
  let shift = 0;
  lines.forEach((line, k) => {
    layout.tableStarts.push((tableStart0[k] as number) + shift);
    const row: TableRubyLayout['cells'][number] = [];
    line.forEach((c, j) => {
      const start = (tableStart0[k] as number) + 3 + 2 * j + shift;
      const readingLen = (c.reading ?? '').length + 1;
      row.push({ reading: [start, start + readingLen], base: [start + readingLen, start + readingLen + c.base.length + 1] });
      shift += (cellTexts[k]?.[j] ?? '').length;
    });
    layout.cells.push(row);
    layout.spacers.push((spacer0[k + 1] as number) + shift);
  });
  layout.groupEnd = layout.spacers[layout.spacers.length - 1] as number;

  // 6. 表の書式: 枠線なし・余白なし・下揃え・行がページをまたがない。列の幅は固定(同じ幅はまとめて)
  lines.forEach((line, k) => {
    const tableStartLocation = loc(layout.tableStarts[k] as number);
    requests.push({
      updateTableCellStyle: {
        tableStartLocation,
        tableCellStyle: {
          borderTop: NO_BORDER,
          borderBottom: NO_BORDER,
          borderLeft: NO_BORDER,
          borderRight: NO_BORDER,
          paddingTop: PT(0),
          paddingBottom: PT(0),
          paddingLeft: PT(0),
          paddingRight: PT(0),
          contentAlignment: 'BOTTOM',
        },
        fields: 'borderTop,borderBottom,borderLeft,borderRight,paddingTop,paddingBottom,paddingLeft,paddingRight,contentAlignment',
      },
    });
    requests.push({
      updateTableRowStyle: { tableStartLocation, rowIndices: [0], tableRowStyle: { preventOverflow: true }, fields: 'preventOverflow' },
    });
    const byWidth = new Map<number, number[]>();
    line.forEach((c, j) => byWidth.set(c.widthPt, [...(byWidth.get(c.widthPt) ?? []), j]));
    for (const [width, columnIndices] of byWidth) {
      requests.push({
        updateTableColumnProperties: {
          tableStartLocation,
          columnIndices,
          tableColumnProperties: { widthType: 'FIXED_WIDTH', width: PT(width) },
          fields: 'width,widthType',
        },
      });
    }
  });

  // 7. セルごと: 読みの書式(本文の書式から引き継いだ太字・下線なども外す)と、本文の書式がほかと違う列。
  //    見出しなどの段落では、先にセルを標準テキスト・中央揃えにしてから、本文の書式をすべての列に付ける
  const color = options.color && isValidHexColor(options.color) ? { color: { rgbColor: hexToRgbFraction(options.color) } } : undefined;
  lines.forEach((line, k) =>
    line.forEach((c, j) => {
      const cell = layout.cells[k]?.[j];
      if (!cell) return;
      if (!isNormal) {
        requests.push({
          updateParagraphStyle: {
            range: range(cell.reading[0], cell.base[1]),
            paragraphStyle: { namedStyleType: 'NORMAL_TEXT', alignment: 'CENTER' },
            fields: 'namedStyleType,alignment',
          },
        });
      }
      // 普通の段落では、表全体に付けた書式との違いだけを直す。見出しなどでは、表全体には何も付けていない
      const common = isNormal ? (commons[k] as TextStyle) : {};
      const own = c.base === '' ? (commons[k] as TextStyle) : baseStyleOf(c);
      // ユーザー辞書でこの語の読みの色を指定していれば、その色
      const ownColor =
        c.readingStyle?.color && isValidHexColor(c.readingStyle.color)
          ? { color: { rgbColor: hexToRgbFraction(c.readingStyle.color) } }
          : color;
      const readingStyle: TextStyle = {
        fontSize: PT(c.readingSizePt),
        weightedFontFamily: { fontFamily: readingFontOf(c).family },
        bold: false,
        italic: false,
        ...(ownColor ? { foregroundColor: ownColor } : {}),
      };
      // 本文から引き継いだ項目のうち、読みで指定しないもの(下線・リンクなど)は、値なしで fields に入れて外す
      const readingFields = [...new Set([...Object.keys(readingStyle), ...Object.keys(common)])];
      requests.push({
        updateTextStyle: { range: range(cell.reading[0], cell.reading[1]), textStyle: readingStyle, fields: readingFields.join(',') },
      });
      if (JSON.stringify(own) !== JSON.stringify(common)) {
        const fields = [...new Set([...Object.keys(own), ...Object.keys(common)])];
        requests.push({ updateTextStyle: { range: range(cell.base[0], cell.base[1]), textStyle: own, fields: fields.join(',') } });
      }
    })
  );

  // 8. まとまり(最初の段落の改行 〜 最後の表の終わり)に名前付き範囲(名前に元の段落の書式と表の数)
  requests.push({
    createNamedRange: {
      name: encodeGroupName(paragraph.paragraphStyle, lines.length),
      range: range(layout.groupStart, layout.groupEnd),
    },
  });

  return { requests, layout };
}

/** 表ルビのまとまり(名前付き範囲)。 */
export interface TableRubyGroup {
  name: string;
  startIndex: number;
  endIndex: number;
  style: SavedParagraphStyle;
  /** 書き込んだときの表の数(古い形の名前には無い) */
  tables?: number;
  /** 名前付き範囲の ID(消すときに、このまとまりの範囲だけを消すため) */
  namedRangeId?: string;
}

/** 表ルビのまとまりを集める(本文のものだけ)。index の小さい順。 */
export function collectTableGroups(namedRanges: NamedRanges | undefined): TableRubyGroup[] {
  const out: TableRubyGroup[] = [];
  for (const [name, entry] of Object.entries(namedRanges ?? {})) {
    const decoded = decodeGroupName(name);
    if (!decoded) continue;
    for (const nr of entry.namedRanges ?? []) {
      for (const r of nr.ranges ?? []) {
        if (r.segmentId) continue;
        if (typeof r.startIndex !== 'number' || typeof r.endIndex !== 'number' || r.endIndex <= r.startIndex) continue;
        out.push({
          name,
          startIndex: r.startIndex,
          endIndex: r.endIndex,
          style: decoded.style,
          ...(decoded.tables !== undefined ? { tables: decoded.tables } : {}),
          ...(nr.namedRangeId ? { namedRangeId: nr.namedRangeId } : {}),
        });
      }
    }
  }
  return out.sort((a, b) => a.startIndex - b.startIndex);
}

/** まとまりの範囲にある、本文の直下の要素(表と段落)。古い形(元の段落まで範囲に入れていた)なら元の段落は除く。 */
function groupElements(content: readonly StructuralElement[], group: TableRubyGroup): { elements: StructuralElement[]; end: number } {
  let end = group.endIndex;
  const inRange = (e: StructuralElement) => typeof e.startIndex === 'number' && e.startIndex >= group.startIndex && (e.endIndex ?? 0) <= end;
  let elements = content.filter(inRange);
  const last = elements[elements.length - 1];
  if (last?.paragraph && last.endIndex === end && elements.some((e) => e.table)) {
    end = last.startIndex as number;
    elements = elements.slice(0, -1);
  }
  return { elements, end };
}

/**
 * 表ルビのまとまりから、元の段落の文字と書式を取り出す。表の中の本文(セルの最後の段落)に加え、
 * 表と表の間の段落に先生が打った文字があれば、それも順番どおりに残す。
 */
export function readGroupText(content: readonly StructuralElement[], group: TableRubyGroup): { text: string; style: TextStyle }[] {
  const pieces: { text: string; style: TextStyle }[] = [];
  const pushRuns = (e: StructuralElement | undefined) => {
    for (const el of e?.paragraph?.elements ?? []) {
      const text = (el.textRun?.content ?? '').replace(/\n$/, '');
      if (text) pieces.push({ text, style: el.textRun?.textStyle ?? {} });
    }
  };
  for (const e of groupElements(content, group).elements) {
    if (e.paragraph) {
      pushRuns(e);
      continue;
    }
    for (const cell of e.table?.tableRows?.[0]?.tableCells ?? []) {
      // 本文はセルの最後の段落(利用者が読みの段落を消していても、最後の段落を本文とみなす)
      const paragraphs = (cell.content ?? []).filter((x) => x.paragraph);
      pushRuns(paragraphs[paragraphs.length - 1]);
    }
  }
  return pieces;
}

/**
 * 表ルビのまとまりを元の段落に戻すリクエスト。まとまり(最初の段落の改行 〜 最後の表)を消すと、
 * 表の後ろに残しておいた元の段落が前に詰まるので、その先頭へ元の文字を入れ、文字と段落の書式を戻す。
 * 複数のまとまりを戻すときは後ろから順に並べること。
 *
 * まとまりの中の表の数が書き込んだときと違う(先生が表を足した・消したなど)ときは、何を消してよいか
 * わからないので null を返す(そのまとまりは消さない)。
 *
 * 表のセルでは本文の文字の大きさを明示していた(セルの段落は標準テキストなので)。inheritedSizePt(元の段落の種類の
 * 既定の大きさ)と同じ大きさの文字は、明示をやめて段落の種類の既定に戻す。
 */
export function buildRestoreTableRubyRequests(
  content: readonly StructuralElement[],
  group: TableRubyGroup,
  tabId?: string,
  inheritedSizePt?: number
): DocsRequest[] | null {
  const tab = tabId !== undefined ? { tabId } : {};
  const range = (startIndex: number, endIndex: number): DocsRange => ({ startIndex, endIndex, ...tab });
  const { elements, end } = groupElements(content, group);
  const tableCount = elements.filter((e) => e.table).length;
  if (tableCount === 0 || (group.tables !== undefined && tableCount !== group.tables)) return null;

  const pieces = readGroupText(content, group);
  const text = pieces.map((p) => p.text).join('');
  const gs = group.startIndex;
  // 元の段落(まとまりのすぐ後ろ)の改行の位置。消して文字を入れた後の位置に直す
  const original = content.find((e) => e.startIndex === end && e.paragraph);
  const newlineAfter = original?.endIndex !== undefined ? original.endIndex - 1 - (end - gs) + text.length : gs + text.length;

  const requests: DocsRequest[] = [{ deleteContentRange: { range: range(gs, end) } }];
  if (text) requests.push({ insertText: { location: { index: gs, ...tab }, text } });

  // 段落の書式を先に戻す(段落の種類 namedStyleType を変えると、Docs が文字の書式をリセットするため)
  requests.push({
    updateParagraphStyle: {
      range: range(gs, gs + text.length + 1),
      paragraphStyle: { ...group.style },
      fields: SAVED_PARAGRAPH_FIELDS.join(','),
    },
  });
  // 入れた文字は、元の段落(表の間の段落として 2pt にしていた)の書式を引き継ぐので、大きさは必ず指定し直す
  const withoutInherited = (style: TextStyle): TextStyle => {
    if (inheritedSizePt === undefined || style.fontSize?.magnitude !== inheritedSizePt) return style;
    const rest = { ...style };
    delete rest.fontSize;
    return rest;
  };
  let offset = 0;
  for (const p of pieces) {
    const style = withoutInherited(p.style);
    const fields = [...new Set([...Object.keys(style), 'fontSize'])];
    requests.push({
      updateTextStyle: { range: range(gs + offset, gs + offset + p.text.length), textStyle: style, fields: fields.join(',') },
    });
    offset += p.text.length;
  }
  // 段落の改行の大きさも、最後の文字に合わせる
  const last = pieces[pieces.length - 1];
  const lastStyle = last ? withoutInherited(last.style) : {};
  requests.push({
    updateTextStyle: {
      range: range(newlineAfter, newlineAfter + 1),
      textStyle: lastStyle.fontSize ? { fontSize: lastStyle.fontSize } : {},
      fields: 'fontSize',
    },
  });
  return requests;
}
