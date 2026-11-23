// Sinch — SMS_NOTIFICATION sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "sinch",
    "service": "SMS_NOTIFICATION",
    "name": "Sinch",
    "baseUrl": "https://sms.api.sinch.com/xms/v1/{servicePlanId}",
    "auth": {
        "style": "bearer",
        "tokenKey": "apiToken"
    },
    "fields": [
        {
            "key": "servicePlanId",
            "label": "Service Plan ID",
            "secret": false,
            "required": true,
            "placeholder": "Your Sinch service plan ID"
        },
        {
            "key": "apiToken",
            "label": "API Token",
            "secret": true,
            "required": true,
            "placeholder": "Paste the API token — hidden after saving"
        },
        {
            "key": "fromNumber",
            "label": "From Number",
            "secret": false,
            "required": true,
            "placeholder": "e.g. +14155552671"
        }
    ],
    "endpoints": [
        {
            "name": "batches",
            "path": "/batches",
            "method": "GET"
        }
    ]
};
