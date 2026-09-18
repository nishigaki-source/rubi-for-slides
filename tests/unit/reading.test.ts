import { describe, expect, it } from 'vitest';
import { buildRubyToken, buildRubyTokens } from '@core/reading';
import type { TokenizedWord } from '@core/types';

function ruby(surface: string, reading: string | undefined): ReturnType<typeof buildRubyToken> {
  return buildRubyToken({ surface, reading });
}

describe('buildRubyToken: 送り仮名の分離（末尾）', () => {
  it('食べる -> 食=た のみにルビを振る', () => {
    const result = ruby('食べる', 'タベル');
    expect(result.rubyRanges).toEqual([{ start: 0, end: 1, kana: 'た' }]);
  });

  it('楽しい -> 楽=たの にルビを振る', () => {
    const result = ruby('楽しい', 'タノシイ');
    expect(result.rubyRanges).toEqual([{ start: 0, end: 1, kana: 'たの' }]);
  });
});

describe('buildRubyToken: 全部漢字（グループルビ）', () => {
  it('学校 -> 単語全体に がっこう を振る', () => {
    const result = ruby('学校', 'ガッコウ');
    expect(result.rubyRanges).toEqual([{ start: 0, end: 2, kana: 'がっこう' }]);
  });

  it('4文字の熟語（東京都庁）でも単語全体にグループルビを振る', () => {
    const result = ruby('東京都庁', 'トウキョウトチョウ');
    expect(result.rubyRanges).toEqual([{ start: 0, end: 4, kana: 'とうきょうとちょう' }]);
  });
});

describe('buildRubyToken: 送り仮名が語中に挟まる場合', () => {
  it('打ち合わせ -> 打=う, 合=あ にそれぞれルビを振る', () => {
    const result = ruby('打ち合わせ', 'ウチアワセ');
    expect(result.rubyRanges).toEqual([
      { start: 0, end: 1, kana: 'う' },
      { start: 2, end: 3, kana: 'あ' },
    ]);
  });

  it('自由が丘 -> 自由=じゆう(グループ), 丘=おか にルビを振る', () => {
    const result = ruby('自由が丘', 'ジユウガオカ');
    expect(result.rubyRanges).toEqual([
      { start: 0, end: 2, kana: 'じゆう' },
      { start: 3, end: 4, kana: 'おか' },
    ]);
  });

  it('先頭にかなが来る場合（お寺）も正しく分割する', () => {
    const result = ruby('お寺', 'オテラ');
    expect(result.rubyRanges).toEqual([{ start: 1, end: 2, kana: 'てら' }]);
  });
});

describe('buildRubyToken: ルビ対象外のトークン', () => {
  it('漢字を含まないトークンにはルビを振らない', () => {
    expect(ruby('たべる', 'タベル').rubyRanges).toEqual([]);
    expect(ruby('。', '。').rubyRanges).toEqual([]);
    expect(ruby('123', undefined).rubyRanges).toEqual([]);
  });

  it('読みが決定できないトークン(未知語マーカー "*")にはルビを振らない', () => {
    expect(ruby('漢字', '*').rubyRanges).toEqual([]);
  });

  it('読みがundefinedのトークンにはルビを振らない', () => {
    expect(ruby('漢字', undefined).rubyRanges).toEqual([]);
  });
});

describe('buildRubyToken: 整合が取れない場合のフォールバック', () => {
  it('かなセグメントが読みと一致しない場合、単語全体をグループルビにする', () => {
    // 実際には起こりにくいが、読みが表層形と整合しないケースを人工的に再現する
    const result = ruby('打ち合わせ', 'トウゴウ');
    expect(result.rubyRanges).toEqual([{ start: 0, end: 5, kana: 'とうごう' }]);
  });
});

describe('buildRubyToken: ユーザー辞書', () => {
  it('ユーザー辞書の読みで上書きする(単語全体へのグループルビ)', () => {
    const result = buildRubyToken(
      { surface: '生憎', reading: 'アイニク' },
      { userDict: { 生憎: { reading: 'あいにく' } } }
    );
    expect(result.rubyRanges).toEqual([{ start: 0, end: 2, kana: 'あいにく', style: undefined }]);
  });

  it('ユーザー辞書は学年フィルタより優先される', () => {
    const result = buildRubyToken(
      { surface: '学校', reading: 'ガッコウ' },
      {
        userDict: { 学校: { reading: 'がっこう' } },
        gradeFilter: { maxGrade: 6, gradeTable: { 学: 1, 校: 1 } },
      }
    );
    // 学年フィルタだけなら対象外になるはずだが、ユーザー辞書指定があるため振られる
    expect(result.rubyRanges).toEqual([{ start: 0, end: 2, kana: 'がっこう', style: undefined }]);
  });

  it('読みの上書きに見た目の指定も含まれていれば各区間に反映する', () => {
    const style = { color: '#ff0000', sizeRatio: 0.6 };
    const result = buildRubyToken(
      { surface: '生憎', reading: 'アイニク' },
      { userDict: { 生憎: { reading: 'あいにく', style } } }
    );
    expect(result.rubyRanges).toEqual([{ start: 0, end: 2, kana: 'あいにく', style }]);
  });

  it('見た目だけの指定(読み省略)は kuromoji の読みをそのまま使い、見た目だけ上書きする', () => {
    const style = { fontFamily: 'Kosugi Maru' };
    const result = buildRubyToken(
      { surface: '食べる', reading: 'タベル' },
      { userDict: { 食べる: { style } } }
    );
    // 通常どおり送り仮名分離された結果(食=た)に、見た目の上書きだけが乗る
    expect(result.rubyRanges).toEqual([{ start: 0, end: 1, kana: 'た', style }]);
  });

  it('見た目だけの指定でも学年フィルタより優先される', () => {
    const style = { color: '#1a73e8' };
    const result = buildRubyToken(
      { surface: '学校', reading: 'ガッコウ' },
      {
        userDict: { 学校: { style } },
        gradeFilter: { maxGrade: 6, gradeTable: { 学: 1, 校: 1 } },
      }
    );
    expect(result.rubyRanges).toEqual([{ start: 0, end: 2, kana: 'がっこう', style }]);
  });
});

