// ── Store-timezone day math ─────────────────────────────────────
// The store's configured timezone (Setting.general.timeZone) is the
// canonical day for every server-side report: the dashboard's daily
// and monthly buckets, the revenue-range window and the export's
// by-date filter must all agree on which day an order belongs to.
// The SERVER's own timezone is an accident of hosting (UTC on
// Vercel) and must never decide a store day — an order placed at
// 01:30 store time belongs to that store day, not to the previous
// UTC day. (utils/exportFilter.js carries its own copy of
// dayInTimezone for its mirror of the panel pipeline; the two must
// agree.)

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO day (yyyy-mm-dd) of an instant in an IANA timezone. */
function dayInTimezone(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone || 'Asia/Karachi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Calendar arithmetic on a yyyy-mm-dd day key (DST-free: the math
 *  runs on the key itself, in UTC, never on instants). */
function addDaysToDayKey(dayKey, days) {
    const [year, month, day] = String(dayKey).split('-').map(Number);
    const shifted = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
    const pad = (n) => String(n).padStart(2, '0');
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** The (year, month) a yyyy-mm-dd day key belongs to, as numbers. */
function monthOfDayKey(dayKey) {
    const [year, month] = String(dayKey).split('-').map(Number);
    return { year, month };
}

/** First day key of the month `offset` months from a day key's month. */
function monthStartDayKey(dayKey, offset = 0) {
    const { year, month } = monthOfDayKey(dayKey);
    const total = year * 12 + (month - 1) + offset;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    return `${y}-${String(m).padStart(2, '0')}-01`;
}

const zonedParts = (instant, timeZone) => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(instant);
    const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
    return {
        year: get('year'),
        month: get('month'),
        day: get('day'),
        hour: get('hour') % 24,
        minute: get('minute'),
        second: get('second'),
    };
};

/** Milliseconds the timezone is ahead of UTC at an instant. */
const tzOffsetMs = (instant, timeZone) => {
    const p = zonedParts(instant, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
};

/** The UTC instant of local midnight at the start of a day key in
 *  the timezone. Two offset passes keep DST-transition days right. */
function tzMidnightUtc(dayKey, timeZone) {
    const [year, month, day] = String(dayKey).split('-').map(Number);
    const guess = Date.UTC(year, month - 1, day);
    let instant = guess - tzOffsetMs(new Date(guess), timeZone);
    instant = guess - tzOffsetMs(new Date(instant), timeZone);
    return new Date(instant);
}

module.exports = {
    DAY_MS,
    dayInTimezone,
    addDaysToDayKey,
    monthOfDayKey,
    monthStartDayKey,
    tzMidnightUtc,
};
