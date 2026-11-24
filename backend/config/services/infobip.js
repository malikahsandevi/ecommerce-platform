// Infobip — SMS_NOTIFICATION sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "infobip",
    "service": "SMS_NOTIFICATION",
    "name": "Infobip",
    "baseUrl": null,
    "auth": {
        "style": "apiKeyHeader",
        "header": "Authorization",
        "key": "apiKey"
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
            "key": "baseUrl",
            "label": "Base URL",
            "secret": false,
            "required": true,
            "placeholder": "e.g. https://xxxxx.api.infobip.com"
        },
        {
            "key": "from",
            "label": "From",
            "secret": false,
            "required": true,
            "placeholder": "e.g. MyStore"
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
    "endpoints": []
};
