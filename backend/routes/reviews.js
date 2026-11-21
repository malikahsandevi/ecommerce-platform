const express = require('express');
const router = express.Router();
const {
    getReviews,
    getReviewById,
    createReview,
    updateReview,
    deleteReview,
} = require('../controllers/reviewController');
const { protect } = require('../middleware/auth');

// Reviews use a dedicated controller (not the generic one) because writes
// must keep the product's averageRating / reviewCount in sync and record
// dashboard activity.
router.route('/')
    .get(getReviews)
    .post(protect, createReview);

router.route('/:id')
    .get(getReviewById)
    .put(protect, updateReview)
    .delete(protect, deleteReview);

module.exports = router;
