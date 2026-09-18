import { test, expect, type Page } from '@playwright/test';

/**
 * chrome.* API のスタブをページに注入する。
 * 実際の service worker は使わず、chrome.runtime.sendMessage の
 * 'rubi/tokenize' リクエストを window.__kuromojiTokenize(本物の kuromoji、
 * tests/e2e/kuromojiShim.ts)にそのまま委譲する。
 * これにより content script(src/content/index.ts)を一切変更せずに
 * 実ブラウザ上で本物の DOM/SVG API を使ってテストできる。
 */
async function installChromeStub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const storageData: Record<string, unknown> = {};
    const changeListeners: Array<(changes: Record<string, unknown>, area: string) => void> = [];

    function waitForKuromoji(): Promise<void> {
      return new Promise((resolve) => {
        const check = (): void => {
          if ((window as unknown as { __kuromojiTokenize?: unknown }).__kuromojiTokenize) {
            resolve();
          } else {
            setTimeout(check, 20);
          }
        };
        check();
      });
    }

    (window as unknown as { chrome: unknown }).chrome = {
      i18n: {
        // 実際のメッセージカタログは読み込まず、キーをそのまま返す(パネルのUI文言は
        // このe2eテストの検証対象外のため)。
        getMessage: (key: string) => key,
        getUILanguage: () => 'ja',
      },
      runtime: {
        getManifest: () => ({ version: 'e2e-test' }),
        onInstalled: { addListener: () => {} },
        onMessage: { addListener: () => {} },
        sendMessage: async (message: { type: string; requestId: string; text?: string }) => {
          if (message.type === 'rubi/tokenize') {
            await waitForKuromoji();
            try {
              const tokens = await (
                window as unknown as { __kuromojiTokenize: (t: string) => Promise<unknown> }
              ).__kuromojiTokenize(message.text ?? '');
              return { type: 'rubi/tokenize-result', requestId: message.requestId, tokens };
            } catch (err) {
              return {
                type: 'rubi/tokenize-error',
                requestId: message.requestId,
                message: err instanceof Error ? err.message : String(err),
              };
            }
          }
          if (message.type === 'rubi/get-grade-table') {
            return { type: 'rubi/get-grade-table-result', requestId: message.requestId, gradeTable: {} };
          }
          throw new Error('unhandled message type in e2e chrome stub: ' + message.type);
        },
      },
      storage: {
        sync: {
          get: async (keys: string | string[] | undefined) => {
            if (keys === undefined) return { ...storageData };
            const keyList = Array.isArray(keys) ? keys : [keys];
            const result: Record<string, unknown> = {};
            for (const k of keyList) result[k] = storageData[k];
            return result;
          },
          set: async (items: Record<string, unknown>) => {
            const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
            for (const [k, v] of Object.entries(items)) {
              changes[k] = { oldValue: storageData[k], newValue: v };
              storageData[k] = v;
            }
            for (const listener of changeListeners) listener(changes, 'sync');
          },
        },
        onChanged: {
          addListener: (fn: (changes: Record<string, unknown>, area: string) => void) => {
            changeListeners.push(fn);
          },
          removeListener: (fn: (changes: Record<string, unknown>, area: string) => void) => {
            const idx = changeListeners.indexOf(fn);
            if (idx >= 0) changeListeners.splice(idx, 1);
          },
        },
      },
    };
  });
}

/** #rubi-for-slides-overlay-root 配下の span を {text, left, top} の配列で返す。 */
async function getOverlaySpans(
  page: Page
): Promise<Array<{ text: string; left: number; top: number }>> {
  return page.evaluate(() => {
    const root = document.getElementById('rubi-for-slides-overlay-root');
    if (!root) return [];
    return Array.from(root.querySelectorAll('span')).map((s) => {
      const style = s.getAttribute('style') ?? '';
      const left = parseFloat(/left:\s*([\d.]+)px/.exec(style)?.[1] ?? '0');
      const top = parseFloat(/top:\s*([\d.]+)px/.exec(style)?.[1] ?? '0');
      return { text: s.textContent ?? '', left, top };
    });
  });
}

/** #rubi-for-slides-overlay-root 配下の span を {text, color, fontFamily} の配列で返す。 */
async function getOverlaySpanStyles(
  page: Page
): Promise<Array<{ text: string; color: string; fontFamily: string }>> {
  return page.evaluate(() => {
    const root = document.getElementById('rubi-for-slides-overlay-root');
    if (!root) return [];
    return Array.from(root.querySelectorAll('span')).map((s) => {
      const el = s as HTMLElement;
      return { text: el.textContent ?? '', color: el.style.color, fontFamily: el.style.fontFamily };
    });
  });
}

