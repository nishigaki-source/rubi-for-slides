/**
 * service worker への拼音リクエストを送る薄いクライアント(試作)。
 */
import { nextRequestId, type PinyinRequest, type PinyinResponse } from '../core/messages';

export async function fetchPinyinRanges(text: string): Promise<{ start: number; end: number; kana: string }[]> {
  const request: PinyinRequest = { type: 'rubi/pinyin', requestId: nextRequestId(), text };
  const response = (await chrome.runtime.sendMessage(request)) as PinyinResponse;
  if (response.type === 'rubi/pinyin-error') throw new Error(response.message);
  return response.ranges;
}
