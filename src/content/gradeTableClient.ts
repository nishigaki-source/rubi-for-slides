/**
 * service worker から学年別漢字配当表を取得する薄いクライアント。
 * 取得結果はタブ内でメモリキャッシュする(学年フィルタを使うユーザーは
 * 少数と想定されるため、必要になったときだけ取得する)。
 */
import { nextRequestId, type GradeTableRequest, type GradeTableResponse } from '../core/messages';
import type { KanjiGradeTable } from '../core/types';

let cache: Promise<KanjiGradeTable> | null = null;

export function getGradeTable(): Promise<KanjiGradeTable> {
  if (!cache) {
    cache = (async () => {
      const request: GradeTableRequest = { type: 'rubi/get-grade-table', requestId: nextRequestId() };
      const response = (await chrome.runtime.sendMessage(request)) as GradeTableResponse;
      if (response.type === 'rubi/get-grade-table-error') {
        throw new Error(response.message);
      }
      return response.gradeTable;
    })().catch((err: unknown) => {
      cache = null; // 失敗時は次回再取得できるようキャッシュをクリア
      throw err;
    });
  }
  return cache;
}
