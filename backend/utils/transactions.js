// utils/transactions.js
//
// Multi-document transactions for the order writes. An order
// placement is a SEQUENCE of writes — the stock reservations, the
// coupon claim, the order document itself — and each step is already
// atomic and self-rolling-back on its own (see orderController), so a
// refused order consumes nothing. What the sequence alone cannot
// survive is a HARD crash (process kill, power loss) between two
// steps: the reservation could be out with no order behind it.
//
// When the deployment's MongoDB supports transactions — a replica
// set (MongoDB Atlas always is one) or a sharded cluster — the
// sequence runs inside ONE transaction instead and commits or
// vanishes as a single unit, crash included. When it does not (a
// customer running a standalone mongod), the code falls back to the
// exact sequential path: the system must never break, or refuse an
// order, because transactions are unavailable.
//
// The capability verdict is detected ONCE per process (a single
// `hello` round-trip against the connected server) and cached —
// order placement never pays for the question twice.
const mongoose = require('mongoose');

let verdict = null; // true / false once known
let verdictPromise = null; // the in-flight detection, shared

/**
 * Whether the connected MongoDB can run multi-document
 * transactions: the server reports a replica-set name (`setName`)
 * or answers as a sharded router (`msg: 'isdbgrid'`). A standalone
 * server reports neither. A detection FAILURE (connection hiccup)
 * is not cached — this call falls back to "unsupported" and the
 * next one asks again.
 */
const transactionsSupported = () => {
    if (verdict !== null) return Promise.resolve(verdict);
    if (!verdictPromise) {
        verdictPromise = (async () => {
            try {
                const hello = await mongoose.connection.db
                    .admin()
                    .command({ hello: 1 });
                verdict = Boolean(
                    hello && (hello.setName || hello.msg === 'isdbgrid')
                );
                console.log(
                    verdict
                        ? 'MongoDB transactions: supported — order writes run atomically.'
                        : 'MongoDB transactions: unavailable (standalone server) — order writes run sequentially.'
                );
                return verdict;
            } catch (error) {
                verdictPromise = null;
                return false;
            }
        })();
    }
    return verdictPromise;
};

/**
 * Runs `work` as one unit. When transactions are supported, work
 * receives a Mongoose session and runs inside
 * `session.withTransaction` (the driver retries the callback on
 * transient transaction errors, so the callback must be safe to
 * re-run — every order write inside is conditional/idempotent by
 * construction). When they are not, work receives null and runs the
 * sequential path unchanged. Returns work's result either way.
 */
const withTransaction = async (work) => {
    if (!(await transactionsSupported())) {
        return work(null);
    }
    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            result = await work(session);
        });
        return result;
    } finally {
        await session.endSession();
    }
};

module.exports = { transactionsSupported, withTransaction };
