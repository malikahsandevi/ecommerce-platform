// Bunny Storage — STORAGE sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "bunny-storage",
    "service": "STORAGE",
    "name": "Bunny Storage",
    "baseUrl": null,
    "auth": {
        "style": "apiKeyHeader",
        "header": "AccessKey",
        "key": "accessKey"
    },
    "fields": [
        {
            "key": "storageZone",
            "label": "Storage Zone",
            "secret": false,
            "required": true,
            "placeholder": "e.g. my-store-zone"
        },
        {
            "key": "accessKey",
            "label": "Access Key",
            "secret": true,
            "required": true,
            "placeholder": "Paste the access key — hidden after saving"
        },
        {
            "key": "region",
            "label": "Storage Hostname",
            "secret": false,
            "required": true,
            "placeholder": "e.g. storage.bunnycdn.com"
        }
    ],
    "endpoints": []
};
