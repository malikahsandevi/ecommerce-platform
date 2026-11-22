// USPS — SHIPPING sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "usps",
    "service": "SHIPPING",
    "name": "USPS",
    "baseUrl": "https://apis.usps.com",
    "auth": {
        "style": "clientCredentials",
        "idKey": "clientId",
        "secretKey": "clientSecret",
        "tokenPath": "/oauth2/v3/token"
    },
    "fields": [
        {
            "key": "clientId",
            "label": "Client ID",
            "secret": false,
            "required": true
        },
        {
            "key": "clientSecret",
            "label": "Client Secret",
            "secret": true,
            "required": true
        }
    ],
    "endpoints": []
};
