/**
 * Error utilities for consistent API responses.
 */

class ApiError extends Error {
  /**
   * @param {number} statusCode HTTP status
   * @param {string} message error message
   * @param {string} [code] stable error code
   * @param {any} [details] optional structured details
   */
  constructor(statusCode, message, code = 'ERROR', details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * PUBLIC_INTERFACE
 * Express middleware: convert unknown errors to a structured API error response.
 * @param {any} err error
 * @param {import('express').Request} req request
 * @param {import('express').Response} res response
 * @param {import('express').NextFunction} next next
 * @returns {void}
 */
function errorHandler(err, req, res, next) {
  const statusCode = err && err.statusCode ? err.statusCode : 500;
  const code = err && err.code ? err.code : 'INTERNAL_SERVER_ERROR';
  const message =
    statusCode === 500 ? 'Internal Server Error' : (err && err.message) || 'Error';

  if (statusCode >= 500) {
    console.error(err);
  }

  res.status(statusCode).json({
    status: 'error',
    code,
    message,
    details: err && err.details ? err.details : undefined,
  });
}

/**
 * PUBLIC_INTERFACE
 * Express middleware: 404 handler.
 * @param {import('express').Request} req request
 * @param {import('express').Response} res response
 * @param {import('express').NextFunction} next next
 * @returns {void}
 */
function notFoundHandler(req, res, next) {
  next(new ApiError(404, 'Not Found', 'NOT_FOUND', { path: req.originalUrl }));
}

module.exports = {
  ApiError,
  errorHandler,
  notFoundHandler,
};
