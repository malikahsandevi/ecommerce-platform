require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();

// Middleware
// Content-Disposition is exposed so the admin panel can read the
// export filename the server sets on .xlsx downloads.
app.use(cors({ exposedHeaders: ['Content-Disposition'] }));
// 15mb: media uploads travel as base64 data URLs in JSON bodies. The
// default 100kb limit silently rejected any real photo before the media
// route's own parser ever saw the request.
app.use(express.json({ limit: '15mb' }));

// logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] --- ${req.method} --- ${req.originalUrl}`);
    next();
});

// Media asset protection (see utils/cloudinaryUrl.js): stored Cloudinary
// URLs are UNSIGNED authenticated-type URLs that answer 401 anywhere
// outside this API. Responses get freshly signed delivery URLs; request
// bodies are canonicalised back to the stored form so a signed URL the
// client echoes back is never persisted.
const { responseSigner, requestCanonicaliser } = require('./utils/cloudinaryUrl');
const { refreshCredentials } = require('./utils/credentials');
app.use('/api', requestCanonicaliser);
app.use('/api', responseSigner);

// Health route — database ke baghair bhi jawab deta hai.
app.get('/', (req, res) => {
    res.send('Server live hai!');
});

// Har /api request se pehle database connection ready honay ka wait —
// serverless (Vercel) cold start par pehli request connect karti hai,
// baqi cached connection use karti hain. Local par bhi yehi chalta hai.
app.use('/api', async (req, res, next) => {
    try {
        await connectDB();
        // Service credentials live in the database as normal service
        // entries (Settings → API / Integrations); the first refresh
        // also runs the one-time migration that moves the legacy
        // Credential store's values into those entries. Refreshing
        // here keeps every downstream reader — JWT verify, Cloudinary
        // signing, URL signing — on the stored values; the refresh is
        // TTL-cached and failure-proof (env fallback), so it never
        // blocks a request.
        await refreshCredentials();
        next();
    } catch (error) {
        res.status(500).json({ message: 'Database connection failed' });
    }
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/permissions', require('./routes/permissions'));
app.use('/api/search', require('./routes/search'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/users', require('./routes/users'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/brands', require('./routes/brands'));
app.use('/api/coupons', require('./routes/coupons'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/trash', require('./routes/trash'));
app.use('/api/storefront', require('./routes/storefront'));
app.use('/api/media', require('./routes/media'));
app.use('/api/export', require('./routes/export'));

// Anything under /api that matched no route is a JSON 404, not HTML.
app.use('/api', (req, res) => {
    res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Unexpected errors still answer in the API's { message } shape.
app.use(require('./middleware/errorHandler').errorHandler);

module.exports = app;
