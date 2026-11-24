// utils/coupon.js
//
// The ONE coupon-application path, shared by every order route: the
// admin's manual Create Order and any future storefront coupon support
// both resolve a redeem code through here (orderController.createOrder
// calls it), so the rules can never drift between callers. The admin's
// POST /api/coupons/validate preview runs the identical resolver.
//
// Rules (from the Coupon model): the code must exist, be active, be
// inside its validity window, have usage left, and the order subtotal
// must meet the coupon's minimum purchase.
//
// Usage-limit semantics (Ahsan's ruling, 2026-11-24): NO limit is
// stored as null and shown as "--"; a limit of 0 means the coupon is
// DEAD — it can never be redeemed; N means at most N redemptions.
// `perCustomerLimit` follows the same semantics per customer: null =
// no per-customer limit, 0 = no customer may redeem, N = each customer
// may redeem at most N times. A customer's count is their prior orders
// carrying this coupon whose redemption currently counts — live (not
// trashed) and not cancelled/refunded, the same state rule the global
// usedCount follows (see orderController's coupon marker), so the two
// counts can never diverge: a cancelled, refunded or trashed order's
// redemption does not consume the allowance.
//
// Scoping: when applicableUsers is non-empty only those customers may
// redeem. When applicableProducts and/or applicableCategories are
// non-empty, only order lines whose product is listed — or whose
// product's category is listed — are eligible, and the discount is
// computed on the ELIGIBLE lines' subtotal only; an order with no
// eligible line is refused. Empty arrays mean no restriction.
// Discount math: percentage takes that share of the discount base
// (capped by maxDiscountAmount when set); fixed takes the flat value.
// A discount never exceeds its base and never goes negative.
const Coupon = require('../models/Coupon');
const Order = require('../models/Order');
const { NOT_DELETED } = require('./softDelete');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a coupon's validity has ended at `now`. A DATE-ONLY
 * validUntil — stored at exactly UTC midnight, which is what the
 * admin form's date input saves — covers that whole day: the coupon
 * expires at the END of its end date, not at its start (a coupon set
 * to end today must still work today). A validUntil carrying a time
 * compares exactly. The admin's derived status displays
 * (couponConfig / resourceRegistry) and the export's mirror apply
 * this same rule, so the panel, the export and redemption can never
 * disagree about whether a coupon is expired.
 */
const couponExpired = (validUntil, now = new Date()) => {
    if (!validUntil) return false;
    const end = new Date(validUntil).getTime();
    if (Number.isNaN(end)) return false;
    const dateOnly = end % DAY_MS === 0;
    return now.getTime() > (dateOnly ? end + DAY_MS - 1 : end);
};

/**
 * Resolves a redeem code against an order.
 * context: {
 *   subtotal — the order's full items subtotal (minimum-spend base),
 *   userId   — the ordering customer's id (per-customer limit and the
 *              applicable-users gate need it),
 *   lines    — [{ product, category, lineTotal }] priced order lines
 *              (product/category scoping needs them),
 * }
 * Returns { coupon, discount } on success; throws an Error with a
 * clear, customer-safe message on any rule failure — callers surface
 * that message as a 400 and create NO order.
 */
