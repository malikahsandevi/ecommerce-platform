const { User, Product, Order, ActivityLog, Analytics, Category, Setting } = require('../models');

// @desc    Get dashboard data
// @route   GET /api/dashboard
// @access  Admin
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 24 * 60 * 60 * 1000;

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Percentage change of `current` vs `previous`. Returns null when the
// comparison has no meaningful base (previous period is zero) so the UI
// can show a neutral dash instead of an invented number.
const pctChange = (current, previous) => {
    if (!previous) return null;
    return Math.round(((current - previous) / previous) * 10000) / 100;
};

const startOfDay = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
};

const getDashboardData = async (req, res) => {
    try {
        const now = new Date();

        // Windows used by the series / comparison blocks. All of them are
        // computed from the real Order and User collections — cancelled
        // orders never count as revenue or as orders in the charts.
        const sixMonthsStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        const eightDaysStart = startOfDay(new Date(now.getTime() - 7 * DAY_MS));
        const thisWeekStart = new Date(now.getTime() - 7 * DAY_MS);
        const lastWeekStart = new Date(now.getTime() - 14 * DAY_MS);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        const nonCancelled = { status: { $ne: 'cancelled' } };
        const sumInWindow = (from, to) => [
            {
                $match: {
                    ...nonCancelled,
                    createdAt: to ? { $gte: from, $lt: to } : { $gte: from },
                },
            },
            { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
        ];

        // Run every query in parallel — sequentially awaiting the round
        // trips made the serverless cold-start path needlessly slow.
        const [
            totalCustomers,
            totalProducts,
            totalOrders,
            revenueAggregate,
            recentOrders,
            activityLogs,
            allCategories,
            categoryProductCounts,
            categoryRevenueRows,
            existingAnalytics,
            revenueMonthly,
            revenueDaily,
            revenueThisWeekRows,
            revenueLastWeekRows,
            customersThisWeek,
            customersLastWeek,
            revenueThisMonthRows,
            revenueLastMonthRows,
            statusRows,
            inventoryRows,
            newestCustomers,
            settingsDoc,
        ] = await Promise.all([
            User.countDocuments(),
            Product.countDocuments(),
            Order.countDocuments(),
            // Headline revenue matches the charts: a cancelled order is
            // not revenue. (This aggregate used to sum EVERY order, so a
            // cancelled $999 order inflated the stat card while the chart
            // below it honestly showed $0 for it.)
            Order.aggregate([
                { $match: nonCancelled },
                { $group: { _id: null, total: { $sum: '$total' } } },
            ]),
            Order.find().sort({ createdAt: -1 }).limit(5).populate('user', 'firstName lastName email'),
            ActivityLog.find().sort({ createdAt: -1 }).limit(10),
            Category.find().select('name').lean(),
            Product.aggregate([
                { $group: { _id: '$category', count: { $sum: 1 } } },
            ]),
            // Per-category SALES: every line of a non-cancelled order
            // counts price × quantity toward its product's category.
            Order.aggregate([
                { $match: nonCancelled },
                { $unwind: '$items' },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'items.product',
                        foreignField: '_id',
                        as: 'orderedProduct',
                    },
                },
                { $unwind: '$orderedProduct' },
                {
                    $group: {
                        _id: '$orderedProduct.category',
                        revenue: {
                            $sum: { $multiply: ['$items.price', '$items.quantity'] },
                        },
                    },
                },
            ]),
            Analytics.findOne(),
            Order.aggregate([
                { $match: { createdAt: { $gte: sixMonthsStart }, ...nonCancelled } },
                {
                    $group: {
                        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
                        revenue: { $sum: '$total' },
                        orders: { $sum: 1 },
                    },
                },
            ]),
            Order.aggregate([
                { $match: { createdAt: { $gte: eightDaysStart }, ...nonCancelled } },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        revenue: { $sum: '$total' },
                        orders: { $sum: 1 },
                    },
                },
            ]),
            Order.aggregate(sumInWindow(thisWeekStart)),
            Order.aggregate(sumInWindow(lastWeekStart, thisWeekStart)),
            User.countDocuments({ createdAt: { $gte: thisWeekStart } }),
            User.countDocuments({ createdAt: { $gte: lastWeekStart, $lt: thisWeekStart } }),
            Order.aggregate(sumInWindow(monthStart)),
            Order.aggregate(sumInWindow(lastMonthStart, monthStart)),
            Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
            Product.aggregate([
                {
                    $facet: {
                        total: [{ $count: 'count' }],
                        published: [
                            { $match: { status: { $in: ['active', 'published'] } } },
                            { $count: 'count' },
                        ],
                        inStock: [{ $match: { stock: { $gt: 0 } } }, { $count: 'count' }],
                        lowStock: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $gt: ['$stock', 0] },
                                            { $lte: ['$stock', '$lowStockThreshold'] },
                                        ],
                                    },
                                },
                            },
                            { $count: 'count' },
                        ],
                        outOfStock: [{ $match: { stock: { $lte: 0 } } }, { $count: 'count' }],
                    },
                },
            ]),
            User.find()
                .sort({ createdAt: -1 })
                .limit(30)
                .select('firstName lastName email createdAt')
                .lean(),
            Setting.findOne().sort({ createdAt: 1 }).select('general.monthlyTarget').lean(),
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
                revenue: row ? round2(row.revenue) : 0,
                orders: row ? row.orders : 0,
            });
        }

        // Same fill for the last 8 days (today included) — the daily view
        // of the Revenue Analytics card.
        const dailyMap = new Map(revenueDaily.map((row) => [row._id, row]));
        const dailySeries = [];
        for (let i = 7; i >= 0; i--) {
            const d = startOfDay(new Date(now.getTime() - i * DAY_MS));
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const row = dailyMap.get(key);
            dailySeries.push({
                day: `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`,
                revenue: row ? round2(row.revenue) : 0,
                orders: row ? row.orders : 0,
            });
        }

        // Week-over-week comparisons (rolling 7-day windows).
        const weekNow = revenueThisWeekRows[0] || { revenue: 0, orders: 0 };
        const weekPrev = revenueLastWeekRows[0] || { revenue: 0, orders: 0 };
        const comparisons = {
            revenue: {
                current: round2(weekNow.revenue),
                previous: round2(weekPrev.revenue),
                pct: pctChange(weekNow.revenue, weekPrev.revenue),
            },
            orders: {
                current: weekNow.orders,
                previous: weekPrev.orders,
                pct: pctChange(weekNow.orders, weekPrev.orders),
            },
            customers: {
                current: customersThisWeek,
                previous: customersLastWeek,
                pct: pctChange(customersThisWeek, customersLastWeek),
            },
        };

        // Monthly target: the goal lives in Settings (general.monthlyTarget);
        // the gauge compares it with this month's real revenue.
        const monthRevenueRow = revenueThisMonthRows[0] || { revenue: 0, orders: 0 };
        const lastMonthRevenueRow = revenueLastMonthRows[0] || { revenue: 0, orders: 0 };
        const monthlyTargetAmount = Number(settingsDoc?.general?.monthlyTarget) || 0;
        const revenueThisMonth = round2(monthRevenueRow.revenue);
        const monthlyTarget = {
            target: monthlyTargetAmount,
            revenueThisMonth,
            percentage:
                monthlyTargetAmount > 0
                    ? Math.min(100, Math.round((revenueThisMonth / monthlyTargetAmount) * 1000) / 10)
                    : null,
            vsLastMonthPct: pctChange(revenueThisMonth, lastMonthRevenueRow.revenue),
        };

        const statusCounts = new Map(statusRows.map((row) => [row._id, row.count]));
        const ordersByStatus = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']
            .map((status) => ({ status, count: statusCounts.get(status) || 0 }))
            .filter((row) => row.count > 0 || row.status !== 'refunded');

        const facet = inventoryRows[0] || {};
        const facetCount = (key) => facet[key]?.[0]?.count || 0;
        const inventory = {
            total: facetCount('total'),
            published: facetCount('published'),
            inStock: facetCount('inStock'),
            lowStock: facetCount('lowStock'),
            outOfStock: facetCount('outOfStock'),
        };

        // Top Categories ranks by SALES, not by catalog size: revenue is
        // summed from real (non-cancelled) order lines per category.
        // Ties fall back to product count, then name, so the ranking is
        // stable. Only the top 5 are returned; totalSales sums revenue
        // across ALL categories so the donut centre is store-wide.
        const productCountByCategory = new Map(
            categoryProductCounts
                .filter((row) => row._id)
                .map((row) => [String(row._id), row.count])
        );
        const revenueByCategory = new Map(
            categoryRevenueRows
                .filter((row) => row._id)
                .map((row) => [String(row._id), round2(row.revenue)])
        );
        const totalSales = round2(
            [...revenueByCategory.values()].reduce((sum, value) => sum + value, 0)
        );
        const topCategories = allCategories
            .map((category) => ({
                name: category.name,
                revenue: revenueByCategory.get(String(category._id)) || 0,
                products: productCountByCategory.get(String(category._id)) || 0,
            }))
            .sort(
                (a, b) =>
                    b.revenue - a.revenue ||
                    b.products - a.products ||
                    a.name.localeCompare(b.name)
            )
            .slice(0, 5);

        // The legacy Analytics document (seeded traffic/conversion
        // counters) is reported when one exists, but a GET must never
        // WRITE — this handler used to create the document on first read.
        const analytics = existingAnalytics || null;

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
            totalSales,
            revenueSeries,
            dailySeries,
            comparisons,
            monthlyTarget,
            ordersByStatus,
            inventory,
            newestCustomers
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getDashboardData
};
