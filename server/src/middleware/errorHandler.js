import { AppError, ERROR_MESSAGES } from '../utils/errors.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = 500;
  let userMessage = ERROR_MESSAGES.METADATA_FAILURE;
  let errorCode = 'METADATA_FAILURE';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    userMessage = err.message;
    errorCode = err.errorCode;
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    userMessage = ERROR_MESSAGES.FILE_TOO_LARGE;
    errorCode = 'FILE_TOO_LARGE';
  }

  // Server-side logging with technical detail without exposing to client
  console.error(`[Error] [${errorCode}] ${statusCode} - ${err.message}${err.technicalDetails ? ` (${err.technicalDetails})` : ''}`);

  res.status(statusCode).json({
    success: false,
    error: userMessage,
    errorCode
  });
}
