/**
 * 結合テスト用の「偽の Google Docs」。documents.get と batchUpdate(この拡張機能が使うリクエストだけ)を、
 * 本文を1文字ずつの並び(index 1 から)として持って再現する。
 *
 * 実機で確かめた規則(PHASE0_FINDINGS.md 4.2節)に合わせている:
 * - 空の段落(index L)に insertTable(1×C) → L 改行 / L+1 表の始まり / L+2 行 / L+3+2j セル / L+4+2j セルの段落 / 大きさ 2C+3
 * - 差し込んだ文字は、直前の文字(段落の先頭なら直後の文字・改行)の書式を引き継ぐ
 * - 名前付き範囲: 範囲の中に差し込むと広がる。範囲の始まり・終わりちょうどに差し込むと広がらない
 * - updateParagraphStyle で段落の種類(namedStyleType)を変えると、その段落の文字の書式がリセットされる
 * - writeControl.requiredRevisionId が今の版と違えば拒否する
 *
 * Docs の本物とは細部が違う(隣の段落への影響など)。実機での確認の代わりではなく、流れ全体の回帰テスト用。
 */
import type { DocsDocument, DocsRequest, NamedRanges, ParagraphStyle, StructuralElement, TextStyle } from '@core/docs/types';

type Item =
  | { k: 'c'; ch: string; ts: TextStyle }
  | { k: 'nl'; ts: TextStyle; ps: ParagraphStyle; bullet?: boolean }
  | { k: 'ts'; widths: Record<number, number> }
  | { k: 'rs' }
  | { k: 'cs' }
  | { k: 'te' };

interface Named {
  id: string;
  name: string;
  start: number;
  end: number;
}

export interface FakeParagraph {
  text: string;
  style?: ParagraphStyle;
  bullet?: boolean;
  /** 文字ごとの書式を付ける範囲(段落の中の位置) */
  runs?: { from: number; to: number; ts: TextStyle }[];
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const isStructure = (x: Item | undefined): boolean => x?.k === 'ts' || x?.k === 'rs' || x?.k === 'cs' || x?.k === 'te';

export class FakeDocs {
  readonly documentId = 'fake-doc';
  readonly tabId = 't.0';
  private items: Item[] = [];
  private named: Named[] = [];
  private revision = 1;
  private nextId = 1;
  /** 送られた batchUpdate のリクエストの数(確認用) */
  requestCount = 0;

  constructor(paragraphs: FakeParagraph[]) {
    for (const p of paragraphs) {
      [...p.text].forEach((ch, i) => {
        const run = p.runs?.find((r) => i >= r.from && i < r.to);
        this.items.push({ k: 'c', ch, ts: clone(run?.ts ?? {}) });
      });
      this.items.push({ k: 'nl', ts: {}, ps: clone(p.style ?? { namedStyleType: 'NORMAL_TEXT' }), ...(p.bullet ? { bullet: true } : {}) });
    }
  }

  // ---- index と並びの位置: 本文の index i は items[i - 1] ----
  private pos(index: number): number {
    if (index < 1 || index > this.items.length + 1) throw new Error(`index が範囲外: ${index}`);
    return index - 1;
  }

  /** 位置 p を含む段落の、終わりの改行の位置 */
  private paragraphEnd(p: number): number {
    for (let i = p; i < this.items.length; i++) {
      if (this.items[i]?.k === 'nl') return i;
      if (isStructure(this.items[i])) break;
    }
    throw new Error(`段落の終わりが見つからない: ${p}`);
  }

  private insertItems(index: number, items: Item[]): void {
    const p = this.pos(index);
    this.items.splice(p, 0, ...items);
    // 名前付き範囲: 範囲の中(始まりより後・終わりより前)に入れたら広がる。始まり以前なら全体がずれる
    for (const r of this.named) {
      if (index <= r.start) {
        r.start += items.length;
        r.end += items.length;
      } else if (index < r.end) {
        r.end += items.length;
      }
    }
  }

