const express = require('express');
const router = express.Router();
const { Category, Product } = require('../models');
const genericController = require('../controllers/genericController')(Category);
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');


// List categories with the real number of products in each one, so the
// panel can show usage instead of a stored (stale) counter.
router.get('/', async (req, res) => {
    try {
        const [categories, counts] = await Promise.all([
            Category.find().lean(),
            Product.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
        ]);
        await Category.withCodes(categories);
        const byId = new Map(counts.map((entry) => [String(entry._id), entry.count]));
        res.json(categories.map((category) => ({
            ...category,
            productsCount: byId.get(String(category._id)) || 0,
        })));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.route('/').post(protect, requirePermission('Categories', 'create'), genericController.create);
router.route('/:id')
    .get(genericController.getById)
    .put(protect, requirePermission('Categories', 'edit'), genericController.update)
    .delete(protect, requirePermission('Categories', 'delete'), genericController.remove);

module.exports = router;
