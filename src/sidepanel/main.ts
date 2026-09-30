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
 *
 * v1.0.0 から Googleドキュメントにも対応する。画面は「スライド」「ドキュメント」の2種類で、開いているタブに合わせて
 * 自動で切り替える(body の data-kind。見出しにバッジを出す)。どちらでもないタブでは、最後に使った画面のまま案内を出す。ドキュメントへの書き込み・削除は
 * service worker に依頼する(src/worker/docsHandler.ts)。ドキュメントでは、設定を変えるとルビを自動で付け直す。
 */
import type {
  MeasureRubyRequest,
  MeasureRubyResponse,
  PanelCommand,
  PanelCommandRequest,
  PanelCommandResponse,
} from '../core/messages';
import { parseDocsUrl, type ParsedDocsUrl } from '../core/docs/docsUrl';
import type { DocsCommand, DocsCommandRequest, DocsCommandResponse } from '../core/docs/messages';
import { isSkipKanjiSetting } from '../core/knownKanji';
import type { RubyMode } from '../core/types';
import { populateFontSelect } from '../shared/fontOptions';
import { applyI18n, t } from '../shared/i18n';
import {
  DEFAULT_SETTINGS,
  isDocsRubyStyle,
  loadSettings,
  onSettingsChanged,
  saveSettings,
  type DocsRubyStyle,
  type RubiSettings,
} from '../shared/settings';
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
for (const el of document.querySelectorAll<HTMLOptionElement>('[data-i18n-jlpt]')) {
  const level = el.dataset.i18nJlpt;
  if (level) el.textContent = t('skipKanjiJlpt', level);
}
for (const el of document.querySelectorAll<HTMLOptGroupElement>('[data-i18n-group]')) {
  const key = el.dataset.i18nGroup;
  if (key) el.label = t(key);
}

// --- 開いているタブ(スライド・ドキュメント)と、画面の種類 ---
// サイドパネルはウィンドウ単位で開いたままになるため、利用者がタブを切り替えたら
// 対象のタブも追従する。スライド・ドキュメント以外のタブでは、書き込み系のボタンを押せなくして案内を出す。

const notSupportedNoticeEl = qs<HTMLDivElement>('#notSupportedNotice');
const modeNameEl = qs<HTMLSpanElement>('#modeName');
const writeBtn = qs<HTMLButtonElement>('#writeCurrentSlide');
const writeAllBtn = qs<HTMLButtonElement>('#writeAllSlides');
const deleteCurrentBtn = qs<HTMLButtonElement>('#deleteCurrentSlide');
const deleteAllBtn = qs<HTMLButtonElement>('#deleteAllSlides');
const actionButtons = [writeBtn, writeAllBtn, deleteCurrentBtn, deleteAllBtn];
const docsWriteBtn = qs<HTMLButtonElement>('#docsWrite');
const docsDeleteBtn = qs<HTMLButtonElement>('#docsDelete');

type PanelMode = 'slides' | 'docs';
type TabKind = PanelMode | null;

/** 最後に選んだ画面の種類(スライド・ドキュメント以外のタブを開いたときに使う)。この画面だけの覚え書き */
const MODE_STORAGE_KEY = 'rubiPanelMode';
function loadMode(): PanelMode {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY) === 'docs' ? 'docs' : 'slides';
  } catch {
    return 'slides';
  }
}

let busy = false;
/** ドキュメントのルビを付け直している(ふる・消すも含む)間 true。見た目の設定を押せなくする */
let docsLocked = false;
let mode: PanelMode = loadMode();
let activeKind: TabKind = null;
let activeSlidesTabId: number | null = null;
/** 開いているドキュメント(文書 ID・タブ)と、そのブラウザのタブ ID(表ルビの文字幅をそのページで測る) */
let docsTarget: ParsedDocsUrl | null = null;
let docsBrowserTabId: number | undefined;

function updateButtonsEnabled(): void {
  const disabled = busy || activeSlidesTabId === null;
  actionButtons.forEach((b) => (b.disabled = disabled));
  docsWriteBtn.disabled = busy || docsTarget === null;
  docsDeleteBtn.disabled = busy || docsTarget === null;
}