const resolveCoupon = async (rawCode, context = {}) => {
    const { subtotal = 0, userId = null, lines = null } = context || {};
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) throw new Error('Please enter a coupon code.');

    const coupon = await Coupon.findOne({ code, ...NOT_DELETED });
    if (!coupon) throw new Error(`Coupon code "${code}" was not found.`);
    if (!coupon.isActive) throw new Error('This coupon is not active.');

    const now = new Date();
    if (coupon.validFrom && now < new Date(coupon.validFrom)) {
        throw new Error('This coupon is not valid yet.');
    }
    if (couponExpired(coupon.validUntil, now)) {
        throw new Error('This coupon has expired.');
    }
    // Global usage limit: null = unlimited; 0 = dead (usedCount 0 is
    // already >= 0); N refuses once usedCount reaches N.
    if (coupon.usageLimit != null && (coupon.usedCount || 0) >= coupon.usageLimit) {
        throw new Error('This coupon has reached its usage limit.');
    }

    // Applicable-users gate: a restricted coupon redeems only for the
    // customers on its list.
    const userScope = (coupon.applicableUsers || []).map(String);
    if (userScope.length) {
        if (!userId) {
            throw new Error('This coupon is limited to specific customers — select the customer first.');
        }
        if (!userScope.includes(String(userId))) {
            throw new Error('This coupon is not available for this customer.');
        }
    }

    // Per-customer limit: same null/0/N semantics as the global limit,
    // counted from the customer's own orders that carry this coupon
    // and whose redemption currently counts (live, not
    // cancelled/refunded — the usedCount state rule).
    if (coupon.perCustomerLimit != null) {
        if (!userId) {
            throw new Error('This coupon is limited per customer — select the customer first.');
        }
        const priorUses = await Order.countDocuments({
            user: userId,
            coupon: coupon._id,
            ...NOT_DELETED,
            status: { $nin: ['cancelled', 'refunded'] },
        });
        if (priorUses >= coupon.perCustomerLimit) {
            throw new Error('This customer has already used this coupon the maximum number of times.');
        }
    }

    const amount = Number(subtotal) || 0;
    const minimum = Number(coupon.minPurchaseAmount) || 0;
    if (amount < minimum) {
        throw new Error(
            `This coupon needs a minimum order of ${minimum.toFixed(2)} — the current subtotal is ${amount.toFixed(2)}.`
        );
    }

    // Product/category scoping: the discount base narrows to the
    // eligible lines' subtotal; no eligible line refuses the coupon.
    let discountBase = amount;
    const productScope = (coupon.applicableProducts || []).map(String);
    const categoryScope = (coupon.applicableCategories || []).map(String);
    if (productScope.length || categoryScope.length) {
        let eligible = 0;
        for (const line of lines || []) {
            if (!line) continue;
            const inProducts = productScope.includes(String(line.product));
            const inCategories =
                line.category != null && categoryScope.includes(String(line.category));
            if (inProducts || inCategories) eligible += Number(line.lineTotal) || 0;
        }
        if (eligible <= 0) {
            throw new Error("This coupon doesn't apply to any of the items in this order.");
        }
        discountBase = eligible;
    }

    let discount;
    if (coupon.discountType === 'percentage') {
        discount = (discountBase * (Number(coupon.discountValue) || 0)) / 100;
        if (coupon.maxDiscountAmount != null && coupon.maxDiscountAmount > 0) {
            discount = Math.min(discount, Number(coupon.maxDiscountAmount));
        }
    } else {
        discount = Number(coupon.discountValue) || 0;
    }
    discount = round2(Math.min(Math.max(discount, 0), discountBase));

    return { coupon, discount };
};

/** Records one redemption after the order carrying it has been saved.
 *  `session` (optional) joins the write to the caller's transaction —
 *  see utils/transactions; omitted, the write stands on its own,
 *  exactly as before. */
const recordCouponUse = async (couponId, session) => {
    if (!couponId) return;
    await Coupon.updateOne(
        { _id: couponId },
        { $inc: { usedCount: 1 } },
        session ? { session } : undefined
    );
};

/**
 * Atomically claims one redemption against the coupon's global usage
 * limit — the limit check and the increment are ONE conditional
 * update, so two orders placed at the same moment can never both
 * pass a limit of 1 (the resolver's read-then-check alone races:
 * both reads see the old count). Returns true when the claim landed.
 * A null (or absent) usageLimit is unlimited and always claims; a
 * limit of 0 never claims. Callers release the claim with
 * releaseCouponUse when the order does not go through after all.
 */
const claimCouponUse = async (couponId, session) => {
    if (!couponId) return false;
    const result = await Coupon.updateOne(
        {
            _id: couponId,
            $expr: {
                $or: [
                    { $eq: ['$usageLimit', null] },
                    { $lt: [{ $ifNull: ['$usedCount', 0] }, '$usageLimit'] },
                ],
            },
        },
        { $inc: { usedCount: 1 } },
        session ? { session } : undefined
    );
    return result.modifiedCount === 1;
};

/**
 * Releases one redemption — the inverse of recordCouponUse, run when
 * the order carrying the coupon leaves the counted state (cancelled,
 * refunded or trashed). The match on a positive usedCount keeps the
 * counter from ever dropping below zero.
 */
const releaseCouponUse = async (couponId, session) => {
    if (!couponId) return;
    await Coupon.updateOne(
        { _id: couponId, usedCount: { $gt: 0 } },
        { $inc: { usedCount: -1 } },
        session ? { session } : undefined
    );
};

module.exports = { resolveCoupon, recordCouponUse, releaseCouponUse, claimCouponUse, couponExpired };
