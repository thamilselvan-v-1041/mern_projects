/**
 * Vercel serverless catch-all: forwards all /api/* requests to the Express app.
 */
import { app } from '../server/index.js';

export default app;
