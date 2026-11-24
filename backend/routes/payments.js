const express = require('express');
const router = express.Router();
const { stripeWebhook } = require('../controllers/paymentController');

// Gateway webhooks are PUBLIC by design — Stripe's servers call
// them, there is no staff session to protect with. The Stripe
// signature (verified in the controller over the raw body, which
// app.js keeps unparsed for this path) is the only credential.
router.post('/webhook/stripe', stripeWebhook);

module.exports = router;
