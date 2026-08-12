export class BusinessRuleError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "BusinessRuleError";
  }
}

export function publicErrorResponse(error: unknown, fallback: string, fallbackStatus = 500) {
  if (error instanceof BusinessRuleError) {
    return { message: error.message, status: error.status };
  }
  return { message: fallback, status: fallbackStatus };
}
