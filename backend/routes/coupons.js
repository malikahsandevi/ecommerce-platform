const express = require('express');
const router = express.Router();
const { Coupon, Product } = require('../models');
const genericController = require('../controllers/genericController')(Coupon);
const { makeDeleteImpactHandler } = require('../controllers/deleteImpactController');
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { resolveCoupon } = require('../utils/coupon');
const { NOT_DELETED } = require('../utils/softDelete');
const { sendError } = require('../utils/apiError');


// Live check for the admin Create Order form's Coupon field: validates
// a redeem code through the SAME resolver createOrder uses — same
// customer, same priced lines — so the discount the form previews is
// the discount the saved order will carry, including per-customer
// limits and product/category scoping. Read-only — records no
// redemption. The lines are priced here from the product documents
// (never from caller-supplied prices), exactly as createOrder prices
// them.
router.post('/validate', protect, async (req, res) => {
    try {
        const body = req.body || {};
        let subtotal = Number(body.subtotal) || 0;
        let lines = null;
        if (Array.isArray(body.items) && body.items.length) {
            lines = [];
            subtotal = 0;
            for (const item of body.items) {
                const product = await Product.findOne(
                    { _id: item?.product, ...NOT_DELETED }
                )
                    .select('price category')
                    .lean();
                if (!product) {
                    return res.status(400).json({
                        message: 'One of the selected products no longer exists.',
                    });
                }
                const quantity = Math.max(1, Number(item.quantity) || 1);
                const lineTotal = (Number(product.price) || 0) * quantity;
                subtotal += lineTotal;
                lines.push({
                    product: product._id,
                    category: product.category || null,
                    lineTotal,
                });
            }
            subtotal = Math.round(subtotal * 100) / 100;
        }
        const { coupon, discount } = await resolveCoupon(body.code, {
            subtotal,
            userId: body.user || null,
            lines,
        });
        res.json({
            valid: true,
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            discount,
        });
    } catch (error) {
        sendError(res, error, 400);
    }
});

// The reads are staff-only: a coupon's redeem code IS the discount,
// so unlike the catalog reads (products/categories/brands, which the
// storefront browses publicly) the coupon list and detail must never
// answer an unauthenticated caller — every live code was listable by
// anyone. The storefront never reads these endpoints (guest checkout
// applies no coupons); redemption goes through createOrder's resolver.
// The scoping arrays ride back POPULATED with names so the panel's
// detail view can list them by name; writes still carry plain ids.
const populateScope = (query) =>
    query
        .populate('applicableProducts', 'name')
        .populate('applicableCategories', 'name')
        .populate('applicableUsers', 'firstName lastName email');

const getAllCoupons = async (req, res) => {
    try {
        const items = await populateScope(Coupon.find({ ...NOT_DELETED }));
        if (typeof Coupon.withCodes === 'function') await Coupon.withCodes(items);
        res.json(items);
    } catch (error) {
        sendError(res, error, 500);
    }
};

const getCouponById = async (req, res) => {
    try {
        const item = await populateScope(
            Coupon.findOne({ _id: req.params.id, ...NOT_DELETED })
        );
        if (!item) return res.status(404).json({ message: 'Not found' });
        if (typeof Coupon.withCodes === 'function') await Coupon.withCodes(item);
        res.json(item);
    } catch (error) {
        sendError(res, error, 500);
    }
};

// Delete-impact: the links the delete confirmation warns about.
router.get('/:id/delete-impact', protect, requirePermission('Coupons', 'delete'), makeDeleteImpactHandler(Coupon, 'coupons'));

router.route('/')
    .get(protect, requirePermission('Coupons', 'view'), getAllCoupons)
    .post(protect, requirePermission('Coupons', 'create'), genericController.create);

router.route('/:id')
    .get(protect, requirePermission('Coupons', 'view'), getCouponById)
    .put(protect, requirePermission('Coupons', 'edit'), genericController.update)
    .delete(protect, requirePermission('Coupons', 'delete'), genericController.remove);

module.exports = router;
