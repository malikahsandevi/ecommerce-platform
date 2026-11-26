const express = require('express');
const router = express.Router();
const { Brand, Product } = require('../models');
const genericController = require('../controllers/genericController')(Brand);
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


// List brands with the real number of products for each one.
// Staff-only like every admin read: the public catalog lives under
// /api/storefront — these module reads were public once and leaked
// the panel's data (closed in the Claude 8.3 verification round).
router.get('/', protect, requirePermission('Brands', 'view'), async (req, res) => {
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
        sendError(res, error, 500);
    }
});

// Delete-impact: the links the delete confirmation warns about.
router.get('/:id/delete-impact', protect, requirePermission('Brands', 'delete'), makeDeleteImpactHandler(Brand, 'brands'));

// Delete All (Part 5): the record plus its containment cascade.
router.post('/:id/cascade-delete', protect, requirePermission('Brands', 'delete'), makeCascadeDeleteHandler(Brand, 'brands'));

router.route('/').post(protect, requirePermission('Brands', 'create'), genericController.create);
router.route('/:id')
    .get(protect, requirePermission('Brands', 'view'), genericController.getById)
    .put(protect, requirePermission('Brands', 'edit'), genericController.update)
    .delete(protect, requirePermission('Brands', 'delete'), genericController.remove);

module.exports = router;
