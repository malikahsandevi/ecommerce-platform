const express = require('express');
const router = express.Router();
const { Category, Product } = require('../models');
const genericController = require('../controllers/genericController')(Category);
const { protect } = require('../middleware/auth');

// List categories with the real number of products in each one, so the
// panel can show usage instead of a stored (stale) counter.
router.get('/', async (req, res) => {
    try {
        const [categories, counts] = await Promise.all([
            Category.find().lean(),
            Product.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
        ]);
        const byId = new Map(counts.map((entry) => [String(entry._id), entry.count]));
        res.json(categories.map((category) => ({
            ...category,
            productsCount: byId.get(String(category._id)) || 0,
        })));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.route('/').post(protect, genericController.create);
router.route('/:id')
    .get(genericController.getById)
    .put(protect, genericController.update)
    .delete(protect, genericController.remove);

module.exports = router;
