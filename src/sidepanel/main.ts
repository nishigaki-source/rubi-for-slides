/**
 * 設定パネル(Chrome のサイドパネル)。拡張機能アイコンのクリックで開く。
 *
 * 以前はスライドの上に浮かべるパネルだったが、スライドの一部が隠れてしまうため、
 * スライドの横に固定される Chrome のサイドパネルに移した(サイドパネルを開くと
 * ページの表示幅が狭くなり、Googleスライドがその幅に合わせてレイアウトし直すので、
 * スライド全体が常に見える)。
 *
 * 表示設定は chrome.storage に直接保存し、開いているスライドの content script が
 * 変更を検知して再描画する。書き込み・削除はスライドの DOM を測る必要があるため、
 * 開いているタブの content script に依頼する(src/content/panelBridge.ts)。
 */
import type {
  MeasureRubyRequest,
  MeasureRubyResponse,
  PanelCommand,
  PanelCommandRequest,
  PanelCommandResponse,
} from '../core/messages';
import type { RubyMode } from '../core/types';
import { populateFontSelect } from '../shared/fontOptions';
import { applyI18n, t } from '../shared/i18n';
import { DEFAULT_SETTINGS, loadSettings, onSettingsChanged, saveSettings, type RubiSettings } from '../shared/settings';
import { SIZE_PRESETS, nearestSizePreset } from '../shared/sizePresets';

const SLIDES_URL_PREFIX = 'https://docs.google.com/presentation/';

function qs<T extends Element>(selector: string): T {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`要素が見つかりません: ${selector}`);
  return el as T;
}

applyI18n(document);
for (const el of document.querySelectorAll<HTMLOptionElement>('[data-i18n-grade]')) {
  const grade = el.dataset.i18nGrade;
  if (grade) el.textContent = t('gradeFilterGrade', grade);
}

// --- 開いているスライドのタブ ---
// サイドパネルはウィンドウ単位で開いたままになるため、利用者がタブを切り替えたら
// 対象のタブも追従する。Googleスライド以外のタブでは書き込み系のボタンを無効にする。

const notSlidesNoticeEl = qs<HTMLDivElement>('#notSlidesNotice');
const writeBtn = qs<HTMLButtonElement>('#writeCurrentSlide');
const writeAllBtn = qs<HTMLButtonElement>('#writeAllSlides');
const deleteCurrentBtn = qs<HTMLButtonElement>('#deleteCurrentSlide');
const deleteAllBtn = qs<HTMLButtonElement>('#deleteAllSlides');
const actionButtons = [writeBtn, writeAllBtn, deleteCurrentBtn, deleteAllBtn];

let busy = false;
let activeSlidesTabId: number | null = null;

function updateButtonsEnabled(): void {
  const disabled = busy || activeSlidesTabId === null;
  actionButtons.forEach((b) => (b.disabled = disabled));
}

async function refreshActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // url は、ホスト権限のある Googleスライドのタブでだけ取得できる(それ以外は undefined)
  activeSlidesTabId = tab?.id !== undefined && tab.url?.startsWith(SLIDES_URL_PREFIX) ? tab.id : null;
  notSlidesNoticeEl.hidden = activeSlidesTabId !== null;
  updateButtonsEnabled();
}

chrome.tabs.onActivated.addListener(() => void refreshActiveTab());
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url !== undefined || changeInfo.status === 'complete') void refreshActiveTab();
});
void refreshActiveTab();

async function sendToSlidesTab<T>(message: PanelCommandRequest | MeasureRubyRequest): Promise<T> {
  if (activeSlidesTabId === null) throw new Error(t('sidePanelNotSlides'));
  try {
    return (await chrome.tabs.sendMessage(activeSlidesTabId, message)) as T;
  } catch {
    // 拡張機能のインストール・更新より前から開いていたタブには content script が入っていない
    throw new Error(t('errorReloadSlidesTab'));
  }
}

// --- 表示設定(ルビON/OFF・振り方・サイズ・フォント・色・学年フィルタ) ---

const enabledEl = qs<HTMLInputElement>('#enabled');
const sizeButtons = Array.from(qs<HTMLElement>('#sizeGroup').querySelectorAll<HTMLButtonElement>('.segBtn'));
const rubyModeButtons = Array.from(qs<HTMLElement>('#rubyModeGroup').querySelectorAll<HTMLButtonElement>('.segBtn'));
const fontFamilyEl = qs<HTMLSelectElement>('#fontFamily');
const colorEl = qs<HTMLInputElement>('#color');
const gradeFilterEl = qs<HTMLSelectElement>('#gradeFilter');

