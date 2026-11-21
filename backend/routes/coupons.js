const express = require('express');
const router = express.Router();
const { Coupon } = require('../models');
const genericController = require('../controllers/genericController')(Coupon);
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');


router.route('/')
    .get(genericController.getAll)
    .post(protect, requirePermission('Coupons', 'create'), genericController.create);

router.route('/:id')
    .get(genericController.getById)
    .put(protect, requirePermission('Coupons', 'edit'), genericController.update)
    .delete(protect, requirePermission('Coupons', 'delete'), genericController.remove);

module.exports = router;
