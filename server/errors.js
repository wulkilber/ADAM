export class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export function fault(code, message, status) {
  throw new AppError(code, message, status);
}
export function statusFor(error) {
  return (
    error.status ||
    {
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      VERSION_CONFLICT: 409,
      IDEMPOTENCY_CONFLICT: 409,
      OPERATION_PENDING: 503,
      BUSY_RETRY: 503,
      SERVICE_UNAVAILABLE: 503,
    }[error.code] ||
    400
  );
}
