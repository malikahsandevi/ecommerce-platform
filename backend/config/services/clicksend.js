// ClickSend — SMS_NOTIFICATION sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "clicksend",
    "service": "SMS_NOTIFICATION",
    "name": "ClickSend",
    "baseUrl": "https://rest.clicksend.com/v3",
    "auth": {
        "style": "basic",
        "userKey": "username",
        "passKey": "apiKey"
    },
    "fields": [
        {
            "key": "username",
            "label": "Username",
            "secret": false,
            "required": true,
            "placeholder": "Your ClickSend username"
        },
        {
            "key": "apiKey",
            "label": "API Key",
            "secret": true,
            "required": true,
            "placeholder": "Paste the API key — hidden after saving"
        },
        {
            "key": "from",
            "label": "From",
            "secret": false,
            "required": true,
            "placeholder": "e.g. MyStore"
        }
    ],
    "endpoints": [
        {
            "name": "account",
            "path": "/account",
            "method": "GET"
        }
    ]
};
