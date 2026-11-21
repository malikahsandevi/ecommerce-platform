const RolePermission = require('../models/RolePermission');

// The permission system's vocabulary. Modules mirror the admin panel's
// sections; every module supports the same four actions except Dashboard,
// which is view-only (there is nothing to create/edit/delete there).
const MODULES = [
    'Dashboard',
    'Products',
    'Orders',
    'Customers',
    'Categories',
    'Brands',
    'Coupons',
    'Media',
    'Reviews',
    'Settings',
    'Users',
];

const ACTIONS = ['view', 'create', 'edit', 'delete'];

const MODULE_ACTIONS = Object.fromEntries(
    MODULES.map((module) => [
        module,
        module === 'Dashboard' ? ['view'] : [...ACTIONS],
    ]),
);

const ROLES = ['Super Admin', 'Admin', 'Manager', 'Editor', 'Support', 'Customer'];

const fullAccess = () =>
    Object.fromEntries(
        MODULES.map((module) => [
            module,
            Object.fromEntries(MODULE_ACTIONS[module].map((action) => [action, true])),
        ]),
    );

const noAccess = () =>
    Object.fromEntries(
        MODULES.map((module) => [
            module,
            Object.fromEntries(MODULE_ACTIONS[module].map((action) => [action, false])),
        ]),
    );

const grant = (base, module, actions) => {
    for (const action of actions) {
        if (MODULE_ACTIONS[module]?.includes(action)) base[module][action] = true;
    }
    return base;
};

// Shipped defaults — the starting matrix, editable afterwards from
// Settings → Users & Roles by a Super Admin.
const buildDefaults = () => {
    const matrix = {};

    matrix['Super Admin'] = fullAccess();

    // Admin: everything, except deleting user accounts. (Editing the
    // matrix itself is Super-Admin-only at the route level, not a cell.)
    matrix.Admin = fullAccess();
    matrix.Admin.Users.delete = false;

    // Manager: runs the catalogue and the day-to-day — full CRUD on the
    // commerce modules, can look at Settings, no user management.
    const manager = noAccess();
    grant(manager, 'Dashboard', ['view']);
    for (const module of ['Products', 'Orders', 'Customers', 'Categories', 'Brands', 'Coupons', 'Media', 'Reviews']) {
        grant(manager, module, ACTIONS);
    }
    grant(manager, 'Settings', ['view']);
    matrix.Manager = manager;

    // Editor: content/catalogue only. Orders and Customers are read-only,
    // Reviews can be moderated (view + edit), no Settings, no Users.
    const editor = noAccess();
    grant(editor, 'Dashboard', ['view']);
    for (const module of ['Products', 'Categories', 'Brands', 'Coupons', 'Media']) {
        grant(editor, module, ACTIONS);
    }
    grant(editor, 'Reviews', ['view', 'edit']);
    grant(editor, 'Orders', ['view']);
    grant(editor, 'Customers', ['view']);
    matrix.Editor = editor;

    // Support: order handling and customer care — sees the dashboard,
    // updates orders, reads customers, moderates reviews.
    const support = noAccess();
    grant(support, 'Dashboard', ['view']);
    grant(support, 'Orders', ['view', 'edit']);
    grant(support, 'Customers', ['view']);
    grant(support, 'Reviews', ['view', 'edit']);
    matrix.Support = support;

    // Customers never reach the panel (login already refuses them).
    matrix.Customer = noAccess();

    return matrix;
};

const DEFAULT_MATRIX = buildDefaults();

/** Keeps only known roles/modules/actions, coercing values to booleans. */
const sanitizeMatrix = (input) => {
    const clean = {};
    if (!input || typeof input !== 'object') return clean;
    for (const role of ROLES) {
        const roleInput = input[role];
        if (!roleInput || typeof roleInput !== 'object') continue;
        clean[role] = {};
        for (const module of MODULES) {
            const moduleInput = roleInput[module];
            if (!moduleInput || typeof moduleInput !== 'object') continue;
            clean[role][module] = {};
            for (const action of MODULE_ACTIONS[module]) {
                if (moduleInput[action] !== undefined) {
                    clean[role][module][action] = Boolean(moduleInput[action]);
                }
            }
        }
    }
    return clean;
};

/** Defaults with the stored matrix laid over them (stored wins per cell). */
const mergeMatrix = (stored) => {
    const merged = buildDefaults();
    const clean = sanitizeMatrix(stored);
    for (const role of ROLES) {
        if (!clean[role]) continue;
        for (const module of MODULES) {
            if (!clean[role][module]) continue;
            Object.assign(merged[role][module], clean[role][module]);
        }
    }
    return merged;
};

// The matrix is read on every permission check, so cache it briefly.
// Saving through PUT /api/permissions invalidates immediately on the
// instance that served the save; other serverless instances converge
// within the TTL.
let cache = { matrix: null, loadedAt: 0 };
const CACHE_TTL_MS = 30_000;

const invalidatePermissionCache = () => {
    cache = { matrix: null, loadedAt: 0 };
};

const getMatrix = async () => {
    if (cache.matrix && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
        return cache.matrix;
    }
    let stored = {};
    try {
        const doc = await RolePermission.findOne({ key: 'matrix' }).lean();
        stored = doc?.matrix || {};
    } catch {
        stored = {}; // a read failure must never lock staff out of defaults
    }
    const matrix = mergeMatrix(stored);
    cache = { matrix, loadedAt: Date.now() };
    return matrix;
};

/**
 * The permissions a role effectively holds. Super Admin is a hard rule:
 * full access, whatever the stored matrix says — the store's top admin
 * can never be locked out by an edited matrix.
 */
const getEffectivePermissions = async (role) => {
    if (role === 'Super Admin') return fullAccess();
    const matrix = await getMatrix();
    return matrix[role] || noAccess();
};

const roleHasPermission = async (role, module, action) => {
    if (role === 'Super Admin') return true;
    const permissions = await getEffectivePermissions(role);
    return Boolean(permissions?.[module]?.[action]);
};

module.exports = {
    MODULES,
    ACTIONS,
    MODULE_ACTIONS,
    ROLES,
    DEFAULT_MATRIX,
    sanitizeMatrix,
    mergeMatrix,
    getMatrix,
    getEffectivePermissions,
    roleHasPermission,
    invalidatePermissionCache,
};
