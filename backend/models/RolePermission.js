const mongoose = require('mongoose');

// The role → permission matrix lives in ONE document (key "matrix") so the
// Settings → Users & Roles editor reads/writes the whole thing atomically.
// Shape: { [role]: { [module]: { view, create, edit, delete, export? } } }
// (`export` exists only on the eight exportable modules).
// Only the roles/modules/actions in utils/permissions.js are honoured —
// anything else stored here is ignored when effective permissions are
// computed. Super Admin is NOT governed by this document at all: the code
// hard-rules full access for that role so the store can never lock its
// top admin out by editing the matrix.
const rolePermissionSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, default: 'matrix' },
        matrix: { type: mongoose.Schema.Types.Mixed, default: {} },
        // Roles created from Settings → Users & Roles on top of the
        // built-in vocabulary in utils/permissions.js. Built-in role
        // names are never stored here; this list only grows through the
        // Super-Admin-only POST /api/permissions/roles endpoint.
        customRoles: { type: [String], default: [] },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

module.exports = mongoose.model('RolePermission', rolePermissionSchema);
