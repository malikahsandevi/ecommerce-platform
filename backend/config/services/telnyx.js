// Telnyx — SMS_NOTIFICATION sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "telnyx",
    "service": "SMS_NOTIFICATION",
    "name": "Telnyx",
    "baseUrl": "https://api.telnyx.com/v2",
    "auth": {
        "style": "bearer",
        "tokenKey": "apiKey"
    },
    "fields": [
        {
            "key": "apiKey",
            "label": "API Key",
            "secret": true,
            "required": true,
            "placeholder": "Paste the API key — hidden after saving"
        },
        {
            "key": "fromNumber",
            "label": "From Number",
            "secret": false,
            "required": true,
            "placeholder": "e.g. +14155552671"
        },
        {
            "key": "messagingProfileId",
            "label": "Messaging Profile ID",
            "secret": false,
            "required": true,
            "placeholder": "Your messaging profile ID"
        },
        {
            "key": "planName",
            "label": "Plan Name",
            "secret": false,
            "required": false,
            "plan": true,
            "placeholder": "e.g. Free"
        },
        {
            "key": "smsLimit",
            "label": "SMS Credit / Limit",
            "secret": false,
            "required": false,
            "plan": true,
            "autoFill": true,
            "placeholder": "e.g. 10.00 USD"
        }
    ],
    "endpoints": [
        {
            "name": "balance",
            "path": "/balance",
            "method": "GET"
        }
    ]
};
