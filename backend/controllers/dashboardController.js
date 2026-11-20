const { User, Product, Order, ActivityLog, Analytics, Category } = require('../models');

// @desc    Get dashboard data
// @route   GET /api/dashboard
// @access  Admin
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const getDashboardData = async (req, res) => {
    try {
        // First day of the month five months ago — the revenue series
        // covers the last 6 calendar months including the current one.
        const now = new Date();
        const sixMonthsStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

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
            revenueMonthly,
        ] = await Promise.all([
            User.countDocuments(),
            Product.countDocuments(),
            Order.countDocuments(),
            Order.aggregate([{ $group: { _id: null, total: { $sum: '$total' } } }]),
            Order.find().sort({ createdAt: -1 }).limit(5).populate('user', 'firstName lastName email'),
            ActivityLog.find().sort({ createdAt: -1 }).limit(10),
            Category.find().limit(5),
            Analytics.findOne(),
            Order.aggregate([
                { $match: { createdAt: { $gte: sixMonthsStart }, status: { $ne: 'cancelled' } } },
                {
                    $group: {
                        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
                        revenue: { $sum: '$total' },
                        orders: { $sum: 1 },
                    },
                },
            ]),
        ]);

        const totalRevenue = revenueAggregate[0]?.total || 0;

        // Fill every one of the last 6 months — months without orders are
        // honest zeros, never interpolated or seeded values.
        const monthlyMap = new Map(
            revenueMonthly.map((row) => [`${row._id.year}-${row._id.month}`, row])
        );
        const revenueSeries = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const row = monthlyMap.get(`${d.getFullYear()}-${d.getMonth() + 1}`);
            revenueSeries.push({
                month: MONTH_NAMES[d.getMonth()],
                revenue: row ? Math.round(row.revenue * 100) / 100 : 0,
                orders: row ? row.orders : 0,
            });
        }

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
            topCategories,
            revenueSeries
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getDashboardData
};

