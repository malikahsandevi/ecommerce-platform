// Vonage — SMS_NOTIFICATION sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "vonage",
    "service": "SMS_NOTIFICATION",
    "name": "Vonage",
    "baseUrl": "https://rest.nexmo.com",
    "auth": {
        "style": "queryParams",
        "params": {
            "api_key": "apiKey",
            "api_secret": "apiSecret"
        }
    },
    "fields": [
        {
            "key": "apiKey",
            "label": "API Key",
            "secret": false,
            "required": true
        },
        {
            "key": "apiSecret",
            "label": "API Secret",
            "secret": true,
            "required": true
        },
        {
            "key": "from",
            "label": "From",
            "secret": false,
            "required": true
        }
    ],
    "endpoints": [
        {
            "name": "balance",
            "path": "/account/get-balance",
            "method": "GET"
        }
    ]
};
