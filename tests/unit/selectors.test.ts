import { describe, expect, it } from 'vitest';
import { choosePageRoot, pageRootIdFor } from '@content/selectors';

describe('pageRootIdFor', () => {
  it('ページルートの id は "editor-" + スライドの objectId', () => {
    expect(pageRootIdFor('p')).toBe('editor-p');
    expect(pageRootIdFor('p1')).toBe('editor-p1');
    expect(pageRootIdFor('h273037817fe35b37_0_0')).toBe('editor-h273037817fe35b37_0_0');
  });
});

describe('choosePageRoot', () => {
  it('複製・コピーで作られたスライド(objectId に "_" を含む)も id で見つけられる', () => {
    // 実機でスライドを複製したときの DOM(元のページは display:none で残る)
    const candidates = [
      { id: 'editor-p', rendered: false },
      { id: 'editor-h273037817fe35b37_0_0', rendered: true },
    ];
    expect(choosePageRoot(candidates, 'h273037817fe35b37_0_0')?.id).toBe('editor-h273037817fe35b37_0_0');
  });

  it('"p" 以外で始まる objectId だけのプレゼンテーションでも null にならない', () => {
    const candidates = [{ id: 'editor-g2c3d4e5_0_12', rendered: true }];
    expect(choosePageRoot(candidates, 'g2c3d4e5_0_12')?.id).toBe('editor-g2c3d4e5_0_12');
    expect(choosePageRoot(candidates)?.id).toBe('editor-g2c3d4e5_0_12');
  });

  it('id が一致すれば、表示中でなくてもそのページを選ぶ', () => {
    const candidates = [
      { id: 'editor-p1', rendered: true },
      { id: 'editor-p3', rendered: false },
    ];
    expect(choosePageRoot(candidates, 'p3')?.id).toBe('editor-p3');
  });

  it('"p1" と "p10" のように前方一致するだけの id は取り違えない', () => {
    const candidates = [
      { id: 'editor-p10', rendered: true },
      { id: 'editor-p1', rendered: false },
    ];
    expect(choosePageRoot(candidates, 'p1')?.id).toBe('editor-p1');
  });

  it('pageObjectId が無い、または一致しなければ表示中のページを選ぶ', () => {
    const candidates = [
      { id: 'editor-p1', rendered: false },
      { id: 'editor-p3', rendered: true },
    ];
    expect(choosePageRoot(candidates)?.id).toBe('editor-p3');
    expect(choosePageRoot(candidates, 'unknown')?.id).toBe('editor-p3');
  });

  it('候補が無ければ null', () => {
    expect(choosePageRoot([], 'p1')).toBeNull();
  });
});
