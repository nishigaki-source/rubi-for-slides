/**
 * content script エントリポイント。
 * 設定の読み込み・ReadingService の呼び出し・オーバーレイ描画・DOM監視の
 * 全体をつなぐ。
 */
import { createKnownKanjiFilter } from '../core/knownKanji';
import type { ReadingServiceOptions } from '../core/types';
import { DEFAULT_SETTINGS, loadSettings, onSettingsChanged, saveSettings, type RubiSettings } from '../shared/settings';
import { loadUserDict } from '../shared/userDictStorage';
import { startDomWatcher } from './domWatcher';
import { getKanjiLevels } from './kanjiLevelsClient';
import { getKanjiReadings } from './kanjiReadingsClient';
import { clearOverlay } from './overlayRenderer';
import { initPanelBridge } from './panelBridge';
import { runRubyPipeline } from './rubyPipeline';

let currentSettings: RubiSettings = DEFAULT_SETTINGS;
let rerenderInFlight: Promise<void> = Promise.resolve();
/** DOM 監視・設定の購読を止める(拡張機能本体とのつながりが切れたとき用) */
let stopWatching: (() => void) | null = null;

/**
 * 拡張機能本体とまだつながっているか。
 *
 * 【重要】拡張機能を更新・再読み込みすると、すでに開いていたタブにはこの古い content script が
 * 取り残され、chrome.runtime / chrome.storage の呼び出しが「Extension context invalidated」で
 * 失敗するようになる。DOM の変化のたびに再描画を試みてこのエラーを記録し続けていたため
 * (実機で確認)、つながりが切れたことに気づいたら自分で止まる。新しいバージョンは、
 * 利用者がスライドを再読み込みしたときに読み込まれる。
 */
function isExtensionContextAlive(): boolean {
  try {
    return chrome.runtime?.id !== undefined;
  } catch {
    return false;
  }
}

function isContextInvalidatedError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('Extension context invalidated');
}

/** 取り残された古い content script を止める。古いルビが編集に追従せず残らないよう表示も消す。 */
function shutDownOrphanedScript(): void {
  try {
    stopWatching?.();
  } catch {
    // つながりが切れた後は、購読の解除自体が失敗することがある。止まっていれば十分なので無視する
  }
  stopWatching = null;
  clearOverlay();
}

async function buildReadingOptions(): Promise<ReadingServiceOptions> {
  const userDict = await loadUserDict();
  const options: ReadingServiceOptions = {
    userDict,
    rubyMode: currentSettings.rubyMode,
    rubyLanguage: currentSettings.slidesRubyLanguage,
  };
  // 中国語の拼音は漢字ごとの読みの表・省く漢字(学年・JLPT)を使わない
  if (currentSettings.slidesRubyLanguage === 'zh') return options;

  if (currentSettings.rubyMode === 'per-kanji') {
    try {
      options.kanjiReadings = await getKanjiReadings();
    } catch (err) {
      // 読みの表が無くても、熟語ごとのルビ(従来の動作)で表示は続けられる
      console.error('[ルビふり for Googleスライド] 漢字ごとの読みの表の取得に失敗しました。熟語ごとのルビで続行します。', err);
    }
  }

  if (currentSettings.skipKanji !== 'none') {
    try {
      const filter = createKnownKanjiFilter(currentSettings.skipKanji, await getKanjiLevels());
      if (filter) options.knownKanjiFilter = filter;
    } catch (err) {
      console.error(
        '[ルビふり for Googleスライド] 漢字の学年・JLPT のデータの取得に失敗しました。省く漢字の設定なしで続行します。',
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
      if (!isExtensionContextAlive()) {
        shutDownOrphanedScript();
        return;
      }
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
      if (!isExtensionContextAlive() || isContextInvalidatedError(err)) {
        shutDownOrphanedScript();
        return;
      }
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

  const unsubscribeSettings = onSettingsChanged((settings) => {
    currentSettings = settings;
    scheduleRerender();
  });

  const domWatcher = startDomWatcher(() => {
    scheduleRerender();
  });
  stopWatching = () => {
    domWatcher.stop();
    unsubscribeSettings();
  };

  initPanelBridge({
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
