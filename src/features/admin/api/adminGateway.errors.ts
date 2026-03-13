// src/features/admin/api/adminGateway.errors.ts
// =============================================================================
// Admin Gateway Errors — normalized client-side error handling
// =============================================================================

export class AdminGatewayError extends Error {
  constructor(
    message: string,
    public status?: number,
    public requestId?: string,
  ) {
    super(message);
    this.name = 'AdminGatewayError';
  }
}

export class AdminGatewayUnauthorizedError extends AdminGatewayError {
  constructor(message = 'Unauthorized', status = 401, requestId?: string) {
    super(message, status, requestId);
    this.name = 'AdminGatewayUnauthorizedError';
  }
}

export class AdminGatewayBadRequestError extends AdminGatewayError {
  constructor(message = 'Bad request', status = 400, requestId?: string) {
    super(message, status, requestId);
    this.name = 'AdminGatewayBadRequestError';
  }
}
