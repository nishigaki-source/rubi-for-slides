/**
 * ユーザー辞書編集 UI。表層形ごとの読み・見た目(フォント・色・サイズ比)の
 * 上書きを登録・編集・削除でき、JSON でのバックアップ(エクスポート/インポート)にも対応する。
 */
import { removeEntry, upsertEntry, exportUserDict, importUserDict, type UserDictEntryInput } from '../core/userDict';
import type { RubyStyleOverride, UserDictionary } from '../core/types';
import { FONT_OPTIONS, populateFontSelect } from '../shared/fontOptions';
import { SIZE_PRESETS, nearestSizePreset } from '../shared/sizePresets';
import { loadUserDict, saveUserDict } from '../shared/userDictStorage';

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
  if (!style) return '(全体設定のまま)';
  const parts: string[] = [];
  if (style.fontFamily) parts.push(style.fontFamily);
  if (style.color) parts.push(style.color);
  if (style.sizeRatio !== undefined) parts.push(nearestSizePreset(style.sizeRatio).label);
  return parts.length > 0 ? parts.join(' / ') : '(全体設定のまま)';
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
    row.innerHTML = '<td colspan="4">まだ登録された単語はありません</td>';
    tbody.appendChild(row);
    return;
  }

  for (const [surface, entry] of entries) {
    const row = document.createElement('tr');

    const surfaceCell = document.createElement('td');
    surfaceCell.textContent = surface;
    row.appendChild(surfaceCell);

    const readingCell = document.createElement('td');
    readingCell.textContent = entry.reading ?? '(kuromojiのまま)';
    row.appendChild(readingCell);

    const styleCell = document.createElement('td');
    styleCell.textContent = describeStyle(entry.style);
    row.appendChild(styleCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = '編集';
    editBtn.addEventListener('click', () => startEdit(surface));
    actionsCell.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger';
    deleteBtn.textContent = '削除';
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
  qs<HTMLHeadingElement>('formTitle').textContent = '単語を追加';
  qs<HTMLButtonElement>('saveBtn').textContent = '追加する';
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
  qs<HTMLHeadingElement>('formTitle').textContent = `「${surface}」を編集`;
  qs<HTMLButtonElement>('saveBtn').textContent = '保存する';
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
  if (!confirm(`「${surface}」をユーザー辞書から削除します。よろしいですか？`)) return;
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
        setFormStatus(editingSurface ? '更新しました。' : '追加しました。', 'success');
        resetForm();
      });
    } catch (err) {
      setFormStatus(err instanceof Error ? err.message : String(err), 'error');
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
    setImportExportStatus('エクスポートしました。', 'success');
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
          setImportExportStatus(`${Object.keys(dict).length}件のエントリをインポートしました。`, 'success');
        });
      } catch (err) {
        setImportExportStatus(err instanceof Error ? err.message : String(err), 'error');
      } finally {
        importFileEl.value = '';
      }
    };
    reader.onerror = () => {
      setImportExportStatus('ファイルの読み込みに失敗しました。', 'error');
      importFileEl.value = '';
    };
    reader.readAsText(file);
  });
}

async function init(): Promise<void> {
  dict = await loadUserDict().catch(() => ({}));
  renderList();
  setupForm();
  setupImportExport();
}

init().catch((err: unknown) => {
  console.error('[ルビふり for Googleスライド] options ページの初期化に失敗しました', err);
});
