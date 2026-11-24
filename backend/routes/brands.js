const express = require('express');
const router = express.Router();
const { Brand, Product } = require('../models');
const genericController = require('../controllers/genericController')(Brand);
const { makeDeleteImpactHandler } = require('../controllers/deleteImpactController');
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { NOT_DELETED } = require('../utils/softDelete');


// List brands with the real number of products for each one.
router.get('/', async (req, res) => {
    try {
        const [brands, counts] = await Promise.all([
            Brand.find({ ...NOT_DELETED }).lean(),
            Product.aggregate([{ $match: { ...NOT_DELETED } }, { $group: { _id: '$brand', count: { $sum: 1 } } }]),
        ]);
        await Brand.withCodes(brands);
        const byId = new Map(counts.map((entry) => [String(entry._id), entry.count]));
        res.json(brands.map((brand) => ({
            ...brand,
            productsCount: byId.get(String(brand._id)) || 0,
        })));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete-impact: the links the delete confirmation warns about.
router.get('/:id/delete-impact', protect, requirePermission('Brands', 'delete'), makeDeleteImpactHandler(Brand, 'brands'));

router.route('/').post(protect, requirePermission('Brands', 'create'), genericController.create);
router.route('/:id')
    .get(genericController.getById)
    .put(protect, requirePermission('Brands', 'edit'), genericController.update)
    .delete(protect, requirePermission('Brands', 'delete'), genericController.remove);

module.exports = router;