populateFontSelect(fontFamilyEl);

let currentSizeRatio = DEFAULT_SETTINGS.sizeRatio;
let currentRubyMode: RubyMode = DEFAULT_SETTINGS.rubyMode;

function setActive(buttons: HTMLButtonElement[], isActive: (btn: HTMLButtonElement) => boolean): void {
  for (const btn of buttons) {
    const active = isActive(btn);
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  }
}

function applySettingsToForm(settings: RubiSettings): void {
  enabledEl.checked = settings.enabled;
  currentSizeRatio = settings.sizeRatio;
  const nearest = nearestSizePreset(settings.sizeRatio);
  setActive(sizeButtons, (b) => b.dataset.size === nearest.key);
  currentRubyMode = settings.rubyMode;
  setActive(rubyModeButtons, (b) => b.dataset.mode === settings.rubyMode);
  fontFamilyEl.value = settings.fontFamily;
  colorEl.value = settings.color;
  gradeFilterEl.value = settings.gradeFilterMaxGrade === null ? 'none' : String(settings.gradeFilterMaxGrade);
}

applySettingsToForm(DEFAULT_SETTINGS);
loadSettings()
  .then(applySettingsToForm)
  .catch(() => applySettingsToForm(DEFAULT_SETTINGS));
// 書き込み成功後の表示 OFF など、スライド側からの設定変更にも追従させる
onSettingsChanged(applySettingsToForm);

async function persist(): Promise<void> {
  const next: RubiSettings = {
    enabled: enabledEl.checked,
    sizeRatio: currentSizeRatio,
    gradeFilterMaxGrade: gradeFilterEl.value === 'none' ? null : Number(gradeFilterEl.value),
    fontFamily: fontFamilyEl.value,
    color: colorEl.value,
    rubyMode: currentRubyMode,
  };
  await saveSettings(next);
}

enabledEl.addEventListener('change', () => void persist());
gradeFilterEl.addEventListener('change', () => void persist());
fontFamilyEl.addEventListener('change', () => void persist());
colorEl.addEventListener('change', () => void persist());

for (const btn of rubyModeButtons) {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    if ((mode !== 'per-kanji' && mode !== 'per-word') || mode === currentRubyMode) return;
    currentRubyMode = mode;
    setActive(rubyModeButtons, (b) => b.dataset.mode === mode);
    void persist();
  });
}

// ルビの読みが長く、隣接ルビとの重なりを避けるための幅ベースの上限に張り付いている場合、
// 「小・中・大」を切り替えても実際の見た目がほぼ変わらないことがある(rubyLayout.ts の
// widthSafetyFactor 参照)。その場合だけ、その場で理由を一言添える。
const sizeHintEl = qs<HTMLDivElement>('#sizeHint');
let sizeHintTimer: ReturnType<typeof setTimeout> | undefined;
function showSizeHint(text: string): void {
  sizeHintEl.textContent = text;
  clearTimeout(sizeHintTimer);
  sizeHintTimer = setTimeout(() => {
    sizeHintEl.textContent = '';
  }, 2500);
}

async function measureRubyFontSizes(): Promise<string[] | null> {
  if (activeSlidesTabId === null) return null;
  try {
    const res = await sendToSlidesTab<MeasureRubyResponse>({ type: 'rubi/measure-ruby-font-sizes' });
    return res.fontSizes;
  } catch {
    return null;
  }
}

