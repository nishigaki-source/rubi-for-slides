/**
 * スライド編集画面内に浮かべる、ドラッグ移動可能な設定パネル。
 * 拡張機能アイコンのクリック(service worker 経由の 'rubi/toggle-panel' メッセージ)
 * で開閉する。旧ツールバーポップアップ(Chrome が固定位置に表示し、Web側からは
 * 移動できない)の代替。content script プロセス内で直接動くため、書き込み・
 * 削除操作は writeController を直接呼び出す(popup 時代のようなメッセージ中継は不要)。
 */
import { isTogglePanelRequest, type OpenOptionsPageRequest } from '../core/messages';
import { populateFontSelect } from '../shared/fontOptions';
import { DEFAULT_SETTINGS, loadSettings, onSettingsChanged, saveSettings, type RubiSettings } from '../shared/settings';
import { SIZE_PRESETS, nearestSizePreset } from '../shared/sizePresets';
import type { ReadingServiceOptions } from '../core/types';
import { deleteRuby, writeRubyToAllSlides, writeRubyToCurrentSlide } from './writeController';

export interface PanelDeps {
  getSettings: () => RubiSettings;
  buildReadingOptions: () => Promise<ReadingServiceOptions>;
  onWriteSuccess: (writtenCount: number) => Promise<void>;
}

const HOST_ID = 'rubi-furigana-panel-host';
const POSITION_STORAGE_KEY = 'rubi-panel-position';
const PANEL_MARGIN = 8;

interface PanelPosition {
  left: number;
  top: number;
}

function loadPanelPosition(): PanelPosition | null {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PanelPosition>;
    if (typeof parsed.left !== 'number' || typeof parsed.top !== 'number') return null;
    return { left: parsed.left, top: parsed.top };
  } catch {
    return null;
  }
}

