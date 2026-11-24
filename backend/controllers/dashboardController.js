const { User, Product, Order, ActivityLog, Analytics, Category, Setting } = require('../models');
const { NOT_DELETED } = require('../utils/softDelete');
const {
    dayInTimezone,
    addDaysToDayKey,
    monthStartDayKey,
    tzMidnightUtc,
} = require('../utils/storeTime');

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

/** The store's configured timezone — the canonical day for every
 *  figure below. Day and month boundaries are computed in THIS
 *  timezone (utils/storeTime), never the server's: the host runs on
 *  UTC, so server-local bucketing put an order placed at 01:30 store
 *  time on the previous day's chart row. */
const storeTimeZoneOf = (settingsDoc) =>
    settingsDoc?.general?.timeZone || 'Asia/Karachi';

// Revenue sums an order's total only while the order is neither
// cancelled nor refunded — a refund hands the money back, so it is no
// longer income. Order COUNTS follow a different, older rule: every
// order except cancelled counts (a refunded order still happened).
// Mixed aggregates therefore match on NOT_DELETED alone and let these
// two conditional sums apply each rule to its own figure.
const revenueTotalSum = {
    $sum: { $cond: [{ $in: ['$status', ['cancelled', 'refunded']] }, 0, '$total'] },
};
const nonCancelledCount = {
    $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 0, 1] },
};

