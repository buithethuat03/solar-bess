interface ApiErrorPayload {
  code?: string;
  message?: string;
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
      typeof error.code === 'string' ? error.code : 'API_REQUEST_FAILED',
      typeof error.message === 'string' ? error.message : 'Không thể hoàn thành yêu cầu',
      error.retryable === true,
      typeof error.currentVersion === 'number' ? error.currentVersion : null,
      Array.isArray(error.issues) ? error.issues.flatMap(normalizeIssue) : []
    );
  }
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
