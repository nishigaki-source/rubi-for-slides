/**
 * 学年別漢字配当表(拡張機能にパッケージされた静的 JSON)の読み込み。
 * content script は web_accessible_resources を経由せず、この worker
 * 経由でデータを取得する(パッケージ内ファイルへの直接アクセス経路を
 * 増やさないための方針。PLAN.md 3.2節・非機能要件を参照)。
 */
import { sanitizeGradeTable } from '../core/gradeFilter';
import type { KanjiGradeTable } from '../core/types';

let cached: KanjiGradeTable | null = null;

export async function getGradeTable(): Promise<KanjiGradeTable> {
  if (cached) return cached;
  const url = chrome.runtime.getURL('data/kanji-grades.sample.json');
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`学年別漢字配当表の読み込みに失敗しました (status: ${res.status})`);
  }
  const raw: unknown = await res.json();
  cached = sanitizeGradeTable(raw);
  return cached;
}
