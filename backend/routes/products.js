const express = require('express');
const router = express.Router();
const { getProducts, getProductById, createProduct, updateProduct, deleteProduct } = require('../controllers/productController');
const { makeDeleteImpactHandler, makeCascadeDeleteHandler } = require('../controllers/deleteImpactController');
const { Product } = require('../models');
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');


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
