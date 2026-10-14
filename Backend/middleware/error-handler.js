const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  if (err.name === 'MulterError') {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `File too large (max ${Number(process.env.MAX_UPLOAD_MB) || 100} MB)`
        : err.message;
    return res.status(400).json({ message });
  }

  if (err.message && err.message.startsWith('Only .zip')) {
    return res.status(400).json({ message: err.message });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: err.message });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid ID format' });
  }

  if (err.code === 11000) {
    return res.status(409).json({ message: 'Duplicate field value' });
  }

  res.status(500).json({ message: 'Internal server error' });
};

module.exports = errorHandler;