require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();

// Middleware
app.use(cors());
// 15mb: media uploads travel as base64 data URLs in JSON bodies. The
// default 100kb limit silently rejected any real photo before the media
// route's own parser ever saw the request.
app.use(express.json({ limit: '15mb' }));

// logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] --- ${req.method} --- ${req.originalUrl}`);
    next();
});

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
        next();
    } catch (error) {
        res.status(500).json({ message: 'Database connection failed' });
    }
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/permissions', require('./routes/permissions'));
app.use('/api/search', require('./routes/search'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/users', require('./routes/users'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/brands', require('./routes/brands'));
app.use('/api/coupons', require('./routes/coupons'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/media', require('./routes/media'));

// Anything under /api that matched no route is a JSON 404, not HTML.
app.use('/api', (req, res) => {
    res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Unexpected errors still answer in the API's { message } shape.
app.use(require('./middleware/errorHandler').errorHandler);

module.exports = app;
