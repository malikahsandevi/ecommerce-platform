const ActivityLog = require('../models/ActivityLog');

// Writes one entry to the dashboard's Recent Activity feed.
//
// This helper NEVER throws: activity logging is a side record of an action
// that already succeeded (an order, a review, a price change), so a logging
// failure must never fail the request that triggered it. Callers can safely
// `await logActivity(...)` or fire-and-forget it.
//
// type must be one of the ActivityLog enum values:
// PURCHASE | PRICE_UPDATE | REVIEW | STOCK_ALERT | STATUS_CHANGE
const logActivity = async (type, description, metadata = {}) => {
    try {
        await ActivityLog.create({ type, description, metadata });
    } catch (error) {
        console.error(`Activity log failed (${type}): ${error.message}`);
    }
};

module.exports = { logActivity };
