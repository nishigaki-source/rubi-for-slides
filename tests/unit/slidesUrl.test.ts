import { describe, expect, it } from 'vitest';
import { parseSlidesUrl } from '@core/slidesUrl';

describe('parseSlidesUrl', () => {
  it('編集画面のURLからpresentationIdとpageObjectIdを取り出す', () => {
    const url =
      'https://docs.google.com/presentation/d/1t9VirPMZHKywOp4JXztlcoiscQyvDHC9ZGMgIPt-WIQ/edit?slide=id.p3#slide=id.p3';
    expect(parseSlidesUrl(url)).toEqual({
      presentationId: '1t9VirPMZHKywOp4JXztlcoiscQyvDHC9ZGMgIPt-WIQ',
      pageObjectId: 'p3',
    });
  });

  it('末尾のハッシュだけにslide情報がある場合でも取り出せる', () => {
    const url = 'https://docs.google.com/presentation/d/abc123/edit#slide=id.g1234_0_0';
    expect(parseSlidesUrl(url)).toEqual({ presentationId: 'abc123', pageObjectId: 'g1234_0_0' });
  });

  it('presentationIdが無いURLはnullを返す', () => {
    expect(parseSlidesUrl('https://docs.google.com/document/d/abc123/edit')).toBeNull();
  });

  it('slide情報が無いURLはnullを返す', () => {
    expect(parseSlidesUrl('https://docs.google.com/presentation/d/abc123/edit')).toBeNull();
  });
});
