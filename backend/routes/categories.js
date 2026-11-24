const express = require('express');
const router = express.Router();
const { Category, Product } = require('../models');
const genericController = require('../controllers/genericController')(Category);
const { makeDeleteImpactHandler } = require('../controllers/deleteImpactController');
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { NOT_DELETED } = require('../utils/softDelete');
const { sendError } = require('../utils/apiError');


// List categories with the real number of products in each one, so the
// panel can show usage instead of a stored (stale) counter.
router.get('/', async (req, res) => {
    try {
        const [categories, counts] = await Promise.all([
            // Populate the parent's name so the panel can show which
            // category a subcategory belongs to; the populated object
            // still carries the parent's _id for the edit form.
            Category.find({ ...NOT_DELETED }).populate('parent', 'name').lean(),
            Product.aggregate([{ $match: { ...NOT_DELETED } }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
        ]);
        await Category.withCodes(categories);
        const byId = new Map(counts.map((entry) => [String(entry._id), entry.count]));
        res.json(categories.map((category) => ({
            ...category,
            productsCount: byId.get(String(category._id)) || 0,
        })));
    } catch (error) {
        sendError(res, error, 500);
    }
});

// Delete-impact: the links the delete confirmation warns about.
router.get('/:id/delete-impact', protect, requirePermission('Categories', 'delete'), makeDeleteImpactHandler(Category, 'categories'));

router.route('/').post(protect, requirePermission('Categories', 'create'), genericController.create);
router.route('/:id')
    .get(genericController.getById)
    .put(protect, requirePermission('Categories', 'edit'), genericController.update)
    .delete(protect, requirePermission('Categories', 'delete'), genericController.remove);

module.exports = router;
