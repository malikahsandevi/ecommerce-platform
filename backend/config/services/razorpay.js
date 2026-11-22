// Razorpay — PAYMENT sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "razorpay",
    "service": "PAYMENT",
    "name": "Razorpay",
    "baseUrl": "https://api.razorpay.com/v1",
    "auth": {
        "style": "basic",
        "userKey": "keyId",
        "passKey": "keySecret"
    },
    "fields": [
        {
            "key": "keyId",
            "label": "Key ID",
            "secret": false,
            "required": true
        },
        {
            "key": "keySecret",
            "label": "Key Secret",
            "secret": true,
            "required": true
        }
    ],
    "endpoints": [
        {
            "name": "payments",
            "path": "/payments",
            "method": "GET"
        }
    ]
};
