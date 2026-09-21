/**
 * drive.file スコープ用の「ファイルへのアクセス権が無い」状態の扱い(chrome 非依存)。
 *
 * drive.file はユーザーが Google Picker で選んだファイルにしか触れない。未許可のスライドに
 * Slides API を呼ぶと 403/404 が返るので、その場合は Picker で許可を求めてから 1 回だけ再試行する。
 */

/** 未許可のファイルに Slides API を呼んだときに返る HTTP ステータス。 */
export function isFileAccessStatus(status: number): boolean {
  return status === 403 || status === 404;
}

/** 対象のスライドへのアクセス権が無い(Picker での許可が必要)ことを表すエラー。 */
export class FileAccessRequiredError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`file access required (status: ${status})`);
    this.name = 'FileAccessRequiredError';
    this.status = status;
  }
}

/** ユーザーが許可しなかった(Picker を閉じた・別のファイルを選んだ)ことを表すエラー。 */
export class FileAccessDeniedError extends Error {
  constructor() {
    super('file access was not granted');
    this.name = 'FileAccessDeniedError';
  }
}

/**
 * run() を実行し、FileAccessRequiredError で失敗したら requestAccess() で許可を求めて 1 回だけ再試行する。
 * 許可が得られなければ FileAccessDeniedError、再試行でもまだ失敗するなら、そのエラーをそのまま投げる。
 */
export async function withFileAccess<T>(
  run: () => Promise<T>,
  requestAccess: () => Promise<boolean>
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!(err instanceof FileAccessRequiredError)) throw err;
  }
  const granted = await requestAccess();
  if (!granted) throw new FileAccessDeniedError();
  return run();
}
