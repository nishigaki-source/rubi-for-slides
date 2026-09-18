/**
 * ReadingService(core)と DOM(content)をつなぐオーケストレーション層(モード A)。
 * extractParagraphs -> tokenizeText(worker) -> computeGlobalRubyRanges(core+content共通)
 * -> renderParagraphRuby、という一連の流れを担う。
 */
import type { ReadingServiceOptions } from '../core/types';
import { clearOverlay, renderParagraphRuby, setOverlayVisible } from './overlayRenderer';
import { computeGlobalRubyRanges } from './rubyPlan';
import { extractParagraphs } from './textExtractor';
import { tokenizeText } from './tokenizeClient';

export interface RubyPipelineOptions {
  enabled: boolean;
  sizeRatio: number;
  readingOptions: ReadingServiceOptions;
  /** 全体設定のフォント(省略時はオーバーレイ側の既定値) */
  fontFamily?: string;
  /** 全体設定の色(省略時はオーバーレイ側の既定値) */
  color?: string;
}

/**
 * 現在の DOM を読み取り、ルビを再計算してオーバーレイに描画する。
 * 段落ごとの tokenize リクエストは並列で投げる。
 */
export async function runRubyPipeline(options: RubyPipelineOptions): Promise<void> {
  if (!options.enabled) {
    setOverlayVisible(false);
    clearOverlay();
    return;
  }

  const paragraphs = extractParagraphs();
  clearOverlay();
  setOverlayVisible(true);

  await Promise.all(
    paragraphs.map(async (paragraph) => {
      const text = paragraph.text;
      if (text.trim().length === 0) return;

      let tokens;
      try {
        tokens = await tokenizeText(text);
      } catch (err) {
        console.error('[ルビふり for Googleスライド] トークン化に失敗しました:', err);
        return;
      }

      const globalRanges = computeGlobalRubyRanges(tokens, options.readingOptions);

      renderParagraphRuby(paragraph.chars, globalRanges, {
        enabled: true,
        sizeRatio: options.sizeRatio,
        fontFamily: options.fontFamily,
        color: options.color,
      });
    })
  );
}
