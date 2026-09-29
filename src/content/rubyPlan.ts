/**
 * ReadingService(core)の出力を、画面表示(モードA)とスライドへの書き込み(モードB)
 * の両方が共有できる形に変換する層。
 */
import { buildRubyTokens } from '../core/reading';
import type { ReadingServiceOptions, TokenizedWord } from '../core/types';
import {
  computeParagraphRubyPlan,
  type GlobalRubyRange,
  type RubyPlacement,
  type RubyPlanLayoutOptions,
} from './overlayRenderer';
import type { ExtractedParagraph } from './textExtractor';

/**
 * トークン列から、段落内のグローバル文字インデックスで表したルビ区間列を組み立てる。
 * 各トークンの `surface.length` をオフセットとして積み上げていく。
 */
export function computeGlobalRubyRanges(
  tokens: TokenizedWord[],
  readingOptions: ReadingServiceOptions
): GlobalRubyRange[] {
  const rubyTokens = buildRubyTokens(tokens, readingOptions);
  const globalRanges: GlobalRubyRange[] = [];
  let offset = 0;
  for (const rubyToken of rubyTokens) {
    for (const range of rubyToken.rubyRanges) {
      globalRanges.push({
        start: offset + range.start,
        end: offset + range.end,
        kana: range.kana,
        style: range.style,
      });
    }
    offset += rubyToken.surface.length;
  }
  return globalRanges;
}

/**
 * 1段落分の「どこに・何の読みを・どのサイズで」ルビを置くかを計算する。
 * モード A(`overlayRenderer.ts` 経由の表示)・モード B(`writeController.ts` 経由の
 * 書き込み)の両方がこの関数を通じて同じ計算結果を得る。
 *
 * @param styleDefaults 全体設定のフォント・色(ユーザー辞書による個別上書きが無い
 * ルビのフォールバック値)
 */
export function computeParagraphPlan(
  paragraph: ExtractedParagraph,
  tokens: TokenizedWord[],
  readingOptions: ReadingServiceOptions,
  sizeRatio: number,
  styleDefaults?: { fontFamily?: string; color?: string },
  layout?: RubyPlanLayoutOptions
): RubyPlacement[] {
  return computeParagraphPlanFromRanges(
    paragraph,
    computeGlobalRubyRanges(tokens, readingOptions),
    sizeRatio,
    styleDefaults,
    layout
  );
}

/** 読みの区間がすでに分かっているとき(中国語の拼音など)の配置の計算。 */
export function computeParagraphPlanFromRanges(
  paragraph: ExtractedParagraph,
  ranges: GlobalRubyRange[],
  sizeRatio: number,
  styleDefaults?: { fontFamily?: string; color?: string },
  layout?: RubyPlanLayoutOptions
): RubyPlacement[] {
  return computeParagraphRubyPlan(paragraph.chars, ranges, sizeRatio, styleDefaults, layout);
}
