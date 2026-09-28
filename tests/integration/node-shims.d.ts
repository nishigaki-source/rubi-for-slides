// 結合テストで使う Node の関数の型だけを書いたもの(@types/node を入れずに済ませるため)
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array<ArrayBuffer>;
}
declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
