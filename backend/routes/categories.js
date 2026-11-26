const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { Category, Product } = require('../models');
const genericController = require('../controllers/genericController')(Category);
const { makeDeleteImpactHandler, makeCascadeDeleteHandler } = require('../controllers/deleteImpactController');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');
const { requirePermission } = require('../middleware/permissions');

// DEFAULT-DENY (Claude Section 9 follow-up): the group guard makes
// authentication this router's default — a route added here tomorrow
// is born signed-in-staff-only; per-route checks stay as layer two.
router.use(protect, requireStaff);
const { NOT_DELETED } = require('../utils/softDelete');
const { sendError } = require('../utils/apiError');

// Hierarchy guard for category create/update: a parent must be a
// real live category, a category can never be its own parent, and it
// can never be moved under one of its own descendants (the walk up
// from the proposed parent must not reach the category itself). The
// admin's Sub Categories tab additionally flags its saves with
// `parentRequired` — a subcategory save without a parent is refused
// here, since the form's required mark alone cannot stop an empty
// select from being submitted. Messages are short main points only
// (the toast rule); the flag itself is consumed, never stored.
const validateCategoryParent = async (req, res, next) => {
    try {
        const body = req.body || {};
        const parentRequired = body.parentRequired === true;
        delete body.parentRequired;
        const hasParentField = Object.prototype.hasOwnProperty.call(body, 'parent');
        const rawParent = hasParentField ? body.parent : undefined;
        const parentId =
            rawParent === '' || rawParent === null || rawParent === undefined
                ? null
                : String(rawParent);

        if (parentRequired && !parentId) {
            return res
                .status(400)
                .json({ message: 'A subcategory needs a parent category.' });
        }
        if (!hasParentField || !parentId) return next();

        if (!mongoose.Types.ObjectId.isValid(parentId)) {
            return res.status(400).json({ message: 'Parent category not found.' });
        }
        const parent = await Category.findOne({ _id: parentId, ...NOT_DELETED })
            .select('_id parent')
            .lean();
        if (!parent) {
            return res.status(400).json({ message: 'Parent category not found.' });
        }

        const selfId = req.params.id;
        if (selfId) {
            if (parentId === String(selfId)) {
                return res
                    .status(400)
                    .json({ message: 'A category cannot be its own parent.' });
            }
            // Cycle guard: walk up the proposed parent's chain — if it
            // reaches this category, the move would loop the tree. A
            // pre-existing loop elsewhere stops the walk, never hangs.
            const seen = new Set();
            let cursor = parent;
            while (cursor && cursor.parent) {
                const cursorParentId = String(cursor.parent);
                if (cursorParentId === String(selfId)) {
                    return res.status(400).json({
                        message: 'A category cannot be placed under its own subcategory.',
                    });
                }
                if (seen.has(cursorParentId)) break;
                seen.add(cursorParentId);
                // eslint-disable-next-line no-await-in-loop
                cursor = await Category.findOne({ _id: cursorParentId, ...NOT_DELETED })
                    .select('_id parent')
                    .lean();
            }
        }
        return next();
    } catch (error) {
        return sendError(res, error, 500);
    }
};


// List categories with the real number of products in each one, so the
// panel can show usage instead of a stored (stale) counter. Each row
// also carries its DIRECT subcategory count, counted over the whole
// live set right here — the panel's Main tab shows it in place of a
// products column (Ahsan's model: Main → Sub → Product), and a
// server-side count stays correct whatever page of rows the panel
// happens to display.
router.get('/', protect, requirePermission('Categories', 'view'), async (req, res) => {
    try {
        const [categories, counts] = await Promise.all([
            // Populate the parent's name + image so the panel can show
            // which category a subcategory belongs to (the Sub
            // Categories table renders the parent's thumbnail beside
            // its name); the populated object still carries the
            // parent's _id for the edit form.
            Category.find({ ...NOT_DELETED }).populate('parent', 'name image').lean(),
            Product.aggregate([{ $match: { ...NOT_DELETED } }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
        ]);
        await Category.withCodes(categories);
        const byId = new Map(counts.map((entry) => [String(entry._id), entry.count]));
        const subCounts = new Map();
        categories.forEach((category) => {
            if (!category.parent) return;
            const parentId = String(category.parent._id || category.parent);
            subCounts.set(parentId, (subCounts.get(parentId) || 0) + 1);
        });
        res.json(categories.map((category) => ({
            ...category,
            productsCount: byId.get(String(category._id)) || 0,
            subcategoriesCount: subCounts.get(String(category._id)) || 0,
        })));
    } catch (error) {
        sendError(res, error, 500);
    }
});

// Delete-impact: the links the delete confirmation warns about.
router.get('/:id/delete-impact', protect, requirePermission('Categories', 'delete'), makeDeleteImpactHandler(Category, 'categories'));

// Delete All (Part 5): the record plus its containment cascade.
router.post('/:id/cascade-delete', protect, requirePermission('Categories', 'delete'), makeCascadeDeleteHandler(Category, 'categories'));

router.route('/').post(protect, requirePermission('Categories', 'create'), validateCategoryParent, genericController.create);
router.route('/:id')
    .get(protect, requirePermission('Categories', 'view'), genericController.getById)
    .put(protect, requirePermission('Categories', 'edit'), validateCategoryParent, genericController.update)
    .delete(protect, requirePermission('Categories', 'delete'), genericController.remove);

module.exports = router;
