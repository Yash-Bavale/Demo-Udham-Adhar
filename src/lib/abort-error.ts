export type ErrorLike = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  cause?: unknown;
};

/**
 * Detects expected client disconnects (aborted requests) that should not be
 * logged as server errors or reported as runtime crashes.
 */
export function isAbortError(error: unknown, depth = 0): boolean {
  if (depth > 3 || error == null) return false;

  const err = error as ErrorLike;
  const name = String(err.name || '');
  const message = String(err.message || '').toLowerCase();
  const code = String(err.code || '');

  if (
    name === 'AbortError' ||
    code === 'ECONNRESET' ||
    code === 'ERR_STREAM_PREMATURE_CLOSE' ||
    message.includes('aborted') ||
    message.includes('the operation was aborted')
  ) {
    return true;
  }

  if (err.cause && err.cause !== error) {
    return isAbortError(err.cause, depth + 1);
  }

  return false;
}