  private deleteRange(s: number, e: number): void {
    if (e <= s) throw new Error('削除の範囲が空');
    const ps = this.pos(s);
    const deleted = this.items.slice(ps, ps + (e - s));
    // 表を途中で切る削除は拒否する(始まりと終わりの数が合わない)
    const starts = deleted.filter((x) => x.k === 'ts').length;
    const ends = deleted.filter((x) => x.k === 'te').length;
    if (starts !== ends) throw new Error('表の途中までの削除はできない');
    if (ps + (e - s) >= this.items.length) throw new Error('本文の最後の改行は消せない');
    this.items.splice(ps, e - s);
    const len = e - s;
    const move = (i: number) => (i >= e ? i - len : i > s ? s : i);
    this.named = this.named.map((r) => ({ ...r, start: move(r.start), end: move(r.end) })).filter((r) => r.end > r.start);
  }

  /** 差し込む文字が引き継ぐ書式: 直前が同じ段落の文字ならその書式、そうでなければ直後の文字・改行の書式 */
  private inheritedStyle(p: number): TextStyle {
    const prev = this.items[p - 1];
    if (prev && prev.k === 'c') return clone(prev.ts);
    const next = this.items[p];
    if (next && (next.k === 'c' || next.k === 'nl')) return clone(next.ts);
    return {};
  }

  private applyStyle(target: object, style: object, fields: string): void {
    const t = target as Record<string, unknown>;
    const s = style as Record<string, unknown>;
    for (const f of fields.split(',').map((x) => x.trim()).filter(Boolean)) {
      if (s[f] !== undefined) t[f] = clone(s[f]);
      else delete t[f];
    }
  }

  private checkTableStart(index: number): Extract<Item, { k: 'ts' }> {
    const item = this.items[this.pos(index)];
    if (item?.k !== 'ts') throw new Error(`表の始まりではない: ${index}`);
    return item;
  }

  batchUpdate(requests: readonly DocsRequest[], requiredRevisionId?: string): void {
    if (requiredRevisionId && requiredRevisionId !== String(this.revision)) throw new Error('文書が変わっている');
    for (const req of requests) this.apply(req);
    this.requestCount += requests.length;
    this.revision += 1;
  }

