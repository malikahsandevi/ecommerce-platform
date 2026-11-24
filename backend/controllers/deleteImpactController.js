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
const { computeDeleteImpact } = require('../utils/deleteImpact');

const makeDeleteImpactHandler = (Model, moduleKey) => async (req, res) => {
    try {
        const doc = await Model.findOne({ _id: req.params.id, ...NOT_DELETED });
        if (!doc) return res.status(404).json({ message: 'Not found' });
        if (moduleKey === 'customers' && doc.role !== 'Customer') {
            return res.json({ links: [] });
        }
        const links = await computeDeleteImpact(moduleKey, doc);
        res.json({ links });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { makeDeleteImpactHandler };
