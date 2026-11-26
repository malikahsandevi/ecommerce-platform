const Review = require('../models/Review');
const Product = require('../models/Product');
const User = require('../models/User');
const { logActivity } = require('../utils/activity');
const { NOT_DELETED, applySoftDelete } = require('../utils/softDelete');
const { sendError } = require('../utils/apiError');

// Keeps Product.averageRating / reviewCount honest. Until now nothing ever
// maintained those fields, so every product showed 0 stars / 0 reviews in
// the panel forever, no matter how many reviews existed. Only APPROVED
// reviews count — pending/rejected ones are not public ratings.
const syncProductRating = async (productId) => {
    if (!productId) return;
    const [row] = await Review.aggregate([
        { $match: { product: productId, status: 'approved', ...NOT_DELETED } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    await Product.findByIdAndUpdate(productId, {
        averageRating: row ? Math.round(row.avg * 10) / 10 : 0,
        reviewCount: row ? row.count : 0,
    });
};

// The soft-delete stamps are server-owned (see genericController):
// a create/update body must never carry them — a review born trashed
// would vanish from every list while still blocking nothing and
// counting nowhere, and an update carrying them could trash or
// un-trash a review while skipping the rating sync entirely.
const stripServerOwnedFields = (body) => {
    const clean = { ...(body || {}) };
    delete clean.deletedAt;
    delete clean.deletedBy;
    delete clean.deletedUniques;
    delete clean.deletedLinks;
    return clean;
};

const populateReview = (query) => query
    // The product's image rides along: the Reviews list's Product cell
    // renders the product's photo, and a name-only populate left every
    // row on the initial-letter tile (the avatar-round bug class).
    .populate('product', 'name image images')
    .populate('user', 'firstName lastName username email avatar');

// @desc    List reviews (with product + author populated for the panel)
// @route   GET /api/reviews
// @access  Admin (staff + Reviews permission — closed in the Claude 8.3 round)
const getReviews = async (req, res) => {
    try {
        const reviews = await populateReview(Review.find({ ...NOT_DELETED }));
        await Review.withCodes(reviews);
        res.json(reviews);
    } catch (error) {
        sendError(res, error, 500);
    }
};

// @desc    Get one review
// @route   GET /api/reviews/:id
// @access  Admin (staff + Reviews permission — closed in the Claude 8.3 round)
const getReviewById = async (req, res) => {
    try {
        const review = await populateReview(Review.findOne({ _id: req.params.id, ...NOT_DELETED }));
        if (!review) return res.status(404).json({ message: 'Review not found' });
        await Review.withCodes(review);
        res.json(review);
    } catch (error) {
        sendError(res, error, 500);
    }
};

// @desc    Create a review
// @route   POST /api/reviews
// @access  Admin
const createReview = async (req, res) => {
    try {
        const [product, user] = await Promise.all([
            req.body.product ? Product.findOne({ _id: req.body.product, ...NOT_DELETED }).select('name') : null,
            req.body.user ? User.findOne({ _id: req.body.user, ...NOT_DELETED }).select('firstName lastName') : null,
        ]);
        if (!product) return res.status(400).json({ message: 'The selected product no longer exists.' });
        if (!user) return res.status(400).json({ message: 'The selected reviewer no longer exists.' });

        const saved = await new Review(stripServerOwnedFields(req.body)).save();

        await syncProductRating(saved.product);
        await logActivity(
            'REVIEW',
            `New ${saved.rating}-star review on ${product.name}`,
            { productId: saved.product, customerId: saved.user }
        );

        res.status(201).json(await populateReview(Review.findById(saved._id)));
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                message: 'This customer has already reviewed this product — edit the existing review instead.',
            });
        }
        sendError(res, error, 400);
    }
};

// @desc    Update a review (rating / status / content / reply)
// @route   PUT /api/reviews/:id
// @access  Admin
const updateReview = async (req, res) => {
    try {
        const existing = await Review.findOne({ _id: req.params.id, ...NOT_DELETED });
        if (!existing) return res.status(404).json({ message: 'Review not found' });

        const previousProductId = existing.product;
        // Product and author are read-only on edit (the panel renders
        // them read-only; the API now holds the same line): a body
        // carrying them must not move a review to another product or
        // re-attribute it to another customer — that would corrupt
        // both products' ratings. They are stripped, never applied.
        const updateBody = stripServerOwnedFields(req.body);
        delete updateBody.product;
        delete updateBody.user;
        delete updateBody.customer;
        const updated = await Review.findOneAndUpdate(
            { _id: req.params.id, ...NOT_DELETED },
            updateBody,
            { new: true, runValidators: true },
        );

        await syncProductRating(updated.product);
        if (String(previousProductId) !== String(updated.product)) {
            await syncProductRating(previousProductId);
        }

        res.json(await populateReview(Review.findById(updated._id)));
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                message: 'This customer has already reviewed this product — edit the existing review instead.',
            });
        }
        sendError(res, error, 400);
    }
};

// @desc    Delete a review (soft — Settings → Deleted Items)
// @route   DELETE /api/reviews/:id
// @access  Admin
const deleteReview = async (req, res) => {
    try {
        const review = await Review.findOne({ _id: req.params.id, ...NOT_DELETED });
        if (!review) return res.status(404).json({ message: 'Review not found' });

        applySoftDelete(Review, review, req.user?._id);
        await review.save();

        await syncProductRating(review.product);

        res.json({ message: 'Deleted successfully' });
    } catch (error) {
        sendError(res, error, 500);
    }
};

module.exports = {
    getReviews,
    getReviewById,
    createReview,
    updateReview,
    deleteReview,
    syncProductRating,
};
