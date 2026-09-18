/**
 * ユーザー辞書編集 UI。表層形ごとの読み・見た目(フォント・色・サイズ比)の
 * 上書きを登録・編集・削除でき、JSON でのバックアップ(エクスポート/インポート)にも対応する。
 */
import {
  removeEntry,
  upsertEntry,
  exportUserDict,
  importUserDict,
  UserDictError,
  type UserDictEntryInput,
} from '../core/userDict';
import type { RubyStyleOverride, UserDictionary } from '../core/types';
import { FONT_OPTIONS, populateFontSelect } from '../shared/fontOptions';
import { applyI18n, t } from '../shared/i18n';
import { SIZE_PRESETS, nearestSizePreset } from '../shared/sizePresets';
import { loadUserDict, saveUserDict } from '../shared/userDictStorage';

const USER_DICT_ERROR_KEYS: Record<UserDictError['code'], string> = {
  sizeRatioPositive: 'errSizeRatioPositive',
  surfaceRequired: 'errSurfaceRequired',
  surfaceNeedsKanji: 'errSurfaceNeedsKanji',
  readingHiragana: 'errReadingHiragana',
  readingOrStyleRequired: 'errReadingOrStyleRequired',
  invalidJson: 'errInvalidJson',
  invalidDictFormat: 'errInvalidDictFormat',
  invalidEntryFormat: 'errInvalidEntryFormat',
  readingNotString: 'errReadingNotString',
  invalidStyleFormat: 'errInvalidStyleFormat',
  fontFamilyNotString: 'errFontFamilyNotString',
  colorNotString: 'errColorNotString',
  sizeRatioNotNumber: 'errSizeRatioNotNumber',
};

function describeError(err: unknown): string {
  if (err instanceof UserDictError) {
    const key = USER_DICT_ERROR_KEYS[err.code];
    return err.surface ? t(key, err.surface) : t(key);
  }
  return err instanceof Error ? err.message : String(err);
}

function qs<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`要素が見つかりません: #${id}`);
  return el as T;
}

let dict: UserDictionary = {};
/** 編集中のエントリの表層形。null なら新規追加モード。 */
let editingSurface: string | null = null;
/** サイズはプリセットボタンで選ぶため、フォーム送信時にこの値を使う。 */
let currentSizeRatio = SIZE_PRESETS[1]!.value;

function describeStyle(style: RubyStyleOverride | undefined): string {
  if (!style) return t('styleFallback');
  const parts: string[] = [];
  if (style.fontFamily) parts.push(style.fontFamily);
  if (style.color) parts.push(style.color);
  if (style.sizeRatio !== undefined) parts.push(t(nearestSizePreset(style.sizeRatio).labelKey));
  return parts.length > 0 ? parts.join(' / ') : t('styleFallback');
}

function setSizeButtonsActive(sizeRatio: number): void {
  const nearest = nearestSizePreset(sizeRatio);
  for (const btn of qs<HTMLElement>('sizeGroup').querySelectorAll<HTMLButtonElement>('.sizeBtn')) {
    btn.classList.toggle('active', btn.dataset.size === nearest.key);
  }
}

