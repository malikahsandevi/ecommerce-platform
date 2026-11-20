const express = require('express');
const router = express.Router();
const { Review } = require('../models');
const genericController = require('../controllers/genericController')(Review);
const { protect } = require('../middleware/auth');

router.route('/').get(async (req, res) => {
	try {
		const reviews = await Review.find()
			.populate('product', 'name')
			.populate('user', 'firstName lastName username email');
		res.json(reviews);
	} catch (error) {
		res.status(500).json({ message: error.message });
	}
}).post(protect, genericController.create);
router.route('/:id').get(genericController.getById).put(protect, genericController.update).delete(protect, genericController.remove);

module.exports = router;
