// Wasabi — STORAGE sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "wasabi",
    "service": "STORAGE",
    "name": "Wasabi",
    "baseUrl": null,
    "auth": {
        "style": "aws-sigv4"
    },
    "fields": [
        {
            "key": "accessKey",
            "label": "Access Key",
            "secret": false,
            "required": true,
            "placeholder": "Access key from the Wasabi console"
        },
        {
            "key": "secretKey",
            "label": "Secret Key",
            "secret": true,
            "required": true,
            "placeholder": "Paste the secret key — hidden after saving"
        },
        {
            "key": "bucket",
            "label": "Bucket",
            "secret": false,
            "required": true,
            "placeholder": "e.g. store-media"
        },
        {
            "key": "region",
            "label": "Region",
            "secret": false,
            "required": true,
            "placeholder": "e.g. us-east-1"
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
