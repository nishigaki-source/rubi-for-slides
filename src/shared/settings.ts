/**
 * 表示設定(ON/OFF・ルビのサイズ比・省く漢字など)の chrome.storage.sync 経由での
 * 読み書き。content script と popup の両方から使われる共通モジュール。
 */
import { isSkipKanjiSetting, skipKanjiFromLegacyGrade, type SkipKanjiSetting } from '../core/knownKanji';
import type { RubyMode } from '../core/types';

export interface RubiSettings {
  /** ルビ表示の ON/OFF */
  enabled: boolean;
  /** 本文フォントサイズに対するルビの比率(0.3〜0.8程度を想定) */
  sizeRatio: number;
  /**
   * 省く漢字(もう習った漢字にはルビを振らない)。'none' = 省かない(既定、PLAN.md の決定事項)。
   * 小学校の学年('grade-1'〜'grade-6')か JLPT のレベル('jlpt-n5'〜'jlpt-n1')から1つを選ぶ
   * (src/core/knownKanji.ts)。v0.7.0 までの gradeFilterMaxGrade は読み込み時に移行する。
   */
  skipKanji: SkipKanjiSetting;
  /** ルビのフォント(全体設定の既定値。単語ごとにユーザー辞書で上書き可能、PLAN.md 3.7節) */
  fontFamily: string;
  /** ルビの色(`#rrggbb`。全体設定の既定値。単語ごとにユーザー辞書で上書き可能) */
  color: string;
  /**
   * ルビの振り方。既定は漢字ごと(学習用途で「どの漢字をどう読むか」がわかるように。
   * v0.7.0 で追加、利用者からの要望)。漢字ごとに分けられない語は熟語ルビになる。
   */
  rubyMode: RubyMode;
}

export const DEFAULT_SETTINGS: RubiSettings = {
  enabled: true,
  sizeRatio: 0.5,
  skipKanji: 'none',
  fontFamily: 'Arial',
  color: '#1a1a1a',
  rubyMode: 'per-kanji',
};

const STORAGE_KEY = 'rubiSettings';

/**
 * 保存された値(古い版の形を含む)を今の形にそろえる。
 * v0.7.0 までは学年フィルタを `gradeFilterMaxGrade: 1〜6 | null` で保存していた。
 */
export function normalizeSettings(value: unknown): RubiSettings {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Partial<RubiSettings> & {
    gradeFilterMaxGrade?: unknown;
  };
  const { gradeFilterMaxGrade, ...rest } = raw;
  const skipKanji = isSkipKanjiSetting(rest.skipKanji) ? rest.skipKanji : skipKanjiFromLegacyGrade(gradeFilterMaxGrade);
  return { ...DEFAULT_SETTINGS, ...rest, skipKanji };
}

export async function loadSettings(): Promise<RubiSettings> {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  return normalizeSettings(stored[STORAGE_KEY]);
}

export async function saveSettings(settings: RubiSettings): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
}

/** 設定変更を購読する。返り値の関数を呼ぶと購読解除できる。 */
export function onSettingsChanged(callback: (settings: RubiSettings) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ): void => {
    if (areaName !== 'sync') return;
    const change = changes[STORAGE_KEY];
    if (!change) return;
    callback(normalizeSettings(change.newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
