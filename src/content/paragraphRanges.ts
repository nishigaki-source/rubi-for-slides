/**
 * 段落の文字列から、ルビ区間(どの文字にどんな読みを振るか)を求める。
 * 日本語は形態素解析(service worker の kuromoji)の結果から、中国語は拼音から作る。
 */
import type { ReadingServiceOptions } from '../core/types';
import { fetchPinyinRanges } from './pinyinClient';
import { computeGlobalRubyRanges } from './rubyPlan';
import { tokenizeText } from './tokenizeClient';
import type { GlobalRubyRange } from './overlayRenderer';

export async function fetchParagraphRanges(
  text: string,
  readingOptions: ReadingServiceOptions
): Promise<GlobalRubyRange[]> {
  if (readingOptions.rubyLanguage === 'zh') return fetchPinyinRanges(text);
  const tokens = await tokenizeText(text);
  return computeGlobalRubyRanges(tokens, readingOptions);
}
