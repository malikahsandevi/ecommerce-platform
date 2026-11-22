// DHL — SHIPPING sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "dhl",
    "service": "SHIPPING",
    "name": "DHL",
    "baseUrl": "https://api-eu.dhl.com",
    "auth": {
        "style": "apiKeyHeader",
        "header": "DHL-API-Key",
        "key": "apiKey"
    },
    "fields": [
        {
            "key": "apiKey",
            "label": "API Key",
            "secret": true,
            "required": true
        },
        {
            "key": "accountNumber",
            "label": "Account Number",
            "secret": false,
            "required": true
        }
    ],
    "endpoints": []
};
