const { addBookSchema, idParamSchema, validate } = require('../validators/bookValidators');

describe('addBookSchema', () => {
  it('accepts valid input', () => {
    const { error } = addBookSchema.validate({ title: 'A', author: 'B' });
    expect(error).toBeUndefined();
  });
  it('rejects missing title', () => {
    const { error } = addBookSchema.validate({ author: 'B' });
    expect(error).toBeDefined();
  });
  it('rejects too-long values', () => {
    const { error } = addBookSchema.validate({ title: 'x'.repeat(300), author: 'B' });
    expect(error).toBeDefined();
  });
  it('allows isbn null/empty', () => {
    const { error } = addBookSchema.validate({ title: 'A', author: 'B', isbn: '' });
    expect(error).toBeUndefined();
  });
});

describe('idParamSchema', () => {
  it('accepts a non-empty id', () => {
    const { error } = idParamSchema.validate({ id: 'abc' });
    expect(error).toBeUndefined();
  });
  it('rejects empty id', () => {
    const { error } = idParamSchema.validate({ id: '' });
    expect(error).toBeDefined();
  });
});

describe('validate() middleware factory', () => {
  function run(mw, req) {
    return new Promise((resolve) => {
      const res = {
        status(code) { this.statusCode = code; return this; },
        json(payload) { resolve({ status: this.statusCode || 200, payload, called: 'json' }); }
      };
      mw(req, res, () => resolve({ called: 'next', req }));
    });
  }

  it('strips unknown keys and calls next on success', async () => {
    const mw = validate(addBookSchema, 'body');
    const req = { body: { title: 'A', author: 'B', evil: 'x' } };
    const out = await run(mw, req);
    expect(out.called).toBe('next');
    expect(req.body.evil).toBeUndefined();
  });

  it('returns 400 with details on failure', async () => {
    const mw = validate(addBookSchema, 'body');
    const out = await run(mw, { body: {} });
    expect(out.status).toBe(400);
    expect(out.payload.error).toBe('Validation failed');
    expect(Array.isArray(out.payload.details)).toBe(true);
  });
});