const getDashboardData = async (req, res) => {
    try {
        const now = new Date();

        // The settings document is read first: the monthly target and
        // the store timezone both live there, and every day/month
        // window below is derived from the timezone before the
        // parallel block runs.
        const settingsDoc = await Setting.findOne()
            .sort({ createdAt: 1 })
            .select('general.monthlyTarget general.timeZone')
            .lean();
        const storeTz = storeTimeZoneOf(settingsDoc);
        const todayKey = dayInTimezone(now, storeTz);

        // Windows used by the series / comparison blocks. All of them are
        // computed from the real Order and User collections — cancelled
        // orders never count as revenue or as orders in the charts, and a
        // refunded order's money is not revenue either, though the order
        // itself still counts as an order. Day and month windows open at
        // STORE-timezone midnights; the rolling week windows are
        // instant-based (now − 7/14 days) and timezone-free by nature.
        const sixMonthsStart = tzMidnightUtc(monthStartDayKey(todayKey, -5), storeTz);
        const eightDaysStart = tzMidnightUtc(addDaysToDayKey(todayKey, -7), storeTz);
        const thisWeekStart = new Date(now.getTime() - 7 * DAY_MS);
        const lastWeekStart = new Date(now.getTime() - 14 * DAY_MS);
        const monthStart = tzMidnightUtc(monthStartDayKey(todayKey, 0), storeTz);
        const lastMonthStart = tzMidnightUtc(monthStartDayKey(todayKey, -1), storeTz);

        // Revenue-only match: neither a cancelled nor a refunded order's
        // money is income.
        const revenueOrders = { status: { $nin: ['cancelled', 'refunded'] }, ...NOT_DELETED };
        const sumInWindow = (from, to) => [
            {
                $match: {
                    ...NOT_DELETED,
                    createdAt: to ? { $gte: from, $lt: to } : { $gte: from },
                },
            },
            { $group: { _id: null, revenue: revenueTotalSum, orders: nonCancelledCount } },
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
        ] = await Promise.all([
            User.countDocuments({ role: 'Customer', ...NOT_DELETED }),
            Product.countDocuments({ ...NOT_DELETED }),
            Order.countDocuments({ ...NOT_DELETED }),
            // Headline revenue matches the charts: a cancelled or
            // refunded order is not revenue. (This aggregate used to sum
            // EVERY order, so a cancelled $999 order inflated the stat
            // card while the chart below it honestly showed $0 for it.)
            Order.aggregate([
                { $match: revenueOrders },
                { $group: { _id: null, total: { $sum: '$total' } } },
            ]),
            Order.find({ ...NOT_DELETED }).sort({ createdAt: -1 }).limit(5).populate('user', 'firstName lastName email avatar'),
            ActivityLog.find().sort({ createdAt: -1 }).limit(10),
            Category.find({ ...NOT_DELETED }).select('name').lean(),
            Product.aggregate([
                { $match: { ...NOT_DELETED } },
                { $group: { _id: '$category', count: { $sum: 1 } } },
            ]),
            // Per-category SALES: every line of a non-cancelled,
            // non-refunded order counts price × quantity toward its
            // product's category.
            Order.aggregate([
                { $match: revenueOrders },
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
                { $match: { createdAt: { $gte: sixMonthsStart }, ...NOT_DELETED } },
                {
                    $group: {
                        _id: {
                            $dateToString: {
                                format: '%Y-%m',
                                date: '$createdAt',
                                timezone: storeTz,
                            },
                        },
                        revenue: revenueTotalSum,
                        orders: nonCancelledCount,
                    },
                },
            ]),
            Order.aggregate([
                { $match: { createdAt: { $gte: eightDaysStart }, ...NOT_DELETED } },
                {
                    $group: {
                        _id: {
                            $dateToString: {
                                format: '%Y-%m-%d',
                                date: '$createdAt',
                                timezone: storeTz,
                            },
                        },
                        revenue: revenueTotalSum,
                        orders: nonCancelledCount,
                    },
                },
            ]),
            Order.aggregate(sumInWindow(thisWeekStart)),
            Order.aggregate(sumInWindow(lastWeekStart, thisWeekStart)),
            User.countDocuments({ role: 'Customer', createdAt: { $gte: thisWeekStart }, ...NOT_DELETED }),
            User.countDocuments({ role: 'Customer', createdAt: { $gte: lastWeekStart, $lt: thisWeekStart }, ...NOT_DELETED }),
            Order.aggregate(sumInWindow(monthStart)),
            Order.aggregate(sumInWindow(lastMonthStart, monthStart)),
            Order.aggregate([{ $match: { ...NOT_DELETED } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
            Product.aggregate([
                { $match: { ...NOT_DELETED } },
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
            User.find({ role: 'Customer', ...NOT_DELETED })
                .sort({ createdAt: -1 })
                .limit(30)
                .select('firstName lastName email createdAt avatar')
                .lean(),
        ]);

        const totalRevenue = revenueAggregate[0]?.total || 0;

        // Activity entries about a customer (an order placed, a status
        // change, a review — their log metadata carries the customer
        // id) resolve that customer once, in one batch, so the feed
        // can show the person's own disc beside the entry instead of a
        // generic event icon. Entries without a customer (price
        // updates, stock alerts) get person: null and keep their icon.
        const activityCustomerIds = [
            ...new Set(
                activityLogs
                    .map((log) => log.metadata?.customerId)
                    .filter(Boolean)
                    .map((id) => String(id))
            ),
        ];
        const activityCustomers = activityCustomerIds.length
            ? await User.find({ _id: { $in: activityCustomerIds } })
                  .select('firstName lastName username email avatar')
                  .lean()
            : [];
        const activityCustomerById = new Map(
            activityCustomers.map((user) => [String(user._id), user])
        );
        const activityFeed = activityLogs.map((log) => {
            const entry = log.toObject();
            const customer = log.metadata?.customerId
                ? activityCustomerById.get(String(log.metadata.customerId))
                : undefined;
            entry.person = customer
                ? {
                      name:
                          [customer.firstName, customer.lastName]
                              .filter(Boolean)
                              .join(' ')
                              .trim() ||
                          customer.username ||
                          customer.email ||
                          'A customer',
                      avatar: customer.avatar || null,
                  }
                : null;
            return entry;
        });

        // Fill every one of the last 6 months — months without orders are
        // honest zeros, never interpolated or seeded values. Month keys
        // are store-timezone months, matching the aggregation's buckets.
        const monthlyMap = new Map(revenueMonthly.map((row) => [row._id, row]));
        const revenueSeries = [];
        for (let i = 5; i >= 0; i--) {
            const monthKey = monthStartDayKey(todayKey, -i).slice(0, 7);
            const row = monthlyMap.get(monthKey);
            revenueSeries.push({
                month: MONTH_NAMES[Number(monthKey.slice(5, 7)) - 1],
                revenue: row ? round2(row.revenue) : 0,
                orders: row ? row.orders : 0,
            });
        }

        // Same fill for the last 8 days (today included) — the daily view
        // of the Revenue Analytics card, keyed by store-timezone days.
        const dailyMap = new Map(revenueDaily.map((row) => [row._id, row]));
        const dailySeries = [];
        for (let i = 7; i >= 0; i--) {
            const key = addDaysToDayKey(todayKey, -i);
            const row = dailyMap.get(key);
            dailySeries.push({
                day: `${Number(key.slice(8, 10))} ${MONTH_NAMES[Number(key.slice(5, 7)) - 1]}`,
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
        // summed from real (non-cancelled, non-refunded) order lines per
        // category.
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
            activityLogs: activityFeed,
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

// @desc    Get revenue + orders for a custom date range (daily, zero-filled)
// @route   GET /api/dashboard/revenue-range?from=YYYY-MM-DD&to=YYYY-MM-DD
// @access  Admin
const getRevenueRange = async (req, res) => {
    try {
        const { from, to } = req.query;
        // from/to are DAY KEYS in the store's timezone: the window is
        // [store-midnight of `from`, store-midnight of the day after
        // `to`) and the buckets are store days, so the chart's days
        // are the store's days — the same days the export's by-date
        // filter uses.
        const isDayKey = (value) =>
            typeof value === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(value) &&
            addDaysToDayKey(value, 0) === value;
        if (!isDayKey(from) || !isDayKey(to) || from > to) {
            return res.status(400).json({ message: 'A valid from/to date range is required.' });
        }
        const dayCount =
            Math.round(
                (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
            ) + 1;
        if (dayCount > 366) {
            return res.status(400).json({ message: 'Date range is too large.' });
        }

        const settingsDoc = await Setting.findOne()
            .sort({ createdAt: 1 })
            .select('general.timeZone')
            .lean();
        const storeTz = storeTimeZoneOf(settingsDoc);

        const rows = await Order.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: tzMidnightUtc(from, storeTz),
                        $lt: tzMidnightUtc(addDaysToDayKey(to, 1), storeTz),
                    },
                    ...NOT_DELETED,
                },
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$createdAt',
                            timezone: storeTz,
                        },
                    },
                    revenue: revenueTotalSum,
                    orders: nonCancelledCount,
                },
            },
        ]);
        const byDay = new Map(rows.map((row) => [row._id, row]));
        const series = [];
        for (let i = 0; i < dayCount; i++) {
            const key = addDaysToDayKey(from, i);
            const row = byDay.get(key);
            series.push({
                date: key,
                day: `${Number(key.slice(8, 10))} ${MONTH_NAMES[Number(key.slice(5, 7)) - 1]}`,
                revenue: row ? round2(row.revenue) : 0,
                orders: row ? row.orders : 0,
            });
        }
        res.json({ from, to, series });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getDashboardData,
    getRevenueRange
};
