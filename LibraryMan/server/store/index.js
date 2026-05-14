/**
 * Store dispatcher.
 *
 *  - When USE_MEMORY_STORE=true → in-memory (tests + local dev without a
 *    Catalyst project).
 *  - Otherwise → Catalyst Data Store (production / Catalyst-linked dev).
 *
 * Both implementations expose the same async contract so routes never
 * branch on environment.
 */
const memoryStore = require('./memoryStore');
const datastoreStore = require('./datastoreStore');

const useMemory = process.env.USE_MEMORY_STORE === 'true';
module.exports = useMemory ? memoryStore : datastoreStore;
