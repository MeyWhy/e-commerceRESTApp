const { validationResult } = require('express-validator');

// Runs after express-validator check(...) chains; short-circuits with 400
// and a list of field-level errors if any check failed.
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
};

module.exports = { handleValidation };
