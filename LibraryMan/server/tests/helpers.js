/** Test helpers — build mock-user headers for the auth middleware. */
const adminUser  = { user_id: 'u-admin',  email_id: 'admin@lib.test',  role_details: { role_name: 'admin'  } };
const memberUser = { user_id: 'u-member', email_id: 'member@lib.test', role_details: { role_name: 'member' } };
const otherUser  = { user_id: 'u-other',  email_id: 'other@lib.test',  role_details: { role_name: 'member' } };

const asHeader = (u) => ({ 'x-mock-user': JSON.stringify(u) });

module.exports = { adminUser, memberUser, otherUser, asHeader };
