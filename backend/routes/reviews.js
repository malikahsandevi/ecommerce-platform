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
const { requireStaff } = require('../middleware/admin');
const { requirePermission } = require('../middleware/permissions');

// DEFAULT-DENY (Claude Section 9 follow-up): the group guard makes
// authentication this router's default — a route added here tomorrow
// is born signed-in-staff-only; per-route checks stay as layer two.
router.use(protect, requireStaff);


// Reviews use a dedicated controller (not the generic one) because writes
// must keep the product's averageRating / reviewCount in sync and record
// dashboard activity.
router.route('/')
    .get(protect, requirePermission('Reviews', 'view'), getReviews)
    .post(protect, requirePermission('Reviews', 'create'), createReview);

router.route('/:id')
    .get(protect, requirePermission('Reviews', 'view'), getReviewById)
    .put(protect, requirePermission('Reviews', 'edit'), updateReview)
    .delete(protect, requirePermission('Reviews', 'delete'), deleteReview);

module.exports = router;
