const express = require('express');
const router = express.Router();
const {
    getOrders,
    getOrderById,
    createOrder,
    updateOrder,
    deleteOrder
} = require('../controllers/orderController');
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');


router.use(protect);

router.route('/')
    .get(requirePermission('Orders', 'view'), getOrders)
    .post(requirePermission('Orders', 'create'), createOrder);

router.route('/:id')
    .get(requirePermission('Orders', 'view'), getOrderById)
    .put(requirePermission('Orders', 'edit'), updateOrder)
    .delete(requirePermission('Orders', 'delete'), deleteOrder);

module.exports = router;
