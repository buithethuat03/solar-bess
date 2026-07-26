import { ApiError } from './api-error';

describe('ApiError — server error mapping', () => {
  it('keeps the domain error model message and code', () => {
    const error = ApiError.from(401, {
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Thông tin đăng nhập không hợp lệ',
      retryable: false
    });
    expect(error.status).toBe(401);
    expect(error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(error.message).toBe('Thông tin đăng nhập không hợp lệ');
  });

  it('renders Nest ValidationPipe array messages instead of a generic failure', () => {
    // This is the exact body /v1/auth/login returns for an empty form.
    const error = ApiError.from(400, {
      message: ['email must be an email', 'password must be longer than or equal to 8 characters'],
      error: 'Bad Request',
      statusCode: 400
    });
    expect(error.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(error.message).toBe(
      'email must be an email; password must be longer than or equal to 8 characters'
    );
  });

  it('falls back to the Nest error name when no message survives', () => {
    expect(ApiError.from(404, { error: 'Not Found', statusCode: 404 }).message).toBe('Not Found');
    expect(ApiError.from(400, { message: [] }).message).toBe('Không thể hoàn thành yêu cầu');
    expect(ApiError.from(500, undefined).message).toBe('Không thể hoàn thành yêu cầu');
  });

  it('normalises validation issues and drops malformed ones', () => {
    const error = ApiError.from(422, {
      code: 'SCHEDULE_INVALID',
      message: 'Lịch không hợp lệ',
      currentVersion: 3,
      issues: [
        { code: 'DURATION', path: 'activities[0]', row: 1, severity: 'ERROR', message: 'Sai duration' },
        { code: 'BROKEN' },
        null
      ]
    });
    expect(error.currentVersion).toBe(3);
    expect(error.issues).toEqual([
      { code: 'DURATION', path: 'activities[0]', row: 1, severity: 'ERROR', message: 'Sai duration' }
    ]);
  });
});
