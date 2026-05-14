/**
 * Integration tests — covers route wiring, auth, role-based authz, validation
 * and store interactions against the in-memory implementation.
 */
const request = require('supertest');
const app = require('../index');
const memoryStore = require('../store/memoryStore');
const { adminUser, memberUser, otherUser, asHeader } = require('./helpers');

beforeEach(() => memoryStore.__reset());

describe('GET /books (public)', () => {
  it('returns the seeded list without auth', async () => {
    const res = await request(app).get('/books');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});

describe('POST /books (admin only)', () => {
  it('rejects anonymous callers with 401', async () => {
    const res = await request(app).post('/books').send({ title: 'X', author: 'Y' });
    expect(res.status).toBe(401);
  });

  it('rejects members with 403', async () => {
    const res = await request(app)
      .post('/books').set(asHeader(memberUser))
      .send({ title: 'X', author: 'Y' });
    expect(res.status).toBe(403);
  });

  it('allows admins and persists the new book', async () => {
    const res = await request(app)
      .post('/books').set(asHeader(adminUser))
      .send({ title: 'Refactoring', author: 'Martin Fowler', isbn: '978-0134757599' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: 'Refactoring', author: 'Martin Fowler', status: 'available'
    });

    const list = await request(app).get('/books');
    expect(list.body.data.find(b => b.title === 'Refactoring')).toBeTruthy();
  });

  it('returns 400 for invalid payloads', async () => {
    const res = await request(app)
      .post('/books').set(asHeader(adminUser))
      .send({ title: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });
});

describe('POST /books/:id/lend', () => {
  let bookId;
  beforeEach(async () => {
    const r = await request(app).get('/books');
    bookId = r.body.data[0].id;
  });

  it('requires authentication', async () => {
    const res = await request(app).post(`/books/${bookId}/lend`);
    expect(res.status).toBe(401);
  });

  it('lets a member lend an available book', async () => {
    const res = await request(app)
      .post(`/books/${bookId}/lend`).set(asHeader(memberUser));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('lent');
  });

  it('returns 409 when book is already lent', async () => {
    await request(app).post(`/books/${bookId}/lend`).set(asHeader(memberUser));
    const res = await request(app)
      .post(`/books/${bookId}/lend`).set(asHeader(otherUser));
    expect(res.status).toBe(409);
  });

  it('returns 404 for unknown book id', async () => {
    const res = await request(app)
      .post('/books/does-not-exist/lend').set(asHeader(memberUser));
    expect(res.status).toBe(404);
  });
});

describe('POST /books/:id/return', () => {
  let bookId;
  beforeEach(async () => {
    const r = await request(app).get('/books');
    bookId = r.body.data[0].id;
    await request(app).post(`/books/${bookId}/lend`).set(asHeader(memberUser));
  });

  it('lets the borrower return their own loan', async () => {
    const res = await request(app)
      .post(`/books/${bookId}/return`).set(asHeader(memberUser));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('available');
  });

  it('forbids a different member from returning someone else\'s loan', async () => {
    const res = await request(app)
      .post(`/books/${bookId}/return`).set(asHeader(otherUser));
    expect(res.status).toBe(403);
  });

  it('lets an admin return any loan', async () => {
    const res = await request(app)
      .post(`/books/${bookId}/return`).set(asHeader(adminUser));
    expect(res.status).toBe(200);
  });

  it('returns 409 when the book is not currently lent', async () => {
    await request(app).post(`/books/${bookId}/return`).set(asHeader(memberUser));
    const res = await request(app)
      .post(`/books/${bookId}/return`).set(asHeader(memberUser));
    expect(res.status).toBe(409);
  });
});

describe('DELETE /books/:id (admin only)', () => {
  let bookId;
  beforeEach(async () => {
    const r = await request(app).get('/books');
    bookId = r.body.data[0].id;
  });

  it('rejects members with 403', async () => {
    const res = await request(app)
      .delete(`/books/${bookId}`).set(asHeader(memberUser));
    expect(res.status).toBe(403);
  });

  it('lets admins delete and cascades open loans', async () => {
    await request(app).post(`/books/${bookId}/lend`).set(asHeader(memberUser));
    const res = await request(app)
      .delete(`/books/${bookId}`).set(asHeader(adminUser));
    expect(res.status).toBe(200);

    const list = await request(app).get('/books');
    expect(list.body.data.find(b => b.id === bookId)).toBeUndefined();
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .delete('/books/missing').set(asHeader(adminUser));
    expect(res.status).toBe(404);
  });
});

describe('GET /books/me/loans', () => {
  it('returns only the caller\'s loans', async () => {
    const list = await request(app).get('/books');
    const [b1, b2] = list.body.data;
    await request(app).post(`/books/${b1.id}/lend`).set(asHeader(memberUser));
    await request(app).post(`/books/${b2.id}/lend`).set(asHeader(otherUser));

    const res = await request(app).get('/books/me/loans').set(asHeader(memberUser));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].book_id).toBe(b1.id);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/books/me/loans');
    expect(res.status).toBe(401);
  });
});

describe('Misc', () => {
  it('health endpoint advertises the API', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('LibraryMan API');
  });

  it('unknown routes return 404', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
  });
});
