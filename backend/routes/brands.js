const express = require('express');
const router = express.Router();
const { Brand, Product } = require('../models');
const genericController = require('../controllers/genericController')(Brand);
const { protect } = require('../middleware/auth');

// List brands with the real number of products for each one.
router.get('/', async (req, res) => {
    try {
        const [brands, counts] = await Promise.all([
            Brand.find().lean(),
            Product.aggregate([{ $group: { _id: '$brand', count: { $sum: 1 } } }]),
        ]);
        const byId = new Map(counts.map((entry) => [String(entry._id), entry.count]));
        res.json(brands.map((brand) => ({
            ...brand,
            productsCount: byId.get(String(brand._id)) || 0,
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
