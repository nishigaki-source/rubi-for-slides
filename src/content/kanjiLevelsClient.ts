/**
 * service worker から、漢字ごとの段階の表(学年・JLPT)を取得する薄いクライアント。
 * 取得結果はタブ内でメモリキャッシュする(「省く漢字」を使うときだけ取得する)。
 */
import type { KanjiLevelTables } from '../core/knownKanji';
import { nextRequestId, type KanjiLevelsRequest, type KanjiLevelsResponse } from '../core/messages';

let cache: Promise<KanjiLevelTables> | null = null;

export function getKanjiLevels(): Promise<KanjiLevelTables> {
  if (!cache) {
    cache = (async () => {
      const request: KanjiLevelsRequest = { type: 'rubi/get-kanji-levels', requestId: nextRequestId() };
      const response = (await chrome.runtime.sendMessage(request)) as KanjiLevelsResponse;
      if (response.type === 'rubi/get-kanji-levels-error') {
        throw new Error(response.message);
      }
      return response.kanjiLevels;
    })().catch((err: unknown) => {
      cache = null; // 失敗時は次回再取得できるようキャッシュをクリア
      throw err;
    });
  }
  return cache;
}
