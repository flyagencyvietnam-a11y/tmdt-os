/** Lỗi nghiệp vụ có mã — server action bắt và trả message cho UI. */
export class ServiceError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function isServiceError(e: unknown): e is ServiceError {
  return e instanceof ServiceError;
}
