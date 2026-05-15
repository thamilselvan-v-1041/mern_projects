/**
 * Synthetic borrowers used by the seed route to create a few open BookLoans.
 * These IDs do NOT correspond to real Catalyst users — they exist only to give
 * the BookList UI realistic "lent" state for demos.
 *
 * If a borrower with one of these emails later signs in as a real Catalyst
 * user, they will *not* be able to return these books (borrower_id mismatch);
 * admins can return them on the borrower's behalf, or seeded loans can be
 * cleared by deleting the rows in the Catalyst console.
 */
module.exports = [
  { user_id: 'demo-alice', email_id: 'alice@library.demo' },
  { user_id: 'demo-bob',   email_id: 'bob@library.demo'   },
  { user_id: 'demo-carol', email_id: 'carol@library.demo' },
  { user_id: 'demo-dave',  email_id: 'dave@library.demo'  },
  { user_id: 'demo-eve',   email_id: 'eve@library.demo'   }
];
