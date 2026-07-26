interface ApiErrorPayload {
  code?: string;
  /**
   * The domain error model always sends a string. Nest's own ValidationPipe sends an array of
   * constraint messages instead, so both shapes have to be understood or a rejected form shows
   * nothing but a generic failure.
   */
  message?: string | string[];
  error?: string;
  retryable?: boolean;
  currentVersion?: number;
  issues?: unknown[];
}

export interface ApiValidationIssue {
  code: string;
  path: string;
  row: number | null;
  severity: 'ERROR' | 'WARNING';
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly currentVersion: number | null = null,
    readonly issues: ApiValidationIssue[] = []
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static from(status: number, payload: unknown): ApiError {
    const error = payload && typeof payload === 'object' ? payload as ApiErrorPayload : {};
    return new ApiError(
      status,
      typeof error.code === 'string' ? error.code : validationCode(error, status),
      readMessage(error),
      error.retryable === true,
      typeof error.currentVersion === 'number' ? error.currentVersion : null,
      Array.isArray(error.issues) ? error.issues.flatMap(normalizeIssue) : []
    );
  }
}

/**
 * Prefer whatever the server actually said. A bare "Không thể hoàn thành yêu cầu" tells the user
 * nothing about which field they got wrong, which is exactly when they need the detail most.
 */
function readMessage(error: ApiErrorPayload): string {
  if (typeof error.message === 'string' && error.message.trim()) return error.message;
  if (Array.isArray(error.message)) {
    const parts = error.message.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (parts.length > 0) return parts.join('; ');
  }
  if (typeof error.error === 'string' && error.error.trim()) return error.error;
  return 'Không thể hoàn thành yêu cầu';
}

function validationCode(error: ApiErrorPayload, status: number): string {
  if (Array.isArray(error.message) && status === 400) return 'REQUEST_VALIDATION_FAILED';
  return 'API_REQUEST_FAILED';
}

function normalizeIssue(value: unknown): ApiValidationIssue[] {
  if (!value || typeof value !== 'object') return [];
  const issue = value as Record<string, unknown>;
  if (
    typeof issue.code !== 'string'
    || typeof issue.path !== 'string'
    || typeof issue.message !== 'string'
    || (issue.severity !== 'ERROR' && issue.severity !== 'WARNING')
  ) return [];
  return [{
    code: issue.code,
    path: issue.path,
    row: typeof issue.row === 'number' ? issue.row : null,
    severity: issue.severity,
    message: issue.message
  }];
}
