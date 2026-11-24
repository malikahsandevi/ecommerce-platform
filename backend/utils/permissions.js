const RolePermission = require('../models/RolePermission');

// The permission system's vocabulary. Modules mirror the admin panel's
// sections; every module supports the same four actions except Dashboard,
// which is view-only (there is nothing to create/edit/delete there).
// A fifth action, `export`, exists ONLY on the modules the Data Export
// feature covers (the eight list modules) — Dashboard, Settings and
// Users have no export, so the matrix shows a dash there, exactly like
// Dashboard's create/edit/delete dashes.
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

const EXPORTABLE_MODULES = [
    'Products',
    'Orders',
    'Customers',
    'Categories',
    'Brands',
    'Coupons',
    'Media',
    'Reviews',
];

// The only roles that may hold an effective Export right at all
// (Ahsan's rule: "super admin or admin hi data export kr sakty hain").
// The export route ALSO hard-checks this list before the matrix is
// consulted, so a tick stored for any other role is meaningless.
const EXPORT_ROLES = ['Super Admin', 'Admin'];

const MODULE_ACTIONS = Object.fromEntries(
    MODULES.map((module) => [
        module,
        module === 'Dashboard'
            ? ['view']
            : EXPORTABLE_MODULES.includes(module)
              ? [...ACTIONS, 'export']
              : [...ACTIONS],
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

/** Keeps only known roles/modules/actions, coercing values to booleans.
 *  `extraRoles` are the stored custom roles — they are honoured exactly
 *  like the built-in vocabulary; anything else is dropped. */
const sanitizeMatrix = (input, extraRoles = []) => {
    const clean = {};
    if (!input || typeof input !== 'object') return clean;
    for (const role of [...ROLES, ...extraRoles]) {
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

/** Defaults with the stored matrix laid over them (stored wins per cell).
 *  Custom roles start from no access at all — a brand-new role can do
 *  nothing until a Super Admin ticks cells for it and saves.
 *
 *  Export migration note: matrices stored before the Export column
 *  existed simply have no `export` cells, so the defaults show through
 *  per cell — Super Admin and Admin (fullAccess) read export ON for the
 *  eight exportable modules, every other role reads OFF — with no data
 *  migration needed. And whatever a stored matrix says, Export is
 *  forced OFF here for every role outside EXPORT_ROLES: the right is
 *  never effective for them, even if a tick was somehow stored. */
const mergeMatrix = (stored, customRoles = []) => {
    const merged = buildDefaults();
    for (const role of customRoles) {
        if (!merged[role]) merged[role] = noAccess();
    }
    const clean = sanitizeMatrix(stored, customRoles);
    for (const role of [...ROLES, ...customRoles]) {
        if (!clean[role]) continue;
        for (const module of MODULES) {
            if (!clean[role][module]) continue;
            Object.assign(merged[role][module], clean[role][module]);
        }
    }
    for (const role of [...ROLES, ...customRoles]) {
        if (EXPORT_ROLES.includes(role)) continue;
        for (const module of EXPORTABLE_MODULES) {
            if (merged[role]?.[module]) merged[role][module].export = false;
        }
    }
    return merged;
};

// The matrix is read on every permission check, so cache it briefly.
// Saving through PUT /api/permissions invalidates immediately on the
// instance that served the save; other serverless instances converge
// within the TTL. The custom-role list rides the same cache — it lives
// in the same document and changes just as rarely.
let cache = { matrix: null, customRoles: null, loadedAt: 0 };
const CACHE_TTL_MS = 30_000;

const invalidatePermissionCache = () => {
    cache = { matrix: null, customRoles: null, loadedAt: 0 };
};

const loadPermissionState = async () => {
    if (cache.matrix && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
        return cache;
    }
    let stored = {};
    let customRoles = [];
    try {
        const doc = await RolePermission.findOne({ key: 'matrix' }).lean();
        stored = doc?.matrix || {};
        customRoles = Array.isArray(doc?.customRoles)
            ? doc.customRoles.filter(
                  (name) => typeof name === 'string' && name && !ROLES.includes(name),
              )
            : [];
    } catch {
        stored = {}; // a read failure must never lock staff out of defaults
        customRoles = [];
    }
    const matrix = mergeMatrix(stored, customRoles);
    cache = { matrix, customRoles, loadedAt: Date.now() };
    return cache;
};

const getMatrix = async () => (await loadPermissionState()).matrix;

/** Role names created from the panel, on top of the built-in ROLES. */
const getCustomRoles = async () => (await loadPermissionState()).customRoles;

/** Every role name the system will accept: built-ins + custom roles. */
const getAllRoleNames = async () => [...ROLES, ...(await getCustomRoles())];

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
    EXPORTABLE_MODULES,
    EXPORT_ROLES,
    MODULE_ACTIONS,
    ROLES,
    DEFAULT_MATRIX,
    sanitizeMatrix,
    mergeMatrix,
    getMatrix,
    getCustomRoles,
    getAllRoleNames,
    getEffectivePermissions,
    roleHasPermission,
    invalidatePermissionCache,
};
