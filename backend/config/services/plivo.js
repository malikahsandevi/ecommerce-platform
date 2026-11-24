// Plivo — SMS_NOTIFICATION sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "plivo",
    "service": "SMS_NOTIFICATION",
    "name": "Plivo",
    "baseUrl": "https://api.plivo.com/v1/Account/{authId}",
    "auth": {
        "style": "basic",
        "userKey": "authId",
        "passKey": "authToken"
    },
    "fields": [
        {
            "key": "authId",
            "label": "Auth ID",
            "secret": false,
            "required": true,
            "placeholder": "Your Plivo Auth ID"
        },
        {
            "key": "authToken",
            "label": "Auth Token",
            "secret": true,
            "required": true,
            "placeholder": "Paste the auth token — hidden after saving"
        },
        {
            "key": "fromNumber",
            "label": "From Number",
            "secret": false,
            "required": true,
            "placeholder": "e.g. +14155552671"
        },
        {
            "key": "planName",
            "label": "Plan Name",
            "secret": false,
            "required": false,
            "plan": true,
            "autoFill": true,
            "placeholder": "Filled in by Test when the provider reports it — or type it"
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
            "name": "account",
            "path": "/",
            "method": "GET"
        }
    ]
};
