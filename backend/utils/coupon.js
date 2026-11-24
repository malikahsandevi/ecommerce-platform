// utils/coupon.js
//
// The ONE coupon-application path, shared by every order route: the
// admin's manual Create Order and any future storefront coupon support
// both resolve a redeem code through here (orderController.createOrder
// calls it), so the rules can never drift between callers.
//
// Rules (from the Coupon model): the code must exist, be active, be
// inside its validity window, have usage left, and the order subtotal
// must meet the coupon's minimum purchase. Discount math: percentage
// takes that share of the subtotal (capped by maxDiscountAmount when
// set); fixed takes the flat value. A discount never exceeds the
// subtotal and never goes negative.
const Coupon = require('../models/Coupon');
const { NOT_DELETED } = require('./softDelete');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Resolves a redeem code against an order subtotal.
 * Returns { coupon, discount } on success; throws an Error with a
 * clear, customer-safe message on any rule failure — callers surface
 * that message as a 400 and create NO order.
 */
const resolveCoupon = async (rawCode, subtotal) => {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) throw new Error('Please enter a coupon code.');

    const coupon = await Coupon.findOne({ code, ...NOT_DELETED });
    if (!coupon) throw new Error(`Coupon code "${code}" was not found.`);
    if (!coupon.isActive) throw new Error('This coupon is not active.');

    const now = new Date();
    if (coupon.validFrom && now < new Date(coupon.validFrom)) {
        throw new Error('This coupon is not valid yet.');
    }
    if (coupon.validUntil && now > new Date(coupon.validUntil)) {
        throw new Error('This coupon has expired.');
    }
    // A stored usageLimit of 0 means UNLIMITED — that is the panel's
    // own contract (the coupon form's helper reads "Leave at 0 for
    // unlimited use", and the form maps 0 to null on save; rows that
    // still carry a literal 0 — older data, direct API writes — must
    // behave the same way, not read as "limit already reached").
    if (coupon.usageLimit != null && coupon.usageLimit > 0 && (coupon.usedCount || 0) >= coupon.usageLimit) {
        throw new Error('This coupon has reached its usage limit.');
    }

    const amount = Number(subtotal) || 0;
    const minimum = Number(coupon.minPurchaseAmount) || 0;
    if (amount < minimum) {
        throw new Error(
            `This coupon needs a minimum order of ${minimum.toFixed(2)} — the current subtotal is ${amount.toFixed(2)}.`
        );
    }

    let discount;
    if (coupon.discountType === 'percentage') {
        discount = (amount * (Number(coupon.discountValue) || 0)) / 100;
        if (coupon.maxDiscountAmount != null && coupon.maxDiscountAmount > 0) {
            discount = Math.min(discount, Number(coupon.maxDiscountAmount));
        }
    } else {
        discount = Number(coupon.discountValue) || 0;
    }
    discount = round2(Math.min(Math.max(discount, 0), amount));

    return { coupon, discount };
};

/** Records one redemption after the order carrying it has been saved. */
const recordCouponUse = async (couponId) => {
    if (!couponId) return;
    await Coupon.updateOne({ _id: couponId }, { $inc: { usedCount: 1 } });
};

module.exports = { resolveCoupon, recordCouponUse };
