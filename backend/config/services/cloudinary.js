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
            "required": true,
            "placeholder": "e.g. my-cloud-name"
        },
        {
            "key": "apiKey",
            "label": "API Key",
            "secret": false,
            "required": true,
            "placeholder": "e.g. 123456789012345"
        },
        {
            "key": "apiSecret",
            "label": "API Secret",
            "secret": true,
            "required": true,
            "placeholder": "Paste the API secret — hidden after saving"
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
            "key": "storageLimit",
            "label": "Storage Limit",
            "secret": false,
            "required": false,
            "plan": true,
            "autoFill": true,
            "placeholder": "e.g. 25 GB"
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
