/**
 * 「省く漢字」の判定に使う、漢字ごとの段階の表(学年・JLPT、拡張機能にパッケージされた静的 JSON)の読み込み。
 * content script は web_accessible_resources を経由せず、この worker 経由でデータを取得する
 * (パッケージ内ファイルへの直接アクセス経路を増やさないための方針。PLAN.md 3.2節・非機能要件を参照)。
 */
import { parseKanjiLevelTables, type KanjiLevelTables } from '../core/knownKanji';
import { t } from '../shared/i18n';

let cached: KanjiLevelTables | null = null;

export async function getKanjiLevels(): Promise<KanjiLevelTables> {
  if (cached) return cached;
  const res = await fetch(chrome.runtime.getURL('data/kanji-levels.json'));
  if (!res.ok) {
    throw new Error(t('errorKanjiLevelsLoadFailed', String(res.status)));
  }
  cached = parseKanjiLevelTables(await res.json());
  return cached;
}
