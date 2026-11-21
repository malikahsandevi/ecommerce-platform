// Last-resort JSON error handler, registered after all routes in app.js.
// Controllers answer their own expected errors; this catches everything
// unexpected (malformed JSON bodies, thrown errors, bad ObjectIds) and
// still answers in the API's { message } shape instead of Express's
// default HTML error page.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
    if (res.headersSent) return;

    // Body-parser failures (invalid JSON, payload too large).
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ message: 'Request body is not valid JSON.' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ message: 'Request body is too large.' });
    }

    // A malformed ObjectId in a URL is a "not found", not a server error.
    if (err.name === 'CastError') {
        return res.status(404).json({ message: 'Resource not found.' });
    }

    if (err.name === 'ValidationError') {
        return res.status(400).json({ message: err.message });
    }

    console.error(err);
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
};

module.exports = { errorHandler };
