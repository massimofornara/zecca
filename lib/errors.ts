export class ZeccaError extends Error {
  readonly code: string;

  constructor(message: string, code = "ZECCA") {
    super(message);
    this.name = "ZeccaError";
    this.code = code;
  }
}

export function isZeccaError(error: unknown): error is ZeccaError {
  return error instanceof ZeccaError;
}