describe('buildRubyToken: 学年フィルタ', () => {
  const gradeTable = { 学: 1, 校: 1, 食: 2 };

  it('トークン内の漢字がすべて指定学年以下ならルビを振らない', () => {
    const result = buildRubyToken(
      { surface: '学校', reading: 'ガッコウ' },
      { gradeFilter: { maxGrade: 1, gradeTable } }
    );
    expect(result.rubyRanges).toEqual([]);
  });

  it('学年不明の漢字が含まれる場合は安全側でルビを振る', () => {
    const result = buildRubyToken(
      { surface: '生活', reading: 'セイカツ' },
      { gradeFilter: { maxGrade: 6, gradeTable } } // 生・活はgradeTableに無い
    );
    expect(result.rubyRanges.length).toBeGreaterThan(0);
  });

  it('指定学年より上の漢字を含む場合はルビを振る', () => {
    const result = buildRubyToken(
      { surface: '食べる', reading: 'タベル' },
      { gradeFilter: { maxGrade: 1, gradeTable } } // 食はgrade2なのでmaxGrade1では対象外にならない
    );
    expect(result.rubyRanges).toEqual([{ start: 0, end: 1, kana: 'た' }]);
  });

  it('gradeFilterを指定しなければ全ての漢字にルビを振る(既定動作)', () => {
    const result = buildRubyToken({ surface: '学校', reading: 'ガッコウ' });
    expect(result.rubyRanges).toEqual([{ start: 0, end: 2, kana: 'がっこう' }]);
  });
});

describe('buildRubyTokens: 複数トークンの一括処理', () => {
  it('文全体を処理して各トークンのルビを返す', () => {
    const tokens: TokenizedWord[] = [
      { surface: '食べる', reading: 'タベル' },
      { surface: '学校', reading: 'ガッコウ' },
      { surface: '生活', reading: 'セイカツ' },
      { surface: 'は', reading: 'ハ' },
      { surface: '楽しい', reading: 'タノシイ' },
      { surface: '。', reading: '。' },
    ];
    const results = buildRubyTokens(tokens);
    expect(results).toHaveLength(6);
    expect(results[0]?.rubyRanges).toEqual([{ start: 0, end: 1, kana: 'た' }]);
    expect(results[1]?.rubyRanges).toEqual([{ start: 0, end: 2, kana: 'がっこう' }]);
    expect(results[2]?.rubyRanges).toEqual([{ start: 0, end: 2, kana: 'せいかつ' }]);
    expect(results[3]?.rubyRanges).toEqual([]); // 「は」は漢字を含まない
    expect(results[4]?.rubyRanges).toEqual([{ start: 0, end: 1, kana: 'たの' }]);
    expect(results[5]?.rubyRanges).toEqual([]); // 記号
  });
});

describe('buildRubyTokens: ユーザー辞書の表層形がトークン境界と一致しない場合', () => {
  it('複数トークンにまたがる辞書語は 1 つにまとめて辞書の読みを使う(実機で発見: 雀魂 -> 雀|魂)', () => {
    const tokens: TokenizedWord[] = [
      { surface: '雀', reading: 'スズメ' },
      { surface: '魂', reading: 'タマシイ' },
      { surface: 'で', reading: 'デ' },
    ];
    const results = buildRubyTokens(tokens, { userDict: { 雀魂: { reading: 'じゃんたま' } } });
    expect(results.map((r) => r.surface)).toEqual(['雀魂', 'で']);
    expect(results[0]?.rubyRanges).toEqual([{ start: 0, end: 2, kana: 'じゃんたま', style: undefined }]);
  });

  it('見た目だけの上書きでも複数トークンをまとめ、読みは元トークンの連結を使う', () => {
    const tokens: TokenizedWord[] = [
      { surface: '雀', reading: 'スズメ' },
      { surface: '魂', reading: 'タマシイ' },
    ];
    const results = buildRubyTokens(tokens, { userDict: { 雀魂: { style: { color: '#ff0000' } } } });
    expect(results).toHaveLength(1);
    expect(results[0]?.rubyRanges).toEqual([{ start: 0, end: 2, kana: 'すずめたましい', style: { color: '#ff0000' } }]);
  });

  it('トークンの途中に現れる辞書語も切り出し、残りの断片には(読み不明のため)ルビを振らない', () => {
    const tokens: TokenizedWord[] = [{ surface: '大学校', reading: 'ダイガッコウ' }];
    const results = buildRubyTokens(tokens, { userDict: { 学校: { reading: 'がっこう' } } });
    expect(results.map((r) => r.surface)).toEqual(['大', '学校']);
    expect(results[0]?.rubyRanges).toEqual([]);
    expect(results[1]?.rubyRanges).toEqual([{ start: 0, end: 2, kana: 'がっこう', style: undefined }]);
  });

  it('辞書語が現れなければトークン列はそのまま', () => {
    const tokens: TokenizedWord[] = [{ surface: '学校', reading: 'ガッコウ' }];
    const results = buildRubyTokens(tokens, { userDict: { 雀魂: { reading: 'じゃんたま' } } });
    expect(results[0]?.rubyRanges).toEqual([{ start: 0, end: 2, kana: 'がっこう' }]);
  });
});