/** 画面の種類を切り替える(見出しのバッジ・出し分け・押せない設定・案内)。 */
function setMode(next: PanelMode): void {
  mode = next;
  try {
    localStorage.setItem(MODE_STORAGE_KEY, next);
  } catch {
    // 覚えられなくても、切り替え自体はできる
  }
  document.body.dataset.kind = next;
  modeNameEl.textContent = t(next === 'slides' ? 'modeSlides' : 'modeDocs');
  notSupportedNoticeEl.hidden = activeKind !== null;
  applyFieldStates();
  updateButtonsEnabled();
}

async function refreshActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // url は、ホスト権限のある Googleスライド・ドキュメントのタブでだけ取得できる(それ以外は undefined)
  activeSlidesTabId = tab?.id !== undefined && tab.url?.startsWith(SLIDES_URL_PREFIX) ? tab.id : null;
  docsTarget = activeSlidesTabId === null && tab?.url ? parseDocsUrl(tab.url) : null;
  docsBrowserTabId = docsTarget ? tab?.id : undefined;
  activeKind = activeSlidesTabId !== null ? 'slides' : docsTarget ? 'docs' : null;
  setMode(activeKind ?? mode);
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

// --- 表示設定(ルビON/OFF・振り方・サイズ・フォント・色・省く漢字) ---

const enabledEl = qs<HTMLInputElement>('#enabled');
const sizeButtons = Array.from(qs<HTMLElement>('#sizeGroup').querySelectorAll<HTMLButtonElement>('.segBtn'));
const rubyModeButtons = Array.from(qs<HTMLElement>('#rubyModeGroup').querySelectorAll<HTMLButtonElement>('.segBtn'));
const fontFamilyEl = qs<HTMLSelectElement>('#fontFamily');
const colorEl = qs<HTMLInputElement>('#color');
const skipKanjiEl = qs<HTMLSelectElement>('#skipKanji');
const rubyLanguageEl = qs<HTMLSelectElement>('#rubyLanguage');
const zhDictHintEl = qs<HTMLDivElement>('#zhDictHint');
const docsStyleInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="docsStyle"]'));
const docsSizeHintEl = qs<HTMLDivElement>('#docsSizeHint');
const docsFontHintEl = qs<HTMLDivElement>('#docsFontHint');
const docsColorHintEl = qs<HTMLDivElement>('#docsColorHint');

populateFontSelect(fontFamilyEl);

let currentSizeRatio = DEFAULT_SETTINGS.sizeRatio;
let currentRubyMode: RubyMode = DEFAULT_SETTINGS.rubyMode;
let currentDocsStyle: DocsRubyStyle = DEFAULT_SETTINGS.docsStyle;
/** 最後に画面に反映した設定(変わった項目を調べて、ドキュメントのルビを付け直すかを決める) */
let lastSettings: RubiSettings = DEFAULT_SETTINGS;

const isTableStyle = (style: DocsRubyStyle): boolean => style === 'table' || style === 'table-compact';
/** ドキュメントの見せ方ごとに使わない設定(読みの大きさは括弧書き・漢字の右上、フォントは漢字の上以外、色は括弧書き) */
const docsSizeUnused = (style: DocsRubyStyle): boolean => style === 'paren' || style === 'superscript';
const docsFontUnused = (style: DocsRubyStyle): boolean => !isTableStyle(style);
const docsColorUnused = (style: DocsRubyStyle): boolean => style === 'paren';

/** ドキュメントのタブでは、見せ方で使わない設定を押せないようにする(スライドのタブではすべて使う)。 */
/** いまの画面(スライド・ドキュメント)のルビの言語。言語は、スライドとドキュメントで別に覚える。 */
function currentLanguage(settings: RubiSettings): 'ja' | 'zh' {
  return mode === 'docs' ? settings.docsRubyLanguage : settings.slidesRubyLanguage;
}