/** パネルの位置は「このブラウザでの見た目上の都合」なので、sync 設定ではなく localStorage に留める。 */
function savePanelPosition(pos: PanelPosition): void {
  try {
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(pos));
  } catch {
    // 保存できなくても致命的ではないので無視する
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

const PANEL_STYLE = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .panel {
    width: 300px;
    max-height: calc(100vh - ${PANEL_MARGIN * 2}px);
    overflow-y: auto;
    background: #fff;
    border: 1px solid #dadce0;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    font-family: system-ui, -apple-system, 'Hiragino Kaku Gothic ProN', sans-serif;
    color: #202124;
    font-size: 13px;
    line-height: 1.4;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 8px 8px 12px;
    border-bottom: 1px solid #eee;
    cursor: grab;
    user-select: none;
    touch-action: none;
  }
  .header:active { cursor: grabbing; }
  .grip { color: #9aa0a6; font-size: 14px; }
  .title { flex: 1; margin: 0; font-size: 14px; font-weight: 600; }
  .closeBtn {
    width: 28px; height: 28px;
    border: none; border-radius: 50%;
    background: transparent;
    font-size: 18px; line-height: 1;
    color: #5f6368;
    cursor: pointer;
  }
  .closeBtn:hover { background: #f1f3f4; color: #202124; }
  .body { padding: 4px 12px 12px; }

  .toggleRow {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 0;
    font-size: 14px; font-weight: 500;
  }
  .switch { position: relative; display: inline-block; width: 40px; height: 22px; flex: none; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .slider {
    position: absolute; inset: 0;
    background: #bdc1c6; border-radius: 22px;
    transition: 0.15s; cursor: pointer;
  }
  .slider::before {
    content: ''; position: absolute;
    width: 18px; height: 18px; left: 2px; top: 2px;
    background: #fff; border-radius: 50%;
    box-shadow: 0 1px 2px rgba(0,0,0,0.3);
    transition: 0.15s;
  }
  input:checked + .slider { background: #1a73e8; }
  input:checked + .slider::before { transform: translateX(18px); }

  .sectionLabel {
    margin: 12px 0 6px;
    font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
    color: #5f6368;
  }
  .grid {
    display: grid;
    grid-template-columns: 60px 1fr;
    column-gap: 8px; row-gap: 8px;
    align-items: center;
  }
  .grid > label { font-size: 12px; color: #3c4043; }
  select {
    width: 100%; height: 30px;
    padding: 0 6px;
    border: 1px solid #dadce0; border-radius: 6px;
    background: #fff; color: #202124;
    font-size: 12px;
  }
  .sizeGroup { display: flex; gap: 6px; }
  .sizeBtn {
    flex: 1; height: 30px;
    border: 1px solid #dadce0; border-radius: 6px;
    background: #fff; color: #3c4043;
    font-size: 12px; cursor: pointer;
  }
  .sizeBtn:hover:not(.active) { background: #f1f3f4; }
  .sizeBtn.active { background: #1a73e8; border-color: #1a73e8; color: #fff; font-weight: 500; }
  .sizeHint { min-height: 14px; margin-top: 4px; font-size: 11px; color: #5f6368; }
  input[type='color'] {
    width: 40px; height: 28px; padding: 2px;
    border: 1px solid #dadce0; border-radius: 6px;
    background: #fff; cursor: pointer;
  }

  .btnRow { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  button.primary {
    height: 34px;
    border: none; border-radius: 8px;
    background: #1a73e8; color: #fff;
    font-size: 13px; font-weight: 500;
    cursor: pointer;
  }
  button.primary:hover { background: #1765cc; }
  button:disabled { opacity: 0.5; cursor: default; }
  .checkRow {
    display: flex; align-items: center; gap: 6px;
    margin-top: 8px;
    font-size: 12px; color: #3c4043;
    cursor: pointer;
  }
  .checkRow input { margin: 0; accent-color: #1a73e8; }
  button.secondary {
    height: 32px;
    border: 1px solid #dadce0; border-radius: 8px;
    background: #fff; color: #c5221f;
    font-size: 12px;
    cursor: pointer;
  }
  button.secondary:hover { background: #fce8e6; border-color: #f5c6c2; }
  #deleteSection[hidden] { display: none; }
  #writeStatus { min-height: 16px; margin-top: 8px; font-size: 12px; color: #5f6368; }
  #writeStatus.error { color: #c5221f; }
  #writeStatus.success { color: #188038; }

  .footer { margin-top: 12px; padding-top: 10px; border-top: 1px solid #eee; }
  .footer a { font-size: 12px; color: #1a73e8; text-decoration: none; }
  .footer a:hover { text-decoration: underline; }
`;

const PANEL_MARKUP = `
  <div class="panel" role="dialog" aria-label="ルビふり">
    <div class="header" id="dragHandle">
      <span class="grip" aria-hidden="true">⠿</span>
      <h1 class="title">ルビふり</h1>
      <button type="button" class="closeBtn" id="closeBtn" aria-label="閉じる">×</button>
    </div>
    <div class="body">
      <div class="toggleRow">
        <label for="enabled">ルビを表示</label>
        <label class="switch">
          <input type="checkbox" id="enabled" />
          <span class="slider"></span>
        </label>
      </div>

      <div class="sectionLabel">ルビの見た目</div>
      <div class="grid">
        <label>サイズ</label>
        <div>
          <div class="sizeGroup" id="sizeGroup" role="group" aria-label="ルビのサイズ">
            <button type="button" class="sizeBtn" data-size="small">小</button>
            <button type="button" class="sizeBtn" data-size="medium">中</button>
            <button type="button" class="sizeBtn" data-size="large">大</button>
          </div>
          <div class="sizeHint" id="sizeHint" role="status"></div>
        </div>
        <label for="fontFamily">フォント</label>
        <select id="fontFamily"></select>
        <label for="color">色</label>
        <input type="color" id="color" />
        <label for="gradeFilter">省く漢字</label>
        <select id="gradeFilter">
          <option value="none">なし(すべてにルビ)</option>
          <option value="1">小1までに習う漢字</option>
          <option value="2">小2までに習う漢字</option>
          <option value="3">小3までに習う漢字</option>
          <option value="4">小4までに習う漢字</option>
          <option value="5">小5までに習う漢字</option>
          <option value="6">小6までに習う漢字</option>
        </select>
      </div>

      <div class="sectionLabel">スライドに書き込む</div>
      <div class="btnRow">
        <button type="button" class="primary" id="writeCurrentSlide">このスライド</button>
        <button type="button" class="primary" id="writeAllSlides">全スライド</button>
      </div>
      <label class="checkRow">
        <input type="checkbox" id="groupWithOriginal" />
        元のテキストとグループ化
      </label>
      <div id="writeStatus" role="status"></div>

      <div id="deleteSection" hidden>
        <div class="sectionLabel">書き込んだルビを削除</div>
        <div class="btnRow">
          <button type="button" class="secondary" id="deleteCurrentSlide">このスライド</button>
          <button type="button" class="secondary" id="deleteAllSlides">全スライド</button>
        </div>
      </div>

      <div class="footer">
        <a href="#" id="openOptions">ユーザー辞書を編集</a>
      </div>
    </div>
  </div>
`;

function qs<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`要素が見つかりません: ${selector}`);
  return el as T;
}

/** スライド側のグローバルなキー操作(矢印キーでのスライド送り等)に、パネル内の操作が漏れないようにする。 */
function stopEventLeakage(host: HTMLElement): void {
  const eventNames = ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'click'] as const;
  for (const name of eventNames) {
    host.addEventListener(name, (e) => e.stopPropagation());
  }
}

export function initPanel(deps: PanelDeps): void {
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.position = 'fixed';
  host.style.zIndex = '2147483647';
  host.style.display = 'none';
  document.body.appendChild(host);
  stopEventLeakage(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = PANEL_STYLE;
  shadow.appendChild(styleEl);
  const wrapper = document.createElement('div');
  wrapper.innerHTML = PANEL_MARKUP;
  shadow.appendChild(wrapper);

  let visible = false;

  function applyPosition(): void {
    const panelEl = qs<HTMLElement>(shadow, '.panel');
    const width = panelEl.offsetWidth || 300;
    const height = panelEl.offsetHeight || 400;
    const pos = loadPanelPosition();
    if (pos) {
      host.style.left = `${clamp(pos.left, PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN)}px`;
      host.style.top = `${clamp(pos.top, PANEL_MARGIN, window.innerHeight - height - PANEL_MARGIN)}px`;
      host.style.right = 'auto';
    } else {
      host.style.top = '72px';
      host.style.right = '16px';
      host.style.left = 'auto';
    }
  }

  function setVisible(next: boolean): void {
    visible = next;
    host.style.display = next ? 'block' : 'none';
    if (next) applyPosition();
  }

  // --- ドラッグ移動 ---
  const dragHandle = qs<HTMLElement>(shadow, '#dragHandle');
  let dragOffset: { x: number; y: number } | null = null;

  dragHandle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    // 閉じるボタン上ではドラッグを開始しない(ポインターキャプチャがクリックを奪ってしまうため)
    if ((e.target as Element).closest('button')) return;
    const rect = host.getBoundingClientRect();
    dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    dragHandle.setPointerCapture(e.pointerId);
  });
  dragHandle.addEventListener('pointermove', (e) => {
    if (!dragOffset) return;
    const rect = host.getBoundingClientRect();
    const left = clamp(e.clientX - dragOffset.x, 0, window.innerWidth - rect.width);
    const top = clamp(e.clientY - dragOffset.y, 0, window.innerHeight - rect.height);
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
    host.style.right = 'auto';
  });
  const endDrag = (e: PointerEvent): void => {
    if (!dragOffset) return;
    dragOffset = null;
    dragHandle.releasePointerCapture(e.pointerId);
    const rect = host.getBoundingClientRect();
    savePanelPosition({ left: rect.left, top: rect.top });
  };
  dragHandle.addEventListener('pointerup', endDrag);
  dragHandle.addEventListener('pointercancel', endDrag);

  qs<HTMLButtonElement>(shadow, '#closeBtn').addEventListener('click', () => setVisible(false));

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (isTogglePanelRequest(message)) {
      setVisible(!visible);
    }
    return undefined;
  });

  // --- 表示設定(ルビON/OFF・サイズ・フォント・色・学年フィルタ) ---
  const enabledEl = qs<HTMLInputElement>(shadow, '#enabled');
  const sizeButtons = Array.from(qs<HTMLElement>(shadow, '#sizeGroup').querySelectorAll<HTMLButtonElement>('.sizeBtn'));
  const fontFamilyEl = qs<HTMLSelectElement>(shadow, '#fontFamily');
  const colorEl = qs<HTMLInputElement>(shadow, '#color');
  const gradeFilterEl = qs<HTMLSelectElement>(shadow, '#gradeFilter');
  const openOptionsEl = qs<HTMLAnchorElement>(shadow, '#openOptions');

  populateFontSelect(fontFamilyEl);

  let currentSizeRatio = DEFAULT_SETTINGS.sizeRatio;
  const setSizeButtonsActive = (sizeRatio: number): void => {
    const nearest = nearestSizePreset(sizeRatio);
    for (const btn of sizeButtons) {
      btn.classList.toggle('active', btn.dataset.size === nearest.key);
    }
  };

  const applySettingsToForm = (settings: RubiSettings): void => {
    enabledEl.checked = settings.enabled;
    currentSizeRatio = settings.sizeRatio;
    setSizeButtonsActive(settings.sizeRatio);
    fontFamilyEl.value = settings.fontFamily;
    colorEl.value = settings.color;
    gradeFilterEl.value = settings.gradeFilterMaxGrade === null ? 'none' : String(settings.gradeFilterMaxGrade);
  };

  applySettingsToForm(deps.getSettings());
  loadSettings()
    .then(applySettingsToForm)
    .catch(() => applySettingsToForm(DEFAULT_SETTINGS));
  // 書き込み成功後の自動 OFF 等、他所からの設定変更にも追従させる
  onSettingsChanged(applySettingsToForm);

  const persist = async (): Promise<void> => {
    const next: RubiSettings = {
      enabled: enabledEl.checked,
      sizeRatio: currentSizeRatio,
      gradeFilterMaxGrade: gradeFilterEl.value === 'none' ? null : Number(gradeFilterEl.value),
      fontFamily: fontFamilyEl.value,
      color: colorEl.value,
    };
    await saveSettings(next);
  };

  enabledEl.addEventListener('change', () => void persist());
  gradeFilterEl.addEventListener('change', () => void persist());
  fontFamilyEl.addEventListener('change', () => void persist());
  colorEl.addEventListener('change', () => void persist());
  // ルビの読みが長く、隣接ルビとの重なりを避けるための幅ベースの上限に
  // 張り付いている場合、「小・中・大」を切り替えても実際の見た目がほぼ
  // 変わらないことがある(rubyLayout.ts の widthSafetyFactor 参照)。
  // その場合だけ、その場で理由を一言添える。
  const sizeHintEl = qs<HTMLDivElement>(shadow, '#sizeHint');
  let sizeHintTimer: ReturnType<typeof setTimeout> | undefined;
  const showSizeHint = (text: string): void => {
    sizeHintEl.textContent = text;
    clearTimeout(sizeHintTimer);
    sizeHintTimer = setTimeout(() => {
      sizeHintEl.textContent = '';
    }, 2500);
  };

  const measureRubyFontSizes = (): string[] | null => {
    if (!enabledEl.checked) return null; // 非表示中は比較のしようがない
    const spans = Array.from(document.querySelectorAll<HTMLElement>('[data-rubi-for-slides="true"]'));
    if (spans.length === 0) return null;
    return spans.map((el) => getComputedStyle(el).fontSize);
  };
  const sameFontSizes = (a: string[], b: string[]): boolean =>
    a.length === b.length && a.every((v, i) => v === b[i]);

  let sizeCheckToken = 0;
  for (const btn of sizeButtons) {
    btn.addEventListener('click', () => {
      const preset = SIZE_PRESETS.find((p) => p.key === btn.dataset.size);
      if (!preset || preset.value === currentSizeRatio) return;
      sizeHintEl.textContent = '';
      clearTimeout(sizeHintTimer);
      const increased = preset.value > currentSizeRatio;
      const before = measureRubyFontSizes();
      currentSizeRatio = preset.value;
      setSizeButtonsActive(currentSizeRatio);
      void persist();

      if (before === null) return;
      const token = ++sizeCheckToken;
      setTimeout(() => {
        if (token !== sizeCheckToken) return; // 別の操作で上書き済み
        const after = measureRubyFontSizes();
        if (after !== null && sameFontSizes(before, after)) {
          showSizeHint(increased ? 'これ以上大きくできません' : 'これ以上小さくできません');
        }
      }, 800);
    });
  }

  openOptionsEl.addEventListener('click', (e) => {
    e.preventDefault();
    const req: OpenOptionsPageRequest = { type: 'rubi/open-options-page' };
    chrome.runtime.sendMessage(req).catch((err: unknown) => {
      console.error('[ルビふり for Googleスライド] 詳細設定ページを開けませんでした', err);
    });
  });

  // --- スライドへの書き込み・削除 ---
  const groupWithOriginalEl = qs<HTMLInputElement>(shadow, '#groupWithOriginal');
  const writeBtn = qs<HTMLButtonElement>(shadow, '#writeCurrentSlide');
  const writeAllBtn = qs<HTMLButtonElement>(shadow, '#writeAllSlides');
  const deleteCurrentBtn = qs<HTMLButtonElement>(shadow, '#deleteCurrentSlide');
  const deleteAllBtn = qs<HTMLButtonElement>(shadow, '#deleteAllSlides');
  const writeStatusEl = qs<HTMLDivElement>(shadow, '#writeStatus');
  const deleteSectionEl = qs<HTMLDivElement>(shadow, '#deleteSection');
  const allButtons = [writeBtn, writeAllBtn, deleteCurrentBtn, deleteAllBtn];

  const setWriteStatus = (text: string, kind: 'info' | 'success' | 'error'): void => {
    writeStatusEl.textContent = text;
    writeStatusEl.classList.remove('success', 'error');
    if (kind !== 'info') writeStatusEl.classList.add(kind);
  };

  const withButtonsDisabled = <T>(fn: () => Promise<T>): Promise<T> => {
    allButtons.forEach((b) => (b.disabled = true));
    return fn().finally(() => {
      allButtons.forEach((b) => (b.disabled = false));
    });
  };

  writeBtn.addEventListener('click', () => {
    void withButtonsDisabled(async () => {
      setWriteStatus('書き込み中…', 'info');
      try {
        const settings = deps.getSettings();
        const readingOptions = await deps.buildReadingOptions();
        const result = await writeRubyToCurrentSlide({
          sizeRatio: settings.sizeRatio,
          readingOptions,
          groupWithOriginal: groupWithOriginalEl.checked,
          fontFamily: settings.fontFamily,
          color: settings.color,
        });
        if (result.ok) {
          if (result.writtenCount > 0) {
            await deps.onWriteSuccess(result.writtenCount);
            deleteSectionEl.hidden = false;
          }
          const suffix = result.writtenCount > 0 ? '(表示はOFFにしました)' : '';
          setWriteStatus(`${result.writtenCount}件を書き込みました${suffix}`, 'success');
        } else {
          setWriteStatus(result.message, 'error');
        }
      } catch (err) {
        setWriteStatus(err instanceof Error ? err.message : String(err), 'error');
      }
    });
  });

  writeAllBtn.addEventListener('click', () => {
    if (
      !confirm(
        '全スライドに書き込みます。スライドを1枚ずつ切り替えながら処理するため、枚数によっては時間がかかります。よろしいですか？'
      )
    ) {
      return;
    }
    void withButtonsDisabled(async () => {
      setWriteStatus('全スライドに書き込み中…', 'info');
      try {
        const settings = deps.getSettings();
        const readingOptions = await deps.buildReadingOptions();
        const result = await writeRubyToAllSlides({
          sizeRatio: settings.sizeRatio,
          readingOptions,
          groupWithOriginal: groupWithOriginalEl.checked,
          fontFamily: settings.fontFamily,
          color: settings.color,
        });
        if (result.ok) {
          if (result.writtenCount > 0) {
            await deps.onWriteSuccess(result.writtenCount);
            deleteSectionEl.hidden = false;
          }
          const suffix = result.writtenCount > 0 ? '(表示はOFFにしました)' : '';
          setWriteStatus(`${result.slideCount}枚に${result.writtenCount}件を書き込みました${suffix}`, 'success');
        } else {
          setWriteStatus(result.message, 'error');
        }
      } catch (err) {
        setWriteStatus(err instanceof Error ? err.message : String(err), 'error');
      }
    });
  });

  const runDelete = (scope: 'current' | 'all'): void => {
    void withButtonsDisabled(async () => {
      setWriteStatus('削除中…', 'info');
      try {
        const result = await deleteRuby(scope);
        if (result.ok) {
          setWriteStatus(`${result.deletedCount}件を削除しました`, 'success');
          if (scope === 'all') deleteSectionEl.hidden = true;
        } else {
          setWriteStatus(result.message, 'error');
        }
      } catch (err) {
        setWriteStatus(err instanceof Error ? err.message : String(err), 'error');
      }
    });
  };

  deleteCurrentBtn.addEventListener('click', () => runDelete('current'));
  deleteAllBtn.addEventListener('click', () => {
    if (confirm('全スライドからルビを削除します。よろしいですか？')) runDelete('all');
  });
}
