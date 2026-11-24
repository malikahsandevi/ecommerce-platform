// Last-resort JSON error handler, registered after all routes in app.js.
// Controllers answer their own expected errors through the same
// translator (utils/apiError); this catches everything unexpected
// (malformed JSON bodies, thrown errors, bad ObjectIds) and still
// answers in the API's { message } shape instead of Express's default
// HTML error page — with a short human message, never the raw error
// text (Ahsan's toast rule: only the main point ever reaches the
// panel). The real error is logged here, server-side only.
// eslint-disable-next-line no-unused-vars
const { translateError } = require('../utils/apiError');

const errorHandler = (err, req, res, next) => {
    if (res.headersSent) return;

    const { status, message } = translateError(err);
    if (status >= 500) console.error(err);
    res.status(status).json({ message });
};

module.exports = { errorHandler };
