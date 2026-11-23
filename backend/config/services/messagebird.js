// MessageBird — SMS_NOTIFICATION sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "messagebird",
    "service": "SMS_NOTIFICATION",
    "name": "MessageBird",
    "baseUrl": "https://rest.messagebird.com",
    "auth": {
        "style": "apiKeyHeader",
        "header": "Authorization",
        "key": "accessKey"
    },
    "fields": [
        {
            "key": "accessKey",
            "label": "Access Key",
            "secret": true,
            "required": true,
            "placeholder": "Paste the access key — hidden after saving"
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
            "name": "balance",
            "path": "/balance",
            "method": "GET"
        }
    ]
};
