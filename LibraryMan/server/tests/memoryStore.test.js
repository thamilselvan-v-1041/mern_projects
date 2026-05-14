const store = require('../store/memoryStore');

const admin  = { user_id: 'a', role_details: { role_name: 'admin' } };
const memberA = { user_id: 'm1', email_id: 'm1@x.io', role_details: { role_name: 'member' } };
const memberB = { user_id: 'm2', email_id: 'm2@x.io', role_details: { role_name: 'member' } };

beforeEach(() => store.__reset());

describe('memoryStore', () => {
  it('seeds two books', async () => {
    const list = await store.list();
    expect(list).toHaveLength(2);
  });

  it('add() returns a book with id + createdAt', async () => {
    const b = await store.add({ title: 'T', author: 'A' });
    expect(b.id).toBeTruthy();
    expect(b.status).toBe('available');
    expect(b.createdAt).toBeTruthy();
  });

  it('lend → returnBook full cycle (by owner)', async () => {
    const [book] = await store.list();
    const lent = await store.lend(book.id, memberA);
    expect(lent.book.status).toBe('lent');

    const ret = await store.returnBook(book.id, memberA);
    expect(ret.book.status).toBe('available');
  });

  it('blocks non-owner member from returning', async () => {
    const [book] = await store.list();
    await store.lend(book.id, memberA);
    const ret = await store.returnBook(book.id, memberB);
    expect(ret.error).toBe('NOT_OWNER');
  });

  it('admin can return any loan', async () => {
    const [book] = await store.list();
    await store.lend(book.id, memberA);
    const ret = await store.returnBook(book.id, admin);
    expect(ret.book.status).toBe('available');
  });

  it('myLoans filters by borrower_id', async () => {
    const [b1, b2] = await store.list();
    await store.lend(b1.id, memberA);
    await store.lend(b2.id, memberB);
    const loans = await store.myLoans('m1');
    expect(loans).toHaveLength(1);
    expect(loans[0].book_id).toBe(b1.id);
  });

  it('remove() cascades to open loans', async () => {
    const [book] = await store.list();
    await store.lend(book.id, memberA);
    await store.remove(book.id);
    const loans = await store.myLoans('m1');
    // open loan should have been removed
    expect(loans.find(l => l.book_id === book.id && !l.returned_at)).toBeUndefined();
  });

  it('returns NOT_FOUND for unknown ids', async () => {
    expect((await store.remove('nope')).error).toBe('NOT_FOUND');
    expect((await store.lend('nope', memberA)).error).toBe('NOT_FOUND');
    expect((await store.returnBook('nope', memberA)).error).toBe('NOT_FOUND');
  });
});
