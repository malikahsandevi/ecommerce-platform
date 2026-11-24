// PostEx — SHIPPING sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "postex",
    "service": "SHIPPING",
    "name": "PostEx",
    "baseUrl": "https://api.postex.pk/services/integration/api",
    "auth": {
        "style": "apiKeyHeader",
        "header": "token",
        "key": "apiToken"
    },
    "fields": [
        {
            "key": "apiToken",
            "label": "API Token",
            "secret": true,
            "required": true,
            "placeholder": "Paste the API token — hidden after saving"
        },
        {
            "key": "planName",
            "label": "Plan Name",
            "secret": false,
            "required": false,
            "plan": true,
            "placeholder": "e.g. Free"
        }
    ],
    "endpoints": []
};
