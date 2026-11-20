const express = require('express');
const router = express.Router();
const { Coupon } = require('../models');
const genericController = require('../controllers/genericController')(Coupon);
const { protect } = require('../middleware/auth');

router.route('/')
    .get(genericController.getAll)
    .post(protect, genericController.create);

router.route('/:id')
    .get(genericController.getById)
    .put(protect, genericController.update)
    .delete(protect, genericController.remove);

module.exports = router;
