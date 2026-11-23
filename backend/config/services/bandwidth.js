// Bandwidth — SMS_NOTIFICATION sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "bandwidth",
    "service": "SMS_NOTIFICATION",
    "name": "Bandwidth",
    "baseUrl": "https://messaging.bandwidth.com/api/v2/users/{accountId}",
    "auth": {
        "style": "basic",
        "userKey": "apiToken",
        "passKey": "apiSecret"
    },
    "fields": [
        {
            "key": "accountId",
            "label": "Account ID",
            "secret": false,
            "required": true,
            "placeholder": "Your account ID"
        },
        {
            "key": "apiToken",
            "label": "API Token",
            "secret": false,
            "required": true,
            "placeholder": "Your Bandwidth API token"
        },
        {
            "key": "apiSecret",
            "label": "API Secret",
            "secret": true,
            "required": true,
            "placeholder": "Paste the API secret — hidden after saving"
        },
        {
            "key": "fromNumber",
            "label": "From Number",
            "secret": false,
            "required": true,
            "placeholder": "e.g. +14155552671"
        }
    ],
    "endpoints": []
};