  private apply(req: DocsRequest): void {
    if ('insertText' in req) {
      const { index } = req.insertText.location;
      const p = this.pos(index);
      const ts = this.inheritedStyle(p);
      const end = this.items[this.paragraphEnd(p)] as Extract<Item, { k: 'nl' }>;
      const items: Item[] = [...req.insertText.text].map((ch) =>
        ch === '\n' ? { k: 'nl', ts: clone(ts), ps: clone(end.ps) } : { k: 'c', ch, ts: clone(ts) }
      );
      this.insertItems(index, items);
    } else if ('deleteContentRange' in req) {
      const { startIndex, endIndex } = req.deleteContentRange.range;
      // 本物の Docs API は、範囲に知らない項目があると 400 を返す(2026-10-05 実機: namedRangeId を入れてしまった)
      const unknown = Object.keys(req.deleteContentRange.range).filter((k) => !['startIndex', 'endIndex', 'segmentId', 'tabId'].includes(k));
      if (unknown.length > 0) throw new Error(`Unknown name "${unknown[0]}" at 'delete_content_range.range'`);
      this.deleteRange(startIndex as number, endIndex as number);
    } else if ('updateTextStyle' in req) {
      const { range, textStyle, fields } = req.updateTextStyle;
      for (let i = this.pos(range.startIndex as number); i < (range.endIndex as number) - 1; i++) {
        const item = this.items[i];
        if (item && (item.k === 'c' || item.k === 'nl')) this.applyStyle(item.ts, textStyle, fields);
      }
    } else if ('updateParagraphStyle' in req) {
      const { range, paragraphStyle, fields } = req.updateParagraphStyle;
      const s = this.pos(range.startIndex as number);
      const e = (range.endIndex as number) - 1;
      // 範囲に重なる段落(終わりの改行が s 以降で、段落の始まりが e より前)
      let paraStart = 0;
      for (let i = 0; i < this.items.length; i++) {
        const item = this.items[i];
        if (isStructure(item)) {
          paraStart = i + 1;
          continue;
        }
        if (item?.k !== 'nl') continue;
        if (i >= s && paraStart < Math.max(e, s + 1)) {
          const before = item.ps.namedStyleType;
          this.applyStyle(item.ps, paragraphStyle, fields);
          // 段落の種類を変えると、その段落の文字の書式がリセットされる
          if (fields.includes('namedStyleType') && item.ps.namedStyleType !== before) {
            for (let j = paraStart; j <= i; j++) {
              const x = this.items[j];
              if (x && (x.k === 'c' || x.k === 'nl')) x.ts = {};
            }
          }
        }
        paraStart = i + 1;
      }
    } else if ('createNamedRange' in req) {
      const { name, range } = req.createNamedRange;
      this.named.push({ id: `kix.${this.nextId++}`, name, start: range.startIndex as number, end: range.endIndex as number });
    } else if ('deleteNamedRange' in req) {
      const { name, namedRangeId } = req.deleteNamedRange;
      this.named = this.named.filter((r) => (namedRangeId ? r.id !== namedRangeId : r.name !== name));
    } else if ('insertTable' in req) {
      const { rows, columns, location } = req.insertTable;
      if (rows !== 1) throw new Error('1行の表だけ');
      const p = this.pos(location.index);
      if (this.paragraphEnd(p) !== p) throw new Error('表は空の段落にだけ入れる');
      const end = this.items[p] as Extract<Item, { k: 'nl' }>;
      const nl = (): Item => ({ k: 'nl', ts: clone(end.ts), ps: clone(end.ps) });
      const cells: Item[] = [];
      for (let j = 0; j < columns; j++) cells.push({ k: 'cs' }, nl());
      this.insertItems(location.index, [nl(), { k: 'ts', widths: {} }, { k: 'rs' }, ...cells, { k: 'te' }]);
    } else if ('updateTableCellStyle' in req) {
      this.checkTableStart(req.updateTableCellStyle.tableStartLocation.index);
    } else if ('updateTableRowStyle' in req) {
      this.checkTableStart(req.updateTableRowStyle.tableStartLocation.index);
    } else if ('updateTableColumnProperties' in req) {
      const t = this.checkTableStart(req.updateTableColumnProperties.tableStartLocation.index);
      for (const c of req.updateTableColumnProperties.columnIndices) {
        t.widths[c] = req.updateTableColumnProperties.tableColumnProperties.width?.magnitude ?? 0;
      }
    } else {
      throw new Error(`未対応のリクエスト: ${Object.keys(req)[0]}`);
    }
  }

  // ---- documents.get ----
  private paragraphElement(from: number, to: number): StructuralElement {
    const elements: NonNullable<NonNullable<StructuralElement['paragraph']>['elements']> = [];
    for (let i = from; i <= to; i++) {
      const item = this.items[i] as Extract<Item, { k: 'c' | 'nl' }>;
      const ch = item.k === 'c' ? item.ch : '\n';
      const last = elements[elements.length - 1];
      if (last?.textRun && JSON.stringify(last.textRun.textStyle ?? {}) === JSON.stringify(item.ts)) {
        last.textRun.content += ch;
        last.endIndex = i + 2;
      } else {
        elements.push({ startIndex: i + 1, endIndex: i + 2, textRun: { content: ch, textStyle: clone(item.ts) } });
      }
    }
    const nl = this.items[to] as Extract<Item, { k: 'nl' }>;
    return {
      startIndex: from + 1,
      endIndex: to + 2,
      paragraph: { elements, paragraphStyle: clone(nl.ps), ...(nl.bullet ? { bullet: {} } : {}) },
    };
  }

