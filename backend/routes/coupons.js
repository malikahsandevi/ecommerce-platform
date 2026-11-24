const express = require('express');
const router = express.Router();
const { Coupon } = require('../models');
const genericController = require('../controllers/genericController')(Coupon);
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { resolveCoupon } = require('../utils/coupon');


// Live check for the admin Create Order form's Coupon field: validates
// a redeem code against an order subtotal through the SAME resolver
// createOrder uses, so the discount the form previews is the discount
// the saved order will carry. Read-only — records no redemption.
router.post('/validate', protect, async (req, res) => {
    try {
        const { coupon, discount } = await resolveCoupon(
            req.body?.code,
            Number(req.body?.subtotal) || 0
        );
        res.json({
            valid: true,
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            discount,
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// The reads are staff-only: a coupon's redeem code IS the discount,
// so unlike the catalog reads (products/categories/brands, which the
// storefront browses publicly) the coupon list and detail must never
// answer an unauthenticated caller — every live code was listable by
// anyone. The storefront never reads these endpoints (guest checkout
// applies no coupons); redemption goes through createOrder's resolver.
router.route('/')
    .get(protect, requirePermission('Coupons', 'view'), genericController.getAll)
    .post(protect, requirePermission('Coupons', 'create'), genericController.create);

router.route('/:id')
    .get(protect, requirePermission('Coupons', 'view'), genericController.getById)
    .put(protect, requirePermission('Coupons', 'edit'), genericController.update)
    .delete(protect, requirePermission('Coupons', 'delete'), genericController.remove);

module.exports = router;
