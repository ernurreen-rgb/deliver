export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "validation_failed"
  | "internal_error";

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  reason?: string;
  fieldErrors?: Record<string, string>;
};

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiFailure = {
  ok: false;
  error: ApiError;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};