  private parse(from: number, to: number): StructuralElement[] {
    const out: StructuralElement[] = [];
    let i = from;
    while (i < to) {
      if (this.items[i]?.k === 'ts') {
        let j = i + 1;
        while (this.items[j]?.k !== 'te') j++;
        const cells: StructuralElement[][] = [];
        let k = i + 2; // 行の始まりの次
        while (k < j) {
          if (this.items[k]?.k !== 'cs') throw new Error('セルの始まりが無い');
          let next = k + 1;
          while (next < j && this.items[next]?.k !== 'cs') next++;
          cells.push(this.parse(k + 1, next));
          k = next;
        }
        out.push({
          startIndex: i + 1,
          endIndex: j + 2,
          table: { rows: 1, columns: cells.length, tableRows: [{ tableCells: cells.map((content) => ({ content })) }] },
        });
        i = j + 1;
        continue;
      }
      const end = this.paragraphEnd(i);
      out.push(this.paragraphElement(i, end));
      i = end + 1;
    }
    return out;
  }

  getDocument(): DocsDocument {
    const namedRanges: NamedRanges = {};
    for (const r of this.named) {
      const entry = (namedRanges[r.name] ??= { name: r.name, namedRanges: [] });
      entry.namedRanges?.push({ namedRangeId: r.id, name: r.name, ranges: [{ startIndex: r.start, endIndex: r.end, tabId: this.tabId }] });
    }
    return {
      documentId: this.documentId,
      revisionId: String(this.revision),
      tabs: [
        {
          tabProperties: { tabId: this.tabId },
          documentTab: {
            body: { content: [{ endIndex: 1, sectionBreak: {} }, ...this.parse(0, this.items.length)] },
            namedRanges,
            namedStyles: {
              styles: [
                { namedStyleType: 'NORMAL_TEXT', textStyle: { fontSize: { magnitude: 11, unit: 'PT' } } },
                { namedStyleType: 'HEADING_1', textStyle: { fontSize: { magnitude: 20, unit: 'PT' } } },
              ],
            },
            documentStyle: {
              pageSize: { width: { magnitude: 595.3, unit: 'PT' }, height: { magnitude: 841.9, unit: 'PT' } },
              marginLeft: { magnitude: 72, unit: 'PT' },
              marginRight: { magnitude: 72, unit: 'PT' },
            },
          },
        },
      ],
    };
  }

  /** 文書の中身を比べやすい形にする(同じ書式が続く文字のかたまりはまとめる)。 */
  snapshot(): string {
    const content = this.getDocument().tabs?.[0]?.documentTab?.body?.content ?? [];
    const walk = (els: StructuralElement[]): unknown[] =>
      els.flatMap((e): unknown[] => {
        if (e.table) return [['TABLE', e.table.tableRows?.map((r) => r.tableCells?.map((c) => walk(c.content ?? [])))]];
        if (!e.paragraph) return [];
        const runs = e.paragraph.elements?.map((x) => [x.textRun?.content, x.textRun?.textStyle]);
        return [[e.paragraph.paragraphStyle, !!e.paragraph.bullet, runs]];
      });
    return JSON.stringify(walk(content));
  }

  /** 本文のテキスト(表のセルの区切りは |) */
  text(): string {
    return this.items.map((x) => (x.k === 'c' ? x.ch : x.k === 'nl' ? '\n' : x.k === 'cs' ? '|' : '')).join('');
  }

  get tableCount(): number {
    return this.items.filter((x) => x.k === 'ts').length;
  }

  namedRangesOf(prefix: string): Named[] {
    return this.named.filter((r) => r.name.startsWith(prefix));
  }

  /** 先生が文字を打ったことにする(版は進める) */
  typeAt(index: number, text: string): void {
    this.apply({ insertText: { location: { index }, text } });
    this.revision += 1;
  }

  /** 先生が表を足したことにする */
  addTableAt(index: number): void {
    this.apply({ insertTable: { rows: 1, columns: 1, location: { index } } });
    this.revision += 1;
  }
}
