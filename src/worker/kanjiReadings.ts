/**
 * 漢字ごとの読みの表(拡張機能にパッケージされた静的 JSON、KANJIDIC2 由来)の読み込み。
 * 学年別漢字配当表(gradeTable.ts)と同じく、content script には worker 経由で渡す。
 */
import { parseKanjiReadingTable, type KanjiReadingTable } from '../core/kanjiSplit';
import { t } from '../shared/i18n';

let cached: KanjiReadingTable | null = null;

export async function getKanjiReadings(): Promise<KanjiReadingTable> {
  if (cached) return cached;
  const res = await fetch(chrome.runtime.getURL('data/kanji-readings.json'));
  if (!res.ok) {
    throw new Error(t('errorKanjiReadingsLoadFailed', String(res.status)));
  }
  cached = parseKanjiReadingTable(await res.json());
  return cached;
}