const sameFontSizes = (a: string[], b: string[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

let sizeCheckToken = 0;
for (const btn of sizeButtons) {
  btn.addEventListener('click', () => {
    void (async () => {
      const preset = SIZE_PRESETS.find((p) => p.key === btn.dataset.size);
      if (!preset || preset.value === currentSizeRatio) return;
      sizeHintEl.textContent = '';
      clearTimeout(sizeHintTimer);
      const increased = preset.value > currentSizeRatio;
      const token = ++sizeCheckToken;
      const before = await measureRubyFontSizes();
      currentSizeRatio = preset.value;
      setActive(sizeButtons, (b) => b.dataset.size === preset.key);
      await persist();

      if (before === null) return;
      setTimeout(() => {
        void (async () => {
          if (token !== sizeCheckToken) return; // 別の操作で上書き済み
          const after = await measureRubyFontSizes();
          if (after !== null && sameFontSizes(before, after)) {
            showSizeHint(increased ? t('sizeCannotIncrease') : t('sizeCannotDecrease'));
          }
        })();
      }, 800);
    })();
  });
}

qs<HTMLAnchorElement>('#openOptions').addEventListener('click', (e) => {
  e.preventDefault();
  void chrome.runtime.openOptionsPage();
});

// --- スライドへの書き込み・削除 ---

const groupWithOriginalEl = qs<HTMLInputElement>('#groupWithOriginal');
const writeStatusEl = qs<HTMLDivElement>('#writeStatus');
const deleteSectionEl = qs<HTMLDivElement>('#deleteSection');

function setWriteStatus(text: string, kind: 'info' | 'success' | 'error'): void {
  writeStatusEl.textContent = text;
  writeStatusEl.classList.remove('success', 'error');
  if (kind !== 'info') writeStatusEl.classList.add(kind);
}

// サイドパネルでは window.confirm() のダイアログが使えないことがあるため、パネル内で確認する
const confirmBoxEl = qs<HTMLDivElement>('#confirmBox');
const confirmTextEl = qs<HTMLParagraphElement>('#confirmText');
const confirmOkBtn = qs<HTMLButtonElement>('#confirmOk');
const confirmCancelBtn = qs<HTMLButtonElement>('#confirmCancel');
let resolveConfirm: ((ok: boolean) => void) | null = null;

function askConfirm(text: string): Promise<boolean> {
  resolveConfirm?.(false);
  confirmTextEl.textContent = text;
  confirmBoxEl.hidden = false;
  confirmOkBtn.focus();
  return new Promise((resolve) => {
    resolveConfirm = resolve;
  });
}
function closeConfirm(ok: boolean): void {
  confirmBoxEl.hidden = true;
  const resolve = resolveConfirm;
  resolveConfirm = null;
  resolve?.(ok);
}
confirmOkBtn.addEventListener('click', () => closeConfirm(true));
confirmCancelBtn.addEventListener('click', () => closeConfirm(false));

const STATUS_BY_COMMAND: Record<PanelCommand, string> = {
  'write-current': 'statusWriting',
  'write-all': 'statusWritingAll',
  'delete-current': 'statusDeleting',
  'delete-all': 'statusDeleting',
};

function describeSuccess(res: Extract<PanelCommandResponse, { ok: true }>): string {
  switch (res.command) {
    case 'write-current':
    case 'write-all': {
      const suffix = res.writtenCount > 0 ? t('statusDisplayTurnedOff') : '';
      const main =
        res.command === 'write-current'
          ? t('statusWriteSuccessCurrent', String(res.writtenCount))
          : t('statusWriteSuccessAll', [String(res.slideCount), String(res.writtenCount)]);
      return `${main}${suffix}`;
    }
    case 'delete-current':
    case 'delete-all':
      return t('statusDeleteSuccess', String(res.deletedCount));
  }
}

async function run(command: PanelCommand): Promise<void> {
  busy = true;
  updateButtonsEnabled();
  setWriteStatus(t(STATUS_BY_COMMAND[command]), 'info');
  try {
    const res = await sendToSlidesTab<PanelCommandResponse>({
      type: 'rubi/panel-command',
      command,
      groupWithOriginal: groupWithOriginalEl.checked,
    });
    if (!res.ok) {
      setWriteStatus(res.message, 'error');
      return;
    }
    setWriteStatus(describeSuccess(res), 'success');
    if ((res.command === 'write-current' || res.command === 'write-all') && res.writtenCount > 0) {
      deleteSectionEl.hidden = false;
    }
    if (res.command === 'delete-all') deleteSectionEl.hidden = true;
  } catch (err) {
    setWriteStatus(err instanceof Error ? err.message : String(err), 'error');
  } finally {
    busy = false;
    updateButtonsEnabled();
  }
}

writeBtn.addEventListener('click', () => void run('write-current'));
writeAllBtn.addEventListener('click', () => {
  void askConfirm(t('confirmWriteAll')).then((ok) => {
    if (ok) void run('write-all');
  });
});
deleteCurrentBtn.addEventListener('click', () => void run('delete-current'));
deleteAllBtn.addEventListener('click', () => {
  void askConfirm(t('confirmDeleteAll')).then((ok) => {
    if (ok) void run('delete-all');
  });
});