function applyFieldStates(): void {
  const docs = mode === 'docs';
  const sizeUnused = docs && docsSizeUnused(currentDocsStyle);
  const fontUnused = docs && docsFontUnused(currentDocsStyle);
  const colorUnused = docs && docsColorUnused(currentDocsStyle);
  const zh = currentLanguage(lastSettings) === 'zh';
  rubyLanguageEl.value = currentLanguage(lastSettings); // スライドとドキュメントを切り替えたときも、それぞれの言語を出す
  // ドキュメントでルビを付け直している間は、見た目の設定をすべて押せなくする(押せると、続けて別の付け直しが
  // 走って、いつまでも新しいルビが出ないように見える)
  const locked = docs && docsLocked;
  docsStyleInputs.forEach((input) => (input.disabled = locked));
  rubyLanguageEl.disabled = locked;
  rubyModeButtons.forEach((b) => (b.disabled = zh || locked)); // 拼音は漢字1文字に1音節。振り方は選べない
  skipKanjiEl.disabled = zh || locked; // 省く漢字(学年・JLPT)は日本語用
  zhDictHintEl.hidden = !zh; // ユーザー辞書は、読みがひらがなのものだけ(拼音はまだ)
  sizeButtons.forEach((b) => (b.disabled = sizeUnused || locked));
  fontFamilyEl.disabled = fontUnused || locked;
  colorEl.disabled = colorUnused || locked;
  docsSizeHintEl.hidden = !sizeUnused;
  docsFontHintEl.hidden = !fontUnused;
  docsColorHintEl.hidden = !colorUnused;
}

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
  skipKanjiEl.value = settings.skipKanji;
  currentDocsStyle = settings.docsStyle;
  docsStyleInputs.forEach((input) => (input.checked = input.value === settings.docsStyle));
  lastSettings = settings;
  applyFieldStates();
}

applySettingsToForm(DEFAULT_SETTINGS);
loadSettings()
  .then(applySettingsToForm)
  .catch(() => applySettingsToForm(DEFAULT_SETTINGS));
// 書き込み成功後の表示 OFF など、スライド側からの設定変更にも追従させる
onSettingsChanged(applySettingsToForm);

async function persist(): Promise<void> {
  const prev = lastSettings;
  const next: RubiSettings = {
    ...prev,
    enabled: enabledEl.checked,
    sizeRatio: currentSizeRatio,
    skipKanji: isSkipKanjiSetting(skipKanjiEl.value) ? skipKanjiEl.value : 'none',
    fontFamily: fontFamilyEl.value,
    color: colorEl.value,
    rubyMode: currentRubyMode,
    docsStyle: currentDocsStyle,
    ...(mode === 'docs'
      ? { docsRubyLanguage: rubyLanguageEl.value === 'zh' ? ('zh' as const) : ('ja' as const) }
      : { slidesRubyLanguage: rubyLanguageEl.value === 'zh' ? ('zh' as const) : ('ja' as const) }),
  };
  lastSettings = next;
  const willRefresh = mode === 'docs' && docsTarget !== null && docsRefreshNeeded(prev, next);
  if (willRefresh) startDocsProgress(t('docsProgressRefreshing')); // 保存を待たずに、すぐ「変換中」にする
  applyFieldStates();
  await saveSettings(next);
  if (willRefresh) startDocsRefresh();
}

/**
 * ドキュメントのルビの見た目が変わる設定の変更か。使わない設定(括弧書きでの読みの大きさなど)だけの変更や、
 * スライドの表示の ON/OFF では付け直さない。
 */
function docsRefreshNeeded(prev: RubiSettings, next: RubiSettings): boolean {
  const changed = (Object.keys(next) as (keyof RubiSettings)[]).filter(
    (k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k])
  );
  return changed.some((k) => {
    if (k === 'enabled') return false;
    if (k === 'sizeRatio') return !docsSizeUnused(next.docsStyle);
    if (k === 'fontFamily') return !docsFontUnused(next.docsStyle);
    if (k === 'color') return !docsColorUnused(next.docsStyle);
    return true;
  });
}

enabledEl.addEventListener('change', () => void persist());
for (const input of docsStyleInputs) {
  input.addEventListener('change', () => {
    if (!input.checked || !isDocsRubyStyle(input.value)) return;
    currentDocsStyle = input.value;
    void persist();
  });
}
skipKanjiEl.addEventListener('change', () => void persist());
rubyLanguageEl.addEventListener('change', () => void persist());
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
      if (btn.disabled) return;
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
const fontWarningEl = qs<HTMLDivElement>('#fontWarning');

/** 書き込んだ本文が日本語を含まないフォント(Arial など)だったとき、PDF・印刷でずれる可能性を知らせる。 */
function showFontWarning(fonts: string[] | undefined): void {
  const list = fonts ?? [];
  fontWarningEl.hidden = list.length === 0;
  fontWarningEl.textContent = list.length === 0 ? '' : t('warnFontPdf', list.join('・'));
}
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
  showFontWarning(undefined);
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
    if (res.command === 'write-current' || res.command === 'write-all') {
      showFontWarning(res.writtenCount > 0 ? res.latinOnlyFonts : undefined);
    }
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

// --- ドキュメントへの書き込み・削除(service worker に依頼する) ---

