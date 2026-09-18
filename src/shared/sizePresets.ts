/**
 * ルビのサイズを「小・中・大」の3段階から選べるようにするための固定値。
 * パネル(全体設定)・options ページ(単語ごとの上書き)の両方で共有する。
 *
 * 内部的には引き続き sizeRatio(本文比、0〜1の数値)として保持・保存するが、
 * 30%〜100%の連続値だと「結局どれくらいの見た目になるのか」が伝わりにくい
 * というフィードバックを受け、UI 上は3つのプリセットボタンから選ぶ形にした。
 */
export interface SizePreset {
  key: 'small' | 'medium' | 'large';
  label: string;
  value: number;
}

export const SIZE_PRESETS: SizePreset[] = [
  { key: 'small', label: '小', value: 0.35 },
  { key: 'medium', label: '中', value: 0.5 },
  { key: 'large', label: '大', value: 0.65 },
];

/** インポートされた辞書等、プリセット外の値が保存されている場合に備え、最も近いプリセットを返す。 */
export function nearestSizePreset(sizeRatio: number): SizePreset {
  return SIZE_PRESETS.reduce((best, preset) =>
    Math.abs(preset.value - sizeRatio) < Math.abs(best.value - sizeRatio) ? preset : best
  );
}
