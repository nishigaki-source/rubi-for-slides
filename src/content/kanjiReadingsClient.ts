/**
 * service worker から漢字ごとの読みの表を取得する薄いクライアント(タブ内でメモリキャッシュ)。
 */
import type { KanjiReadingTable } from '../core/kanjiSplit';
import { nextRequestId, type KanjiReadingsRequest, type KanjiReadingsResponse } from '../core/messages';

let cache: Promise<KanjiReadingTable> | null = null;

export function getKanjiReadings(): Promise<KanjiReadingTable> {
  if (!cache) {
    cache = (async () => {
      const request: KanjiReadingsRequest = { type: 'rubi/get-kanji-readings', requestId: nextRequestId() };
      const response = (await chrome.runtime.sendMessage(request)) as KanjiReadingsResponse;
      if (response.type === 'rubi/get-kanji-readings-error') {
        throw new Error(response.message);
      }
      return response.kanjiReadings;
    })().catch((err: unknown) => {
      cache = null; // 失敗時は次回再取得できるようキャッシュをクリア
      throw err;
    });
  }
  return cache;
}