/**
 * 設定を変えたときの自動の付け直し。以前は 0.7 秒待って、続けて変えた分をまとめていたが、変換中は設定を
 * 押せなくしたので、まとめる必要はない(待つと、その間に別の見せ方を選べてしまう)。
 */
let docsRefreshPending = false;

function startDocsRefresh(): void {
  if (docsTarget === null) {
    endDocsProgress(); // 文書が閉じられたなど。押せないままにならないよう、解除する
    return;
  }
  if (busy) {
    docsRefreshPending = true; // 今の処理が終わってから付け直す
    return;
  }
  void runDocs('refresh');
}

// --- 「変換中」の表示(ドキュメント。長い文書では数十秒かかるので、経過秒数も出してエラーと見間違えないようにする) ---

const docsProgressEl = qs<HTMLDivElement>('#docsProgress');
const docsProgressTitleEl = qs<HTMLDivElement>('#docsProgressTitle');
let docsProgressLabel = '';
let docsProgressStartedAt = 0;
let docsProgressTimer: ReturnType<typeof setInterval> | undefined;

function renderDocsProgress(): void {
  const seconds = Math.floor((Date.now() - docsProgressStartedAt) / 1000);
  docsProgressTitleEl.textContent = seconds >= 2 ? `${docsProgressLabel} (${t('docsProgressElapsed', String(seconds))})` : docsProgressLabel;
}

/** 「変換中」を出して、見た目の設定を押せなくする。すでに出ているときは、文言だけ変える(経過秒数は続ける)。 */
function startDocsProgress(label: string): void {
  docsProgressLabel = label;
  if (!docsLocked) {
    docsProgressStartedAt = Date.now();
    docsLocked = true;
    applyFieldStates();
    docsProgressTimer = setInterval(renderDocsProgress, 1000);
  }
  docsProgressEl.hidden = false;
  renderDocsProgress();
}

function endDocsProgress(): void {
  clearInterval(docsProgressTimer);
  docsProgressTimer = undefined;
  docsProgressEl.hidden = true;
  if (docsLocked) {
    docsLocked = false;
    applyFieldStates();
  }
}

const DOCS_STATUS: Record<'write' | 'delete' | 'refresh', string> = {
  write: 'statusDocsWriting',
  delete: 'statusDocsDeleting',
  refresh: 'statusDocsRefreshing',
};

/** 編集されていたため消さずに残した表ルビがあるときの案内。 */
function skippedNote(skipped: number | undefined): string {
  return skipped ? `\n${t('statusDocsSkipped', String(skipped))}` : '';
}

async function runDocs(command: Extract<DocsCommand, 'write' | 'delete' | 'refresh'>): Promise<void> {
  if (docsTarget === null) return;
  busy = true;
  updateButtonsEnabled();
  startDocsProgress(t(command === 'refresh' ? 'docsProgressRefreshing' : DOCS_STATUS[command]));
  setWriteStatus(t(DOCS_STATUS[command]), 'info');
  try {
    const request: DocsCommandRequest = {
      type: 'rubi-docs/command',
      command,
      documentId: docsTarget.documentId,
      ...(docsTarget.tabId ? { tabId: docsTarget.tabId } : {}),
      ...(docsBrowserTabId !== undefined ? { browserTabId: docsBrowserTabId } : {}),
    };
    const res = (await chrome.runtime.sendMessage(request)) as DocsCommandResponse;
    if (!res.ok) {
      setWriteStatus(res.message, 'error');
      return;
    }
    const count = String(res.count ?? 0);
    if (command === 'refresh' && !res.refreshed) {
      setWriteStatus(t('statusDocsSettingsSaved'), 'info');
      return;
    }
    const key = command === 'write' ? 'statusDocsWriteSuccess' : command === 'delete' ? 'statusDocsDeleteSuccess' : 'statusDocsRefreshed';
    setWriteStatus(`${t(key, count)}${skippedNote(res.skipped)}`, 'success');
  } catch (err) {
    setWriteStatus(err instanceof Error ? err.message : String(err), 'error');
  } finally {
    busy = false;
    updateButtonsEnabled();
    if (docsRefreshPending) {
      docsRefreshPending = false;
      void runDocs('refresh'); // 続けて付け直す(「変換中」のまま)
    } else {
      endDocsProgress();
    }
  }
}

docsWriteBtn.addEventListener('click', () => void runDocs('write'));
docsDeleteBtn.addEventListener('click', () => void runDocs('delete'));
