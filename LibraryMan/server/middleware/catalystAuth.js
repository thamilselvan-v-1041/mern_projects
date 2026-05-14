/**
 * Catalyst Authentication middleware.
 *
 * In Catalyst AdvancedIO, every authenticated request from a Catalyst-hosted
 * web client carries the user's session. `catalystApp.authentication().getCurrentUser()`
 * resolves it server-side using the request-scoped Catalyst app instance.
 *
 * Locally (USE_MEMORY_STORE=true), we honour an `x-mock-user` header so tests
 * and the dev server can simulate authenticated calls without a real Catalyst
 * project. This path is HARD-DISABLED in production via NODE_ENV check.
 */
const catalyst = require('zcatalyst-sdk-node');

const isLocalMock = () =>
  process.env.NODE_ENV !== 'production' && process.env.USE_MEMORY_STORE === 'true';

/** Attach a Catalyst app instance to the request. */
function attachCatalystApp(req, _res, next) {
  if (isLocalMock()) return next();
  try {
    req.catalystApp = catalyst.initialize(req);
  } catch (err) {
    console.error('[auth] catalyst.initialize failed:', err.message);
  }
  next();
}

/** Require a signed-in Catalyst user. Populates req.user. */
async function requireAuth(req, res, next) {
  // ─── Local mock path (dev/tests only) ───────────────────────────────────
  if (isLocalMock()) {
    const mock = req.headers['x-mock-user'];
    if (!mock) {
      return res.status(401).json({ success: false, error: 'Unauthenticated' });
    }
    try {
      req.user = JSON.parse(mock); // e.g. {"user_id":"u1","email_id":"a@b.c","role_details":{"role_name":"admin"}}
      return next();
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid x-mock-user header' });
    }
  }

  // ─── Catalyst path ──────────────────────────────────────────────────────
  try {
    if (!req.catalystApp) {
      return res.status(500).json({ success: false, error: 'Catalyst app not initialised' });
    }
    const userMgmt = req.catalystApp.userManagement();
    const user = await userMgmt.getCurrentUser();
    if (!user || !user.user_id) {
      return res.status(401).json({ success: false, error: 'Unauthenticated' });
    }
    req.user = user;
    return next();
  } catch (err) {
    console.error('[auth] getCurrentUser failed:', err.message);
    return res.status(401).json({ success: false, error: 'Unauthenticated' });
  }
}

/**
 * Require one of the given role names. Catalyst stores role under
 * `user.role_details.role_name`. Defaults to `member` if missing.
 */
function requireRole(...allowed) {
  return (req, res, next) => {
    const role = req.user?.role_details?.role_name || 'member';
    if (!allowed.includes(role)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden — requires role: ${allowed.join(' or ')}`
      });
    }
    next();
  };
}

module.exports = { attachCatalystApp, requireAuth, requireRole };
