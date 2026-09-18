/**
 * content script エントリポイント。
 * 設定の読み込み・ReadingService の呼び出し・オーバーレイ描画・DOM監視の
 * 全体をつなぐ。
 */
import { createGradeFilter } from '../core/gradeFilter';
import type { ReadingServiceOptions } from '../core/types';
import { DEFAULT_SETTINGS, loadSettings, onSettingsChanged, saveSettings, type RubiSettings } from '../shared/settings';
import { loadUserDict } from '../shared/userDictStorage';
import { startDomWatcher } from './domWatcher';
import { getGradeTable } from './gradeTableClient';
import { initPanel } from './panel';
import { runRubyPipeline } from './rubyPipeline';

let currentSettings: RubiSettings = DEFAULT_SETTINGS;
let rerenderInFlight: Promise<void> = Promise.resolve();

async function buildReadingOptions(): Promise<ReadingServiceOptions> {
  const userDict = await loadUserDict();
  const options: ReadingServiceOptions = { userDict };

  if (currentSettings.gradeFilterMaxGrade !== null) {
    try {
      const gradeTable = await getGradeTable();
      options.gradeFilter = createGradeFilter(currentSettings.gradeFilterMaxGrade, gradeTable);
    } catch (err) {
      console.error(
        '[ルビふり for Googleスライド] 学年別漢字配当表の取得に失敗しました。学年フィルタなしで続行します。',
        err
      );
    }
  }

  return options;
}

/** 直列化した再描画。DomWatcher からの連続呼び出しでも実行が重ならないようにする。 */
function scheduleRerender(): void {
  rerenderInFlight = rerenderInFlight
    .catch(() => undefined)
    .then(async () => {
      const readingOptions = await buildReadingOptions();
      await runRubyPipeline({
        enabled: currentSettings.enabled,
        sizeRatio: currentSettings.sizeRatio,
        readingOptions,
        fontFamily: currentSettings.fontFamily,
        color: currentSettings.color,
      });
    })
    .catch((err: unknown) => {
      console.error('[ルビふり for Googleスライド] ルビの描画に失敗しました', err);
    });
}

/**
 * モード B(書き込み)成功後、モード A(画面表示のライブオーバーレイ)を自動的に
 * OFF にする。書き込んだテキストボックスと表示中のオーバーレイが同時に
 * 存在すると、両者のレンダリング方式のわずかな違いにより二重表示のように
 * 見えてしまうため(実機で確認)。書き込み結果が 0 件の場合は何も変更しない。
 */
async function disableDisplayModeAfterWrite(writtenCount: number): Promise<void> {
  if (writtenCount <= 0 || !currentSettings.enabled) return;
  const next: RubiSettings = { ...currentSettings, enabled: false };
  await saveSettings(next);
}

async function main(): Promise<void> {
  currentSettings = await loadSettings();
  scheduleRerender();

  onSettingsChanged((settings) => {
    currentSettings = settings;
    scheduleRerender();
  });

  startDomWatcher(() => {
    scheduleRerender();
  });

  initPanel({
    getSettings: () => currentSettings,
    buildReadingOptions,
    onWriteSuccess: disableDisplayModeAfterWrite,
  });

  console.log(
    `[ルビふり for Googleスライド] content script initialized (v${chrome.runtime.getManifest().version}, build ${__BUILD_TIME__})`
  );
}

main().catch((err: unknown) => {
  console.error('[ルビふり for Googleスライド] 初期化に失敗しました', err);
});
