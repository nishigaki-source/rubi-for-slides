/** vite.config.ts の define で注入されるビルド日時(ISO 8601)。 */
declare const __BUILD_TIME__: string;
/**
 * 動作確認用ビルド(`npm run build:qa`)のときだけ true。ページから書き込み等を指示できる
 * 受け口(src/content/qaBridge.ts)を有効にする。ストア用のビルドでは false になり、コードごと消える。
 */
declare const __RUBI_QA__: boolean;
