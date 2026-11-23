// Azure Blob Storage — STORAGE sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "azure-blob-storage",
    "service": "STORAGE",
    "name": "Azure Blob Storage",
    "baseUrl": null,
    "auth": {
        "style": "generic"
    },
    "fields": [
        {
            "key": "accountName",
            "label": "Storage Account",
            "secret": false,
            "required": true,
            "placeholder": "e.g. mystoreaccount"
        },
        {
            "key": "accountKey",
            "label": "Account Key",
            "secret": true,
            "required": true,
            "placeholder": "Paste the account key — hidden after saving"
        },
        {
            "key": "container",
            "label": "Container",
            "secret": false,
            "required": true,
            "placeholder": "e.g. store-media"
        }
    ],
    "endpoints": []
};
