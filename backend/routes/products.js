const express = require('express');
const router = express.Router();
const { getProducts, getProductById, createProduct, updateProduct, deleteProduct } = require('../controllers/productController');
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');


router.route('/')
    .get(getProducts)
    .post(protect, requirePermission('Products', 'create'), createProduct);

router.route('/:id')
    .get(getProductById)
    .put(protect, requirePermission('Products', 'edit'), updateProduct)
    .delete(protect, requirePermission('Products', 'delete'), deleteProduct);

module.exports = router;
