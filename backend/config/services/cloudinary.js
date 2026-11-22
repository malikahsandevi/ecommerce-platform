// Cloudinary — STORAGE sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "cloudinary",
    "service": "STORAGE",
    "name": "Cloudinary",
    "baseUrl": "https://api.cloudinary.com/v1_1/{cloudName}",
    "auth": {
        "style": "basic",
        "userKey": "apiKey",
        "passKey": "apiSecret"
    },
    "fields": [
        {
            "key": "cloudName",
            "label": "Cloud Name",
            "secret": false,
            "required": true
        },
        {
            "key": "apiKey",
            "label": "API Key",
            "secret": false,
            "required": true
        },
        {
            "key": "apiSecret",
            "label": "API Secret",
            "secret": true,
            "required": true
        }
    ],
    "endpoints": [
        {
            "name": "ping",
            "path": "/ping",
            "method": "GET"
        }
    ]
};
