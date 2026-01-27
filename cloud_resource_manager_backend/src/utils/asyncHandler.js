/**
 * PUBLIC_INTERFACE
 * Wrap an async Express handler and forward errors to next().
 * @param {(req: any, res: any, next: any) => Promise<any>} handler async handler
 * @returns {(req: any, res: any, next: any) => void}
 */
function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = {
  asyncHandler,
};
