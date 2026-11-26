const mongoose = require("mongoose");

// One row per throttle key (an account email, a user id, or an IP,
// namespaced by flow — see utils/authThrottle.js). Counters live in
// the database, not in process memory: the backend runs as multiple
// serverless instances, and a lock that only exists on one instance
// is not a lock. Rows self-expire a day after their last update —
// a spent window never needs to outlive that.
const authThrottleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    count: { type: Number, default: 0 },
    windowStartedAt: { type: Date, default: Date.now },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

authThrottleSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

module.exports = mongoose.model("AuthThrottle", authThrottleSchema);