/** 段落の x 属性から文字の中心 x 座標(左端 + フォントサイズ/2 の近似)を取得する。 */
async function getCharCenterX(page: Page, paragraphId: string, char: string): Promise<number> {
  return page.evaluate(
    ({ paragraphId, char }) => {
      const container = document.getElementById(paragraphId);
      if (!container) throw new Error('paragraph not found: ' + paragraphId);
      const el = Array.from(container.querySelectorAll('text')).find((t) => t.textContent === char);
      if (!el) throw new Error('char not found: ' + char);
      const rect = el.getBoundingClientRect();
      return rect.x + rect.width / 2;
    },
    { paragraphId, char }
  );
}

test.beforeEach(async ({ page }) => {
  await installChromeStub(page);
  await page.goto('/tests/e2e/fixtures/slides-like.html');
});

test.describe('ルビの表示', () => {
  test('送り仮名・熟語混じりの文にルビが正しく表示される(段落1)', async ({ page }) => {
    await expect(async () => {
      const spans = await getOverlaySpans(page);
      expect(spans.map((s) => s.text)).toEqual(
        expect.arrayContaining(['た', 'がっこう', 'せいかつ', 'たの'])
      );
    }).toPass({ timeout: 15_000 });
  });

  test('複数文字が1要素にまとまる場合でも正しい文字の上にルビが乗る(実機で発見した不具合の回帰テスト、段落2)', async ({
    page,
  }) => {
    // 実機バグ: 「テッ」が1<text>要素にまとまっていたため、後続の「楽」「学」の
    // ルビが隣の文字(「し」「ぼ」)の位置にズレて表示された。
    await expect(async () => {
      const spans = await getOverlaySpans(page);
      const taNo = spans.find((s) => s.text === 'たの');
      const manaGiven = spans.find((s) => s.text === 'まな');
      expect(taNo, 'ルビ「たの」が見つかること').toBeTruthy();
      expect(manaGiven, 'ルビ「まな」が見つかること').toBeTruthy();

      const rakuCenterX = await getCharCenterX(page, 'editor-i1-paragraph-0', '楽');
      const shiCenterX = await getCharCenterX(page, 'editor-i1-paragraph-0', 'し');
      const gakuCenterX = await getCharCenterX(page, 'editor-i1-paragraph-0', '学');
      const boCenterX = await getCharCenterX(page, 'editor-i1-paragraph-0', 'ぼ');

      // 「たの」は「楽」の近くにあり、「し」の近くにはない(ズレ再発の検出)
      expect(Math.abs(taNo!.left - rakuCenterX)).toBeLessThan(20);
      expect(Math.abs(taNo!.left - shiCenterX)).toBeGreaterThan(20);

      // 「まな」は「学」の近くにあり、「ぼ」の近くにはない
      expect(Math.abs(manaGiven!.left - gakuCenterX)).toBeLessThan(20);
      expect(Math.abs(manaGiven!.left - boCenterX)).toBeGreaterThan(20);
    }).toPass({ timeout: 15_000 });
  });

  test('折り返しをまたぐルビは行ごとに分割して表示される(実機で発見した不具合の回帰テスト、段落3)', async ({
    page,
  }) => {
    await expect(async () => {
      const spans = await getOverlaySpans(page);
      // 段落3(x=10〜80付近)に属するルビだけを抽出
      const paragraph3Spans = spans.filter((s) => s.left >= 0 && s.left <= 100 && s.top >= 150);
      expect(paragraph3Spans.length, '1つの巨大なルビではなく複数行に分割されていること').toBeGreaterThanOrEqual(2);

      const tops = new Set(paragraph3Spans.map((s) => Math.round(s.top / 5) * 5));
      expect(tops.size, '異なる行(異なるY座標)に分かれて配置されていること').toBeGreaterThanOrEqual(2);

      const combined = paragraph3Spans
        .slice()
        .sort((a, b) => a.top - b.top)
        .map((s) => s.text)
        .join('');
      expect(combined).toBe('ついか');
    }).toPass({ timeout: 15_000 });
  });

  test('サムネイル領域の文字にはルビを振らない', async ({ page }) => {
    await expect(async () => {
      const spans = await getOverlaySpans(page);
      expect(spans.map((s) => s.text)).not.toContain('としょ');
    }).toPass({ timeout: 15_000 });
  });

  test('スピーカーノート欄の文字にはルビを振らない', async ({ page }) => {
    await expect(async () => {
      const spans = await getOverlaySpans(page);
      // 「発表」の正しい読みは「はっぴょう」。混同を避けるため部分一致で確認する。
      expect(spans.some((s) => s.text.includes('はっぴょう'))).toBe(false);
    }).toPass({ timeout: 15_000 });
  });
});