function renderList(): void {
  const tbody = qs<HTMLTableSectionElement>('entryList');
  const entries = Object.entries(dict).sort(([a], [b]) => a.localeCompare(b, 'ja'));

  tbody.replaceChildren();

  if (entries.length === 0) {
    const row = document.createElement('tr');
    row.id = 'emptyRow';
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = t('emptyDictRow');
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  for (const [surface, entry] of entries) {
    const row = document.createElement('tr');

    const surfaceCell = document.createElement('td');
    surfaceCell.textContent = surface;
    row.appendChild(surfaceCell);

    const readingCell = document.createElement('td');
    readingCell.textContent = entry.reading ?? t('readingFallback');
    row.appendChild(readingCell);

    const styleCell = document.createElement('td');
    styleCell.textContent = describeStyle(entry.style);
    row.appendChild(styleCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = t('btnEdit');
    editBtn.addEventListener('click', () => startEdit(surface));
    actionsCell.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger';
    deleteBtn.textContent = t('btnDelete');
    deleteBtn.addEventListener('click', () => void handleDelete(surface));
    actionsCell.appendChild(deleteBtn);

    row.appendChild(actionsCell);
    tbody.appendChild(row);
  }
}

function setFormStatus(text: string, kind: 'info' | 'success' | 'error'): void {
  const el = qs<HTMLDivElement>('formStatus');
  el.textContent = text;
  el.classList.remove('success', 'error');
  if (kind !== 'info') el.classList.add(kind);
}

function setImportExportStatus(text: string, kind: 'info' | 'success' | 'error'): void {
  const el = qs<HTMLDivElement>('importExportStatus');
  el.textContent = text;
  el.classList.remove('success', 'error');
  if (kind !== 'info') el.classList.add(kind);
}

function resetForm(): void {
  editingSurface = null;
  qs<HTMLFormElement>('entryForm').reset();
  qs<HTMLInputElement>('surface').disabled = false;
  qs<HTMLHeadingElement>('formTitle').textContent = t('headingAddWord');
  qs<HTMLButtonElement>('saveBtn').textContent = t('btnAdd');
  qs<HTMLButtonElement>('cancelEditBtn').hidden = true;
  currentSizeRatio = SIZE_PRESETS[1]!.value;
  setSizeButtonsActive(currentSizeRatio);
  updateFieldVisibility();
  setFormStatus('', 'info');
}

function startEdit(surface: string): void {
  const entry = dict[surface];
  if (!entry) return;

  editingSurface = surface;
  qs<HTMLHeadingElement>('formTitle').textContent = t('formTitleEdit', surface);
  qs<HTMLButtonElement>('saveBtn').textContent = t('btnSaveEdit');
  qs<HTMLButtonElement>('cancelEditBtn').hidden = false;

  const surfaceEl = qs<HTMLInputElement>('surface');
  surfaceEl.value = surface;
  surfaceEl.disabled = true; // 編集中は表層形(キー)を変更させない

  const readingEnabledEl = qs<HTMLInputElement>('readingEnabled');
  const readingEl = qs<HTMLInputElement>('reading');
  readingEnabledEl.checked = !!entry.reading;
  readingEl.value = entry.reading ?? '';

  const styleEnabledEl = qs<HTMLInputElement>('styleEnabled');
  styleEnabledEl.checked = !!entry.style;

  const fontFamilyEnabledEl = qs<HTMLInputElement>('fontFamilyEnabled');
  const fontFamilyEl = qs<HTMLSelectElement>('fontFamily');
  fontFamilyEnabledEl.checked = !!entry.style?.fontFamily;
  fontFamilyEl.value = entry.style?.fontFamily ?? FONT_OPTIONS[0]!.value;

  const colorEnabledEl = qs<HTMLInputElement>('colorEnabled');
  const colorEl = qs<HTMLInputElement>('color');
  colorEnabledEl.checked = !!entry.style?.color;
  colorEl.value = entry.style?.color ?? '#1a1a1a';

  const sizeRatioEnabledEl = qs<HTMLInputElement>('sizeRatioEnabled');
  sizeRatioEnabledEl.checked = entry.style?.sizeRatio !== undefined;
  currentSizeRatio = entry.style?.sizeRatio ?? SIZE_PRESETS[1]!.value;
  setSizeButtonsActive(currentSizeRatio);

  updateFieldVisibility();
  setFormStatus('', 'info');
  qs<HTMLFormElement>('entryForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function handleDelete(surface: string): Promise<void> {
  if (!confirm(t('confirmDeleteWord', surface))) return;
  dict = removeEntry(dict, surface);
  await saveUserDict(dict);
  renderList();
  if (editingSurface === surface) resetForm();
}

/** チェックボックスの ON/OFF に応じて、対応する入力欄の表示・活性状態を切り替える。 */
function updateFieldVisibility(): void {
  const readingEnabled = qs<HTMLInputElement>('readingEnabled').checked;
  qs<HTMLDivElement>('readingField').hidden = !readingEnabled;

  const styleEnabled = qs<HTMLInputElement>('styleEnabled').checked;
  qs<HTMLDivElement>('styleFields').hidden = !styleEnabled;

  qs<HTMLSelectElement>('fontFamily').disabled = !qs<HTMLInputElement>('fontFamilyEnabled').checked;
  qs<HTMLInputElement>('color').disabled = !qs<HTMLInputElement>('colorEnabled').checked;
  const sizeRatioEnabled = qs<HTMLInputElement>('sizeRatioEnabled').checked;
  for (const btn of qs<HTMLElement>('sizeGroup').querySelectorAll<HTMLButtonElement>('.sizeBtn')) {
    btn.disabled = !sizeRatioEnabled;
  }
}

function buildEntryInputFromForm(): UserDictEntryInput {
  const surface = qs<HTMLInputElement>('surface').value;

  const reading = qs<HTMLInputElement>('readingEnabled').checked ? qs<HTMLInputElement>('reading').value : undefined;

  const style: RubyStyleOverride = {};
  if (qs<HTMLInputElement>('styleEnabled').checked) {
    if (qs<HTMLInputElement>('fontFamilyEnabled').checked) {
      style.fontFamily = qs<HTMLSelectElement>('fontFamily').value;
    }
    if (qs<HTMLInputElement>('colorEnabled').checked) {
      style.color = qs<HTMLInputElement>('color').value;
    }
    if (qs<HTMLInputElement>('sizeRatioEnabled').checked) {
      style.sizeRatio = currentSizeRatio;
    }
  }

  return { surface, reading, style: Object.keys(style).length > 0 ? style : undefined };
}

function setupForm(): void {
  const fontFamilyEl = qs<HTMLSelectElement>('fontFamily');
  populateFontSelect(fontFamilyEl);
  setSizeButtonsActive(currentSizeRatio);

  for (const id of ['readingEnabled', 'styleEnabled', 'fontFamilyEnabled', 'colorEnabled', 'sizeRatioEnabled']) {
    qs<HTMLInputElement>(id).addEventListener('change', updateFieldVisibility);
  }

  for (const btn of qs<HTMLElement>('sizeGroup').querySelectorAll<HTMLButtonElement>('.sizeBtn')) {
    btn.addEventListener('click', () => {
      const preset = SIZE_PRESETS.find((p) => p.key === btn.dataset.size);
      if (!preset) return;
      currentSizeRatio = preset.value;
      setSizeButtonsActive(currentSizeRatio);
    });
  }

  qs<HTMLButtonElement>('cancelEditBtn').addEventListener('click', () => resetForm());

  qs<HTMLFormElement>('entryForm').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const input = buildEntryInputFromForm();
      const surfaceBefore = editingSurface;
      dict = upsertEntry(dict, input);
      // 編集中に表層形は変更不可なので、上書き前のキーと同じはずだが、
      // 念のため別キーになっていた場合は古いエントリを削除する。
      if (surfaceBefore && surfaceBefore !== input.surface.trim()) {
        dict = removeEntry(dict, surfaceBefore);
      }
      void saveUserDict(dict).then(() => {
        renderList();
        setFormStatus(editingSurface ? t('statusUpdated') : t('statusAdded'), 'success');
        resetForm();
      });
    } catch (err) {
      setFormStatus(describeError(err), 'error');
    }
  });

  updateFieldVisibility();
}

