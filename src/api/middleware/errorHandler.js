function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;

  res.status(status).json({
    error: {
      message: status === 500 ? 'Internal server error' : err.message
    }
  });
}

module.exports = { errorHandler };

