const { requireAuth, requireRole, attachCatalystApp } = require('../middleware/catalystAuth');

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(p)  { this.body = p; return this; }
  };
}

describe('requireAuth (mock mode)', () => {
  it('401 when x-mock-user header missing', async () => {
    const res = mockRes();
    await requireAuth({ headers: {} }, res, () => { throw new Error('next called'); });
    expect(res.statusCode).toBe(401);
  });

  it('400 when x-mock-user is malformed JSON', async () => {
    const res = mockRes();
    await requireAuth({ headers: { 'x-mock-user': '{not-json' } }, res, () => { throw new Error('next called'); });
    expect(res.statusCode).toBe(400);
  });

  it('attaches req.user and calls next on success', async () => {
    const user = { user_id: 'u1', role_details: { role_name: 'admin' } };
    const req = { headers: { 'x-mock-user': JSON.stringify(user) } };
    let nextCalled = false;
    await requireAuth(req, mockRes(), () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(req.user.user_id).toBe('u1');
  });
});

describe('requireRole', () => {
  it('blocks users without required role', () => {
    const res = mockRes();
    requireRole('admin')(
      { user: { role_details: { role_name: 'member' } } },
      res,
      () => { throw new Error('next called'); }
    );
    expect(res.statusCode).toBe(403);
  });

  it('allows users when role is one of allowed', () => {
    let nextCalled = false;
    requireRole('member', 'admin')(
      { user: { role_details: { role_name: 'member' } } },
      mockRes(),
      () => { nextCalled = true; }
    );
    expect(nextCalled).toBe(true);
  });

  it('defaults missing role to "member"', () => {
    let nextCalled = false;
    requireRole('member')({ user: {} }, mockRes(), () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
});

describe('attachCatalystApp (mock mode)', () => {
  it('is a no-op when USE_MEMORY_STORE is true', () => {
    const req = {};
    let nextCalled = false;
    attachCatalystApp(req, mockRes(), () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(req.catalystApp).toBeUndefined();
  });
});