function setupImportExport(): void {
  qs<HTMLButtonElement>('exportBtn').addEventListener('click', () => {
    const json = exportUserDict(dict);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rubi-user-dict.json';
    a.click();
    URL.revokeObjectURL(url);
    setImportExportStatus(t('statusExported'), 'success');
  });

  const importFileEl = qs<HTMLInputElement>('importFile');
  qs<HTMLButtonElement>('importBtn').addEventListener('click', () => importFileEl.click());

  importFileEl.addEventListener('change', () => {
    const file = importFileEl.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        dict = importUserDict(text);
        void saveUserDict(dict).then(() => {
          renderList();
          setImportExportStatus(t('statusImported', String(Object.keys(dict).length)), 'success');
        });
      } catch (err) {
        setImportExportStatus(describeError(err), 'error');
      } finally {
        importFileEl.value = '';
      }
    };
    reader.onerror = () => {
      setImportExportStatus(t('statusImportReadError'), 'error');
      importFileEl.value = '';
    };
    reader.readAsText(file);
  });
}

async function init(): Promise<void> {
  document.title = t('optionsPageTitle');
  document.documentElement.lang = chrome.i18n.getUILanguage();
  applyI18n(document);

  dict = await loadUserDict().catch(() => ({}));
  renderList();
  setupForm();
  setupImportExport();
}

init().catch((err: unknown) => {
  console.error('[ルビふり for Googleスライド] options ページの初期化に失敗しました', err);
});
