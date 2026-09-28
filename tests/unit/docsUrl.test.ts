import { describe, expect, it } from 'vitest';
import { parseDocsUrl } from '@core/docs/docsUrl';
import { isDocsCommandRequest } from '@core/docs/messages';

describe('parseDocsUrl: URL から文書 ID とタブ ID を取り出す', () => {
  it('タブ付きの URL', () => {
    expect(parseDocsUrl('https://docs.google.com/document/d/1-gBtz_Ys-9/edit?tab=t.0#heading=h.a3')).toEqual({
      documentId: '1-gBtz_Ys-9',
      tabId: 't.0',
    });
  });

  it('タブの指定が無い URL・アカウント番号付きの URL', () => {
    expect(parseDocsUrl('https://docs.google.com/document/d/abc/edit')).toEqual({ documentId: 'abc' });
    expect(parseDocsUrl('https://docs.google.com/document/u/1/d/abc/edit?tab=t.xyz12')).toEqual({ documentId: 'abc', tabId: 't.xyz12' });
  });

  it('ドキュメント以外(スライド・文書一覧・別のサイト)は null', () => {
    expect(parseDocsUrl('https://docs.google.com/presentation/d/abc/edit')).toBeNull();
    expect(parseDocsUrl('https://docs.google.com/document/u/0/')).toBeNull();
    expect(parseDocsUrl('https://example.com/document/d/abc/edit')).toBeNull();
    expect(parseDocsUrl('not a url')).toBeNull();
  });
});

describe('isDocsCommandRequest', () => {
  it('決まった形の指示だけを受け付ける', () => {
    expect(isDocsCommandRequest({ type: 'rubi-docs/command', command: 'write', documentId: 'abc' })).toBe(true);
    expect(isDocsCommandRequest({ type: 'rubi-docs/command', command: 'refresh', documentId: 'abc' })).toBe(true);
    expect(isDocsCommandRequest({ type: 'rubi-docs/command', command: 'format-disk' })).toBe(false);
    expect(isDocsCommandRequest(null)).toBe(false);
  });
});
