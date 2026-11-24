// Backblaze B2 — STORAGE sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "backblaze-b2",
    "service": "STORAGE",
    "name": "Backblaze B2",
    "baseUrl": null,
    "auth": {
        "style": "basic",
        "userKey": "keyId",
        "passKey": "applicationKey"
    },
    "fields": [
        {
            "key": "keyId",
            "label": "Key ID",
            "secret": false,
            "required": true,
            "placeholder": "Application key ID from B2"
        },
        {
            "key": "applicationKey",
            "label": "Application Key",
            "secret": true,
            "required": true,
            "placeholder": "Paste the application key — hidden after saving"
        },
        {
            "key": "bucket",
            "label": "Bucket",
            "secret": false,
            "required": true,
            "placeholder": "e.g. store-media"
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
            "key": "storageLimit",
            "label": "Storage Limit",
            "secret": false,
            "required": false,
            "plan": true,
            "placeholder": "e.g. 25 GB"
        }
    ],
    "endpoints": []
};
