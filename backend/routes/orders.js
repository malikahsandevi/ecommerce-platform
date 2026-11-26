const express = require('express');
const router = express.Router();
const {
    getOrders,
    getOrderById,
    createOrder,
    updateOrder,
    deleteOrder,
    getShippingOptions,
    shippingQuote,
    syncOrderTracking,
    syncAllOrderTracking
} = require('../controllers/orderController');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');
const { requirePermission } = require('../middleware/permissions');


// DEFAULT-DENY (Claude Section 9 follow-up): the group guard carries
// the staff check too — orders are panel data, and a customer session
// token must be refused here, not only by the permission matrix.
router.use(protect, requireStaff);

router.route('/')
    .get(requirePermission('Orders', 'view'), getOrders)
    .post(requirePermission('Orders', 'create'), createOrder);

// Shipping centre reads + courier tracking sync. Declared before
// '/:id' so the literal segments are never read as an order id.
router.get('/shipping-options', requirePermission('Orders', 'view'), getShippingOptions);
router.post('/shipping-quote', requirePermission('Orders', 'create'), shippingQuote);
router.post('/sync-tracking', requirePermission('Orders', 'edit'), syncAllOrderTracking);
router.post('/:id/sync-tracking', requirePermission('Orders', 'edit'), syncOrderTracking);

router.route('/:id')
    .get(requirePermission('Orders', 'view'), getOrderById)
    .put(requirePermission('Orders', 'edit'), updateOrder)
    .delete(requirePermission('Orders', 'delete'), deleteOrder);

module.exports = router;
