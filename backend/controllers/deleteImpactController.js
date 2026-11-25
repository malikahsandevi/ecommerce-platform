// ── GET /api/:module/:id/delete-impact ────────────────────────────
// The numbers behind the delete confirmation's warning lines (see
// utils/deleteImpact for the reference model): what the record is
// linked to, and what a delete will do about each link ('remove' =
// detached from those places, 'keep' = history that stays). Staff-
// only, gated by the SAME permission as the module's delete — the
// routes wire requirePermission('<Module>', 'delete') in front of
// this handler (the users router uses its role-aware delete guard,
// which draws the same Customers/Users split as the delete itself).
// Customers get an impact (their orders/reviews, all 'keep'); staff
// accounts get none — deleting them behaves exactly as before.
const { NOT_DELETED } = require('../utils/softDelete');
const {
    computeDeleteImpact,
    computeCascadePreview,
    collectCascade,
    softDeleteRecord,
    cascadeDeleteRecords,
} = require('../utils/deleteImpact');
const { roleHasPermission } = require('../utils/permissions');
const { sendError } = require('../utils/apiError');

const makeDeleteImpactHandler = (Model, moduleKey) => async (req, res) => {
    try {
        const doc = await Model.findOne({ _id: req.params.id, ...NOT_DELETED });
        if (!doc) return res.status(404).json({ message: 'Not found' });
        if (moduleKey === 'customers' && doc.role !== 'Customer') {
            return res.json({ links: [], cascade: [] });
        }
        const links = await computeDeleteImpact(moduleKey, doc);
        // Delete All preview (Part 5): the containment-linked records
        // a cascade would take with it, per module, each flagged with
        // the caller's delete permission for that module.
        const cascade = await computeCascadePreview(moduleKey, doc, req.user?.role);
        res.json({ links, cascade });
    } catch (error) {
        sendError(res, error, 500);
    }
};

// ── POST /api/:module/:id/cascade-delete ────────────────────────────
// Delete All (Part 5): soft-deletes the record AND its containment-
// linked records (utils/deleteImpact collectCascade), all landing in
// Deleted Items individually restorable. The set is recomputed here
// — never trusted from the client — and filtered by the caller's
// per-module delete permissions. Gated by the SAME permission as the
// module's own delete (wired in the routes). Orders are never part
// of any cascade set.
const makeCascadeDeleteHandler = (Model, moduleKey) => async (req, res) => {
    try {
        const doc = await Model.findOne({ _id: req.params.id, ...NOT_DELETED });
        if (!doc) return res.status(404).json({ message: 'Not found' });
        if (moduleKey === 'customers') {
            if (doc.role !== 'Customer') {
                return res.status(400).json({ message: 'Delete All is not available for this record.' });
            }
            // The plain user delete's ownership rule applies here
            // too — this endpoint never widens it.
            if (req.user?.role !== 'Super Admin'
                && String(req.user?._id) !== String(doc._id)) {
                return res.status(403).json({
                    message: 'Only a Super Admin can delete another account.',
                });
            }
        }
        const groups = await collectCascade(moduleKey, doc);
        const allowedGroups = [];
        for (const group of groups) {
            // eslint-disable-next-line no-await-in-loop
            if (await roleHasPermission(req.user?.role, group.permissionModule, 'delete')) {
                allowedGroups.push(group);
            }
        }
        // Parent first: its detach snapshots every link exactly like
        // a plain delete, so restoring the parent re-links
        // conservatively per the standing rules. The cascade records
        // follow by id.
        await softDeleteRecord(Model, moduleKey, doc, req.user?._id);
        const cascadeDeleted = await cascadeDeleteRecords(allowedGroups, req.user?._id);
        res.json({ message: 'Deleted successfully', cascadeDeleted });
    } catch (error) {
        sendError(res, error, 500);
    }
};

module.exports = { makeDeleteImpactHandler, makeCascadeDeleteHandler };
