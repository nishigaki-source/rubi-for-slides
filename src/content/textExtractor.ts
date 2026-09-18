/**
 * SVG から「段落単位のテキスト」と「各文字と DOM 要素の対応」を抽出する。
 * ReadingService(core)に渡すプレーンテキストと、ルビ描画時に文字の位置を
 * 引き当てるための情報の両方をここで組み立てる。
 */
import { getGroupContainer, getMainCanvasTextElements } from './selectors';

export interface ExtractedChar {
  el: SVGTextElement;
  char: string;
  /**
   * el.textContent 内でのこの文字のインデックス(0始まり)。
   *
   * 【重要】Googleスライドは同じ書式が連続する文字を 1 つの <text> 要素に
   * まとめて描画することがある(実機テストで発見。例:「テッ」「う！」が
   * それぞれ 1 要素になるケースがあった)。PHASE0_FINDINGS.md で確認した
   * 「1 文字 1 <text> 要素」という前提はこのため常には成り立たない。
   * el.textContent.length > 1 の場合は el.getBoundingClientRect() では
   * この文字だけの位置を取れないため、overlayRenderer 側で
   * el.getExtentOfChar(charIndexInElement) を使う必要がある。
   */
  charIndexInElement: number;
}

export interface ExtractedParagraph {
  /** 段落を一意に識別するキー(再描画時の差分検出に使える) */
  key: string;
  /** 段落を構成する各文字と、対応する DOM 要素 */
  chars: ExtractedChar[];
  /** 段落全体のプレーンテキスト(chars を連結したもの。tokenize に渡す) */
  text: string;
}

const containerKeys = new WeakMap<Element, string>();
let containerKeyCounter = 0;

function keyFor(container: Element): string {
  const existing = containerKeys.get(container);
  if (existing) return existing;
  const key = container.id ? `id:${container.id}` : `anon:${containerKeyCounter++}`;
  containerKeys.set(container, key);
  return key;
}

/**
 * 編集キャンバス全体を走査し、段落ごとにグループ化した文字列と文字要素を返す。
 * 呼び出し側(overlayRenderer)は、段落ごとの text を tokenize し、その結果の
 * RubyRange(文字インデックス範囲)を chars 配列に引き当てて位置を計算する。
 */
export function extractParagraphs(root: ParentNode = document): ExtractedParagraph[] {
  const textEls = getMainCanvasTextElements(root);
  const order: string[] = [];
  const byKey = new Map<string, ExtractedParagraph>();

  for (const el of textEls) {
    const text = el.textContent ?? '';
    if (text.length === 0) continue;

    const container = getGroupContainer(el);
    const key = keyFor(container);

    let paragraph = byKey.get(key);
    if (!paragraph) {
      paragraph = { key, chars: [], text: '' };
      byKey.set(key, paragraph);
      order.push(key);
    }

    // 1 つの <text> 要素に複数文字が含まれる場合(上記コメント参照)は
    // 1 文字ずつ分解して chars 配列に追加する。こうすることで chars の
    // インデックスが常に「文字インデックス」と一致し、paragraph.text と
    // ズレなくなる。
    const charList = Array.from(text);
    charList.forEach((char, idx) => {
      paragraph.chars.push({ el, char, charIndexInElement: idx });
    });
    paragraph.text += text;
  }

  return order.map((key) => byKey.get(key) as ExtractedParagraph);
}