test.describe('編集への追従(DomWatcher)', () => {
  test('新しく追加した漢字にも自動的にルビが表示される', async ({ page }) => {
    // 初回描画が完了するまで待つ(段落1のルビが出そろうまで)
    await expect(async () => {
      const spans = await getOverlaySpans(page);
      expect(spans.map((s) => s.text)).toContain('た');
    }).toPass({ timeout: 15_000 });

    // 段落4(空)に新しい文字を追加する = ユーザーが入力する操作を模す
    await page.evaluate(() => {
      const container = document.getElementById('editor-i3-paragraph-0');
      if (!container) throw new Error('editable paragraph not found');
      const svgNS = 'http://www.w3.org/2000/svg';
      const chars = ['新', 'し', 'い'];
      chars.forEach((ch, i) => {
        const t = document.createElementNS(svgNS, 'text');
        t.setAttribute('x', String(10 + i * 32));
        t.setAttribute('y', String(340));
        t.setAttribute('font-size', '32');
        t.textContent = ch;
        container.appendChild(t);
      });
    });

    // DomWatcher のデバウンス(250ms)を超えて待ち、再描画されることを確認する
    await expect(async () => {
      const spans = await getOverlaySpans(page);
      expect(spans.map((s) => s.text)).toContain('あたら');
    }).toPass({ timeout: 15_000 });
  });
});

test.describe('ユーザー辞書による単語ごとの見た目上書き(PLAN.md 3.7節)', () => {
  test('ユーザー辞書で色・フォントを指定した単語だけ見た目が変わり、他の単語は全体設定のままになる', async ({
    page,
  }) => {
    // 初回描画が完了するまで待つ
    await expect(async () => {
      const spans = await getOverlaySpans(page);
      expect(spans.map((s) => s.text)).toContain('がっこう');
    }).toPass({ timeout: 15_000 });

    // 「学校」にだけ色・フォントの個別上書きを設定する
    await page.evaluate(async () => {
      await (
        window as unknown as { chrome: { storage: { sync: { set: (v: unknown) => Promise<void> } } } }
      ).chrome.storage.sync.set({
        rubiUserDict: { 学校: { style: { color: '#ff0000', fontFamily: 'Georgia' } } },
      });
      // rubiUserDict 自体は onSettingsChanged の監視対象外なので、
      // 再描画をトリガーするために rubiSettings を(同じ値で)書き直す。
      await (
        window as unknown as { chrome: { storage: { sync: { set: (v: unknown) => Promise<void> } } } }
      ).chrome.storage.sync.set({
        rubiSettings: { enabled: true, sizeRatio: 0.5, gradeFilterMaxGrade: null },
      });
    });

    await expect(async () => {
      const styles = await getOverlaySpanStyles(page);
      const gakkou = styles.find((s) => s.text === 'がっこう');
      const tano = styles.find((s) => s.text === 'たの');
      expect(gakkou, 'ルビ「がっこう」が見つかること').toBeTruthy();
      expect(tano, 'ルビ「たの」が見つかること').toBeTruthy();

      // 個別上書きした単語は指定した色・フォントになる
      expect(gakkou!.color).toBe('rgb(255, 0, 0)');
      expect(gakkou!.fontFamily).toBe('Georgia');

      // 上書きしていない単語は全体設定の既定値のまま
      expect(tano!.color).not.toBe('rgb(255, 0, 0)');
      expect(tano!.fontFamily).not.toBe('Georgia');
    }).toPass({ timeout: 15_000 });
  });
});

test.describe('ON/OFF切り替え', () => {
  test('設定をOFFにするとルビが消え、ONに戻すと再表示される', async ({ page }) => {
    await expect(async () => {
      const spans = await getOverlaySpans(page);
      expect(spans.length).toBeGreaterThan(0);
    }).toPass({ timeout: 15_000 });

    // popup が chrome.storage.sync.set 経由で行うのと同じ操作を直接実行する
    await page.evaluate(async () => {
      await (window as unknown as { chrome: { storage: { sync: { set: (v: unknown) => Promise<void> } } } })
        .chrome.storage.sync.set({
          rubiSettings: { enabled: false, sizeRatio: 0.5, gradeFilterMaxGrade: null },
        });
    });

    await expect(async () => {
      const root = await page.evaluate(() => {
        const el = document.getElementById('rubi-for-slides-overlay-root');
        return el ? getComputedStyle(el).display : null;
      });
      expect(root).toBe('none');
    }).toPass({ timeout: 15_000 });

    // ONに戻すと再度表示される
    await page.evaluate(async () => {
      await (window as unknown as { chrome: { storage: { sync: { set: (v: unknown) => Promise<void> } } } })
        .chrome.storage.sync.set({
          rubiSettings: { enabled: true, sizeRatio: 0.5, gradeFilterMaxGrade: null },
        });
    });

    await expect(async () => {
      const spans = await getOverlaySpans(page);
      expect(spans.length).toBeGreaterThan(0);
    }).toPass({ timeout: 15_000 });
  });
});
