/**
 * ユーザー辞書の chrome.storage.sync 経由での読み書き。
 * バリデーション自体は core/userDict.ts が担当し、ここではストレージ I/O のみを行う。
 */
import type { UserDictionary } from '../core/types';

const STORAGE_KEY = 'rubiUserDict';

export async function loadUserDict(): Promise<UserDictionary> {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] as UserDictionary | undefined) ?? {};
}

export async function saveUserDict(dict: UserDictionary): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: dict });
}
