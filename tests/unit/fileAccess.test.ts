import { describe, expect, it, vi } from 'vitest';
import {
  FileAccessDeniedError,
  FileAccessRequiredError,
  isFileAccessStatus,
  withFileAccess,
} from '@core/fileAccess';

describe('isFileAccessStatus', () => {
  it('403 と 404 だけを「アクセス権なし」とみなす', () => {
    expect(isFileAccessStatus(403)).toBe(true);
    expect(isFileAccessStatus(404)).toBe(true);
    expect(isFileAccessStatus(401)).toBe(false);
    expect(isFileAccessStatus(500)).toBe(false);
    expect(isFileAccessStatus(200)).toBe(false);
  });
});

describe('withFileAccess', () => {
  it('成功すればアクセス許可を求めない', async () => {
    const run = vi.fn().mockResolvedValue('ok');
    const requestAccess = vi.fn();
    await expect(withFileAccess(run, requestAccess)).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(1);
    expect(requestAccess).not.toHaveBeenCalled();
  });

  it('アクセス権が無ければ許可を求め、許可されたら 1 回だけ再試行する', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new FileAccessRequiredError(404))
      .mockResolvedValueOnce('ok');
    const requestAccess = vi.fn().mockResolvedValue(true);
    await expect(withFileAccess(run, requestAccess)).resolves.toBe('ok');
    expect(requestAccess).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('許可されなければ FileAccessDeniedError を投げ、再試行しない', async () => {
    const run = vi.fn().mockRejectedValue(new FileAccessRequiredError(403));
    const requestAccess = vi.fn().mockResolvedValue(false);
    await expect(withFileAccess(run, requestAccess)).rejects.toBeInstanceOf(FileAccessDeniedError);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('許可後もまだアクセス権が無ければ、そのエラーを投げる(無限に繰り返さない)', async () => {
    const run = vi.fn().mockRejectedValue(new FileAccessRequiredError(404));
    const requestAccess = vi.fn().mockResolvedValue(true);
    await expect(withFileAccess(run, requestAccess)).rejects.toBeInstanceOf(FileAccessRequiredError);
    expect(run).toHaveBeenCalledTimes(2);
    expect(requestAccess).toHaveBeenCalledTimes(1);
  });

  it('アクセス権以外のエラーは許可を求めずそのまま投げる', async () => {
    const boom = new Error('boom');
    const run = vi.fn().mockRejectedValue(boom);
    const requestAccess = vi.fn();
    await expect(withFileAccess(run, requestAccess)).rejects.toBe(boom);
    expect(requestAccess).not.toHaveBeenCalled();
  });
});
