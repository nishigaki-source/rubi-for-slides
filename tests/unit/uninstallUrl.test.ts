import { afterEach, describe, expect, it, vi } from 'vitest';
import { UNINSTALL_PAGE_URL, buildUninstallUrl, shouldSetUninstallUrl } from '@core/uninstallUrl';

describe('buildUninstallUrl', () => {
  it('バージョンだけを付ける(個人や環境を特定できる情報は付けない)', () => {
    expect(buildUninstallUrl('1.0.1')).toBe(`${UNINSTALL_PAGE_URL}?v=1.0.1`);
  });

  it('URL に使えない文字はエスケープし、長すぎるときは何も付けない', () => {
    expect(buildUninstallUrl('1 0&1')).toBe(`${UNINSTALL_PAGE_URL}?v=1%200%261`);
    expect(buildUninstallUrl('x'.repeat(2000))).toBe(UNINSTALL_PAGE_URL);
  });

  it('案内ページは https', () => {
    expect(UNINSTALL_PAGE_URL.startsWith('https://')).toBe(true);
  });
});

describe('shouldSetUninstallUrl(開発版・管理者が入れたものには設定しない)', () => {
  it('普通のインストール(ストアなど)だけ設定する', () => {
    expect(shouldSetUninstallUrl('normal')).toBe(true);
    expect(shouldSetUninstallUrl('development')).toBe(false);
    expect(shouldSetUninstallUrl('admin')).toBe(false);
    expect(shouldSetUninstallUrl('sideload')).toBe(false);
    expect(shouldSetUninstallUrl('other')).toBe(false);
  });

  it('installType が取れないときは、ストアからの更新の URL があるかで決める', () => {
    expect(shouldSetUninstallUrl(undefined, true)).toBe(true);
    expect(shouldSetUninstallUrl(undefined, false)).toBe(false);
    expect(shouldSetUninstallUrl(undefined)).toBe(false);
  });
});

describe('setUninstallSurveyUrl(service worker)', () => {
  const setUninstallURL = vi.fn(async () => undefined);
  const stub = (opts: { installType?: string; getSelfFails?: boolean; updateUrl?: string }) => {
    setUninstallURL.mockClear();
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: {
        getManifest: () => ({ version: '1.0.1', ...(opts.updateUrl ? { update_url: opts.updateUrl } : {}) }),
        setUninstallURL,
      },
      management: {
        getSelf: async () => {
          if (opts.getSelfFails) throw new Error('not allowed');
          return { installType: opts.installType };
        },
      },
    };
  };
  afterEach(() => vi.restoreAllMocks());

  it('ストアからのインストールなら、バージョン付きの案内ページを登録する', async () => {
    stub({ installType: 'normal' });
    const { setUninstallSurveyUrl } = await import('@worker/uninstallUrl');
    await setUninstallSurveyUrl();
    expect(setUninstallURL).toHaveBeenCalledWith(`${UNINSTALL_PAGE_URL}?v=1.0.1`);
  });

  it('開発版・管理者のインストールでは登録しない', async () => {
    const { setUninstallSurveyUrl } = await import('@worker/uninstallUrl');
    for (const installType of ['development', 'admin']) {
      stub({ installType });
      await setUninstallSurveyUrl();
      expect(setUninstallURL).not.toHaveBeenCalled();
    }
  });

  it('自分の情報が取れないときは、update_url があるときだけ登録する', async () => {
    const { setUninstallSurveyUrl } = await import('@worker/uninstallUrl');
    stub({ getSelfFails: true, updateUrl: 'https://clients2.google.com/service/update2/crx' });
    await setUninstallSurveyUrl();
    expect(setUninstallURL).toHaveBeenCalledTimes(1);
    stub({ getSelfFails: true });
    await setUninstallSurveyUrl();
    expect(setUninstallURL).not.toHaveBeenCalled();
  });

  it('登録に失敗しても、例外を投げない(拡張機能の動作に関係しない)', async () => {
    stub({ installType: 'normal' });
    setUninstallURL.mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { setUninstallSurveyUrl } = await import('@worker/uninstallUrl');
    await expect(setUninstallSurveyUrl()).resolves.toBeUndefined();
  });
});
