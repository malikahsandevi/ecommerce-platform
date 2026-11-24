const { roleHasPermission } = require('../utils/permissions');
const { sendError } = require('../utils/apiError');

// Real enforcement for the role permission matrix. Sits behind `protect`
// (which sets req.user). A role without the permission gets a 403 with a
// message the panel can show as-is. Super Admin always passes (hard rule
// inside roleHasPermission).
const requirePermission = (module, action) => async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Not authorized, no token' });
        }
        const allowed = await roleHasPermission(req.user.role, module, action);
        if (!allowed) {
            return res.status(403).json({
                message: `Your role (${req.user.role}) doesn't have permission to ${action} ${module}. Ask a Super Admin to change it in Settings → Users & Roles.`,
            });
        }
        next();
    } catch (error) {
        sendError(res, error, 500);
    }
};

// Passes when ANY of the given [module, action] pairs is allowed — used
// where one endpoint serves two modules (e.g. the users list also backs
// the Customers page).
const requireAnyPermission = (pairs) => async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Not authorized, no token' });
        }
        for (const [module, action] of pairs) {
            // eslint-disable-next-line no-await-in-loop
            if (await roleHasPermission(req.user.role, module, action)) return next();
        }
        return res.status(403).json({
            message: `Your role (${req.user.role}) doesn't have permission for this. Ask a Super Admin to change it in Settings → Users & Roles.`,
        });
    } catch (error) {
        sendError(res, error, 500);
    }
};

module.exports = { requirePermission, requireAnyPermission };
