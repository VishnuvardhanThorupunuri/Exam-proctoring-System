// backend/middleware/authorizeRoles.js
/**
 * Role‑based authorization middleware.
 * @param {...string} allowedRoles - Roles permitted to access the route.
 * @returns {function} Express middleware.
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    // req.user should be set by previous authentication middleware
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions' });
    }
    next();
  };
};

module.exports = authorizeRoles;
