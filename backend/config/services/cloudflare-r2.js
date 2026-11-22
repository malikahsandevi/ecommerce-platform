// Cloudflare R2 — STORAGE sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "cloudflare-r2",
    "service": "STORAGE",
    "name": "Cloudflare R2",
    "baseUrl": null,
    "auth": {
        "style": "aws-sigv4"
    },
    "fields": [
        {
            "key": "accountId",
            "label": "Account ID",
            "secret": false,
            "required": true
        },
        {
            "key": "accessKey",
            "label": "Access Key",
            "secret": false,
            "required": true
        },
        {
            "key": "secretKey",
            "label": "Secret Key",
            "secret": true,
            "required": true
        },
        {
            "key": "bucket",
            "label": "Bucket",
            "secret": false,
            "required": true
        }
    ],
    "endpoints": []
};
