export class ZeccaError extends Error {
  readonly code: string;
  readonly cashoutId?: string;

  constructor(message: string, code = "ZECCA", cashoutId?: string) {
    super(message);
    this.name = "ZeccaError";
    this.code = code;
    this.cashoutId = cashoutId;
  }
}

export function isZeccaError(error: unknown): error is ZeccaError {
  if (error instanceof ZeccaError) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    typeof (error as { message: unknown }).message === "string" &&
    "name" in error &&
    (error as { name: unknown }).name === "ZeccaError"
  );
}

export function publicErrorMessage(error: unknown, fallback: string) {
  if (isZeccaError(error)) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
