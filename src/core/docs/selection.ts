/**
 * 「選択した範囲のルビを消す」ための、選択した文字と文書の位置の対応(chrome に依存しない純粋な関数)。
 *
 * Googleドキュメントの編集画面は canvas に描かれていて、選択範囲の位置(文書の index)は画面からも API からも取れない。
 * 取れるのは「選択した文字」だけ(src/worker/selection.ts。2026-10-05 実機で確認)。そこで、選択した文字の並びを
 * 文書の本文の中から探して、位置を決める。
 *
 * 【比べ方】空白・改行・タブは、コピーした文字と API の文字で入り方が違う(表のセルの区切りなど)ので、どちらからも
 * 取り除いてから比べる。文字の順番は、コピーも API も文書の順(表は左のセルから、セルの中は上の段落から)。
 *
 * 【同じ並びが何か所もあるとき】どれを選んだのかは分からないので、消さずに、広く選び直してもらう(呼び出し側)。
 */
import { OBJECT_PLACEHOLDER } from './extract';
import type { StructuralElement } from './types';

/** 比べるときに取り除く文字(空白・改行・制御文字・幅のない文字・文字以外の要素の印)。 */
const IGNORED = /[\s\u0000-\u001f\u007f ​-‍⁠﻿￼]/u;

/** 本文の文字を、比べるための1本の文字列にしたもの。 */
export interface FlatText {
  /** 取り除く文字を除いた文字の並び(UTF-16) */
  text: string;
  /** text の i 番目(UTF-16 の単位)の、文書の index */
  indices: number[];
}

/** 比べるための形にする(取り除く文字を除く)。 */
export function normalizeSelectionText(text: string): string {
  let out = '';
  for (const ch of text) if (!IGNORED.test(ch)) out += ch;
  return out;
}

/** 本文(表・目次の中も含む)の文字を、文書の順に並べる。 */
export function flattenContent(content: readonly StructuralElement[] | undefined): FlatText {
  let text = '';
  const indices: number[] = [];
  const visit = (elements: readonly StructuralElement[] | undefined): void => {
    for (const el of elements ?? []) {
      if (el.paragraph) {
        for (const pe of el.paragraph.elements ?? []) {
          const content = pe.textRun?.content;
          if (content === undefined || typeof pe.endIndex !== 'number') continue;
          const start = pe.startIndex ?? 0;
          let offset = 0;
          for (const ch of content) {
            if (!IGNORED.test(ch) && ch !== OBJECT_PLACEHOLDER) {
              for (let k = 0; k < ch.length; k++) {
                text += ch[k];
                indices.push(start + offset + k);
              }
            }
            offset += ch.length;
          }
        }
      } else if (el.table) {
        for (const row of el.table.tableRows ?? []) for (const cell of row.tableCells ?? []) visit(cell.content);
      } else if (el.tableOfContents) {
        visit(el.tableOfContents.content);
      }
    }
  };
  visit(content);
  return { text, indices };
}

/**
 * 選択した文字の並びが、本文のどこにあるか(文書の index の範囲。endIndex は最後の文字の次)。見つかった順にすべて返す。
 * 選択が空(取り除く文字だけ)なら空の配列。
 */
export function findSelectionRanges(flat: FlatText, selection: string): { startIndex: number; endIndex: number }[] {
  const needle = normalizeSelectionText(selection);
  if (needle.length === 0) return [];
  const out: { startIndex: number; endIndex: number }[] = [];
  let from = 0;
  for (;;) {
    const at = flat.text.indexOf(needle, from);
    if (at < 0) break;
    out.push({ startIndex: flat.indices[at] as number, endIndex: (flat.indices[at + needle.length - 1] as number) + 1 });
    from = at + needle.length;
  }
  return out;
}

/**
 * 本文に差し込んだ読みが、選択の範囲にかかるか。読みは漢字のすぐ後ろに入っているので、漢字だけを選んだとき
 * (選択の終わりが読みの始まり)も、その読みを対象にする。
 */
export function inlineReadingInSelection(
  reading: { startIndex: number; endIndex: number },
  selection: { startIndex: number; endIndex: number }
): boolean {
  return reading.startIndex <= selection.endIndex && reading.endIndex > selection.startIndex;
}

/** 表ルビのまとまり(1つの段落)が、選択の範囲にかかるか。かかれば、その段落全体を元に戻す。 */
export function groupInSelection(
  group: { startIndex: number; endIndex: number },
  selection: { startIndex: number; endIndex: number }
): boolean {
  return group.startIndex < selection.endIndex && group.endIndex > selection.startIndex;
}
