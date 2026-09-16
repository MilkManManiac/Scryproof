/**
 * A thrown error that carries an HTTP status and a stable machine code.
 *
 * `message` is written for the person reading it on screen. `code` is what the
 * client branches on, so wording can change without breaking behaviour.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toJSON(): { code: string; message: string; details?: Record<string, unknown> } {
    return this.details
      ? { code: this.code, message: this.message, details: this.details }
      : { code: this.code, message: this.message };
  }
}

export const badRequest = (message: string, code = 'bad_request'): HttpError =>
  new HttpError(400, code, message);

export const unauthorized = (message = 'You are not signed in.'): HttpError =>
  new HttpError(401, 'unauthorized', message);

export const forbidden = (message = 'You do not have permission to do that.'): HttpError =>
  new HttpError(403, 'forbidden', message);

export const notFound = (message = 'Not found.', code = 'not_found'): HttpError =>
  new HttpError(404, code, message);

export const conflict = (message: string, code = 'conflict'): HttpError =>
  new HttpError(409, code, message);

export const tooManyRequests = (message: string, retryAfterSeconds: number): HttpError =>
  new HttpError(429, 'rate_limited', message, { retryAfterSeconds });
