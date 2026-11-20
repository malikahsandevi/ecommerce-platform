const { User, Product, Order, ActivityLog, Analytics, Category } = require('../models');

// @desc    Get dashboard data
// @route   GET /api/dashboard
// @access  Admin
const getDashboardData = async (req, res) => {
    try {
        // Run every query in parallel — sequentially awaiting eight round
        // trips made the serverless cold-start path needlessly slow.
        const [
            totalCustomers,
            totalProducts,
            totalOrders,
            revenueAggregate,
            recentOrders,
            activityLogs,
            topCategories,
            existingAnalytics,
        ] = await Promise.all([
            User.countDocuments(),
            Product.countDocuments(),
            Order.countDocuments(),
            Order.aggregate([{ $group: { _id: null, total: { $sum: '$total' } } }]),
            Order.find().sort({ createdAt: -1 }).limit(5).populate('user', 'firstName lastName email'),
            ActivityLog.find().sort({ createdAt: -1 }).limit(10),
            Category.find().limit(5),
            Analytics.findOne(),
        ]);

        const totalRevenue = revenueAggregate[0]?.total || 0;

        let analytics = existingAnalytics;
        if (!analytics) {
            analytics = await Analytics.create({});
        }

        res.json({
            stats: {
                totalRevenue,
                totalOrders,
                totalCustomers,
                totalProducts
            },
            recentOrders,
            activityLogs,
            analytics,
            topCategories
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getDashboardData
};

