import { beforeAll, describe, expect, it } from 'vitest';
import { AUTH_ERROR_MESSAGE_KEYS, classifyAuthError } from '@core/authError';

describe('classifyAuthError(Chrome の getAuthToken のメッセージを、原因の種類に分ける)', () => {
  it('Chrome にログインしていない', () => {
    expect(classifyAuthError('The user is not signed in.')).toBe('not-signed-in');
  });

  it('許可しなかった・取り消された・拒否された', () => {
    expect(classifyAuthError('The user did not approve access.')).toBe('not-approved');
    expect(classifyAuthError('OAuth2 not granted or revoked.')).toBe('not-approved');
    expect(classifyAuthError('access_denied')).toBe('not-approved');
  });

  it('ネットワークの失敗', () => {
    expect(classifyAuthError('Authorization page could not be loaded.')).toBe('network');
    expect(classifyAuthError('net::ERR_INTERNET_DISCONNECTED')).toBe('network');
  });

  it('Chrome 以外のブラウザ(クライアント ID を受け付けない・未対応)', () => {
    expect(classifyAuthError("OAuth2 request failed: Service responded with error: 'bad client id: 665117522331-xxx'")).toBe(
      'unsupported-browser'
    );
    expect(classifyAuthError('Invalid OAuth2 Client ID.')).toBe('unsupported-browser');
    expect(classifyAuthError('This API is not supported on this browser')).toBe('unsupported-browser');
  });

  it('知らないメッセージ・空は other(案内は出すが、原因は決めつけない)', () => {
    expect(classifyAuthError('Something unexpected happened')).toBe('other');
    expect(classifyAuthError('')).toBe('other');
    expect(classifyAuthError(undefined)).toBe('other');
  });

  it('大文字・小文字は区別しない', () => {
    expect(classifyAuthError('THE USER IS NOT SIGNED IN.')).toBe('not-signed-in');
  });

  it('すべての種類に、画面に出す文言のキーがある', () => {
    expect(Object.keys(AUTH_ERROR_MESSAGE_KEYS).sort()).toEqual(
      ['network', 'not-approved', 'not-signed-in', 'other', 'unsupported-browser']
    );
  });
});

describe('authError(許可の失敗を、案内 + 元のメッセージにする)', () => {
  beforeAll(() => {
    // chrome.i18n の代わり: メッセージのキーをそのまま返す
    (globalThis as unknown as { chrome: unknown }).chrome = { i18n: { getMessage: (key: string) => key } };
  });

  it('原因に合った案内の後ろに、元のメッセージを括弧で添える', async () => {
    const { authError } = await import('@worker/auth');
    const err = authError('The user is not signed in.');
    expect(err.message).toBe('errorAuthNotSignedIn\n(The user is not signed in.)');
  });

  it('元のメッセージが無ければ、案内だけ', async () => {
    const { authError } = await import('@worker/auth');
    expect(authError(undefined).message).toBe('errorAuthOther');
  });
});
