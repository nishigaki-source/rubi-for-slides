/**
 * 表示設定(ON/OFF・ルビのサイズ比・学年フィルタ)の chrome.storage.sync 経由での
 * 読み書き。content script と popup の両方から使われる共通モジュール。
 */
import type { RubyMode } from '../core/types';

export interface RubiSettings {
  /** ルビ表示の ON/OFF */
  enabled: boolean;
  /** 本文フォントサイズに対するルビの比率(0.3〜0.8程度を想定) */
  sizeRatio: number;
  /**
   * 学年フィルタ。null = フィルタなし(既定、PLAN.md の決定事項)。
   * 1〜6を指定すると、その学年以下で習う漢字だけのトークンにはルビを振らない。
   */
  gradeFilterMaxGrade: number | null;
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
  gradeFilterMaxGrade: null,
  fontFamily: 'Arial',
  color: '#1a1a1a',
  rubyMode: 'per-kanji',
};

const STORAGE_KEY = 'rubiSettings';

export async function loadSettings(): Promise<RubiSettings> {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY] as Partial<RubiSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...value };
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
    const value = change.newValue as Partial<RubiSettings> | undefined;
    callback({ ...DEFAULT_SETTINGS, ...value });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
