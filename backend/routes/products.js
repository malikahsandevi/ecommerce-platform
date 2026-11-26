const express = require('express');
const router = express.Router();
const { getProducts, getProductById, createProduct, updateProduct, deleteProduct } = require('../controllers/productController');
const { makeDeleteImpactHandler, makeCascadeDeleteHandler } = require('../controllers/deleteImpactController');
const { Product } = require('../models');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');
const { requirePermission } = require('../middleware/permissions');

// DEFAULT-DENY (Claude Section 9 follow-up): authentication is the
// router's default, not each route's memory. The 8.3 round found
// catalog reads public because per-route `protect` had simply never
// been added to them — a route added here tomorrow is born behind
// this group guard, and the per-route `protect` + permission checks
// below stay as the second layer.
router.use(protect, requireStaff);


// Delete-impact: the links the delete confirmation warns about.
router.get('/:id/delete-impact', protect, requirePermission('Products', 'delete'), makeDeleteImpactHandler(Product, 'products'));

// Delete All (Part 5): the record plus its containment cascade.
router.post('/:id/cascade-delete', protect, requirePermission('Products', 'delete'), makeCascadeDeleteHandler(Product, 'products'));

router.route('/')
    .get(protect, requirePermission('Products', 'view'), getProducts)
    .post(protect, requirePermission('Products', 'create'), createProduct);

router.route('/:id')
    .get(protect, requirePermission('Products', 'view'), getProductById)
    .put(protect, requirePermission('Products', 'edit'), updateProduct)
    .delete(protect, requirePermission('Products', 'delete'), deleteProduct);

module.exports = router;
