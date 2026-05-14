const Joi = require('joi');

const addBookSchema = Joi.object({
  title:  Joi.string().trim().min(1).max(200).required(),
  author: Joi.string().trim().min(1).max(150).required(),
  isbn:   Joi.string().trim().max(20).optional().allow('', null)
});

const idParamSchema = Joi.object({
  id: Joi.string().trim().min(1).max(64).required()
});

/** Generic validator factory. Returns 400 with details on failure. */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], { stripUnknown: true });
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }
    req[source] = value;
    next();
  };
}

module.exports = { addBookSchema, idParamSchema, validate };
