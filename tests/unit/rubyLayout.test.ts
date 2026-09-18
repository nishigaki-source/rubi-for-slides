import { describe, expect, it } from 'vitest';
import { computeRubyBoxAboveBody, computeRubyFontSize, pickUniformRubyFontSize } from '@content/rubyLayout';

describe('computeRubyFontSize', () => {
  it('ルビが本文の幅に十分収まる場合は高さ基準のサイズを使う', () => {
    // 本文40x40の1文字に対し、1文字のルビ(例:「た」)
    const size = computeRubyFontSize(40, 40, 1, 0.5);
    expect(size).toBe(20); // 40 * 0.5、幅制約(40/1*1.4=56)より小さいのでそのまま
  });

  it('実機で発見した不具合1の再現: 2文字本文に4文字ルビが乗る場合、隣とほぼ重ならない範囲に収める', () => {
    // 「神経」(本文2文字、1文字あたり約15.8x22.4px)に「しんけい」(4文字)のルビ
    const boxWidth = 15.83 * 2;
    const boxHeight = 22.43;
    const size = computeRubyFontSize(boxWidth, boxHeight, 4, 0.5);
    // ルビ全体の推定幅が本文幅をわずかしか超えないこと(隣の語のルビとの重なりを最小化する)
    expect(size * 4).toBeLessThan(boxWidth * 1.15);
  });

  it('実機で発見した不具合2の再現: 本文フォントが小さいスライドで5文字ルビが最小サイズに潰れない', () => {
    // 「麻雀」(本文2文字、1文字あたり約15.8x22.4px)に「まーじゃん」(5文字)のルビ。
    // これほど極端なケース(2文字の本文に5文字の読み)では、隣の語との
    // わずかな重なりを完全には避けられないが、少なくとも最小フォント
    // サイズ(既定8px)は保証され、以前のように6px程度まで潰れて
    // 事実上読めなくなることはない(実機で発見・修正)。
    const boxWidth = 15.83 * 2;
    const boxHeight = 22.43;
    const size = computeRubyFontSize(boxWidth, boxHeight, 5, 0.5);
    expect(size).toBeGreaterThanOrEqual(8);
  });

  it('既定の最小フォントサイズ(8px)を下回らない', () => {
    const size = computeRubyFontSize(10, 40, 20, 0.5); // 非常に多い文字数
    expect(size).toBeGreaterThanOrEqual(8);
  });

  it('カスタムの最小サイズ・安全係数を尊重する', () => {
    const size = computeRubyFontSize(100, 40, 10, 0.5, { minFontSize: 8, widthSafetyFactor: 1 });
    expect(size).toBeGreaterThanOrEqual(8);
  });

  it('kanaCharCountが0の場合は高さ基準にフォールバックする', () => {
    expect(computeRubyFontSize(100, 40, 0, 0.5)).toBe(20);
  });

  it('boxWidthが0以下の場合は高さ基準にフォールバックする', () => {
    expect(computeRubyFontSize(0, 40, 3, 0.5)).toBe(20);
  });
});

describe('pickUniformRubyFontSize', () => {
  it('実機で発見した不具合の再現: 隣接する単語間でサイズを揃えるため最小値を選ぶ', () => {
    // 「最小」(さいしょう=5文字)は小さく、「単位」(たんい=3文字)は大きく
    // 計算されていたが、段落全体では小さい方(最小値)に統一する
    const saishou = 10; // さいしょうの個別最適サイズ
    const tanni = 15; // たんいの個別最適サイズ(何もしないとバラバラに見える)
    expect(pickUniformRubyFontSize([saishou, tanni])).toBe(10);
  });

  it('候補が1つならそのまま返す', () => {
    expect(pickUniformRubyFontSize([12])).toBe(12);
  });

  it('空配列は0を返す', () => {
    expect(pickUniformRubyFontSize([])).toBe(0);
  });
});

describe('computeRubyBoxAboveBody', () => {
  it('実機で発見した不具合の再現: モード B が本文の矩形をそのまま使うと、ルビが本文の上ではなく本文と重なる位置に置かれ、幅も足りず折り返されていた', () => {
    // 「麻雀」(本文2文字、1文字あたり幅58px・高さ84px、実機のタイトルで実測した値)に
    // 「まーじゃん」(5文字)のルビ、フォントサイズは幅基準で決まった約24.4px
    const bodyBox = { x: 896.5, y: 288.5, width: 116.2, height: 84.3 };
    const fontSizePx = 24.4;
    const box = computeRubyBoxAboveBody(bodyBox, fontSizePx, 5);

    // ルビは本文の真上(本文の上端より上)に配置される
    expect(box.y + box.height).toBeLessThanOrEqual(bodyBox.y);
    // ルビ5文字がフォントサイズどおり1行で収まる幅が確保されている(折り返されない)
    expect(box.width).toBeGreaterThanOrEqual(fontSizePx * 5);
    // 本文の水平中央に揃っている
    expect(box.x + box.width / 2).toBeCloseTo(bodyBox.x + bodyBox.width / 2, 5);
  });

  it('ルビの幅が本文幅より狭い場合は、本文幅を下回らない', () => {
    const bodyBox = { x: 0, y: 100, width: 200, height: 40 };
    const box = computeRubyBoxAboveBody(bodyBox, 10, 2);
    expect(box.width).toBeGreaterThanOrEqual(bodyBox.width);
  });

  it('本文との間に隙間を空ける(ルビの下端が本文の上端に接しない)', () => {
    const bodyBox = { x: 0, y: 100, width: 40, height: 20 };
    const box = computeRubyBoxAboveBody(bodyBox, 10, 2);
    expect(box.y + box.height).toBeLessThan(bodyBox.y);
  });
});
