// AWS S3 — STORAGE sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "aws-s3",
    "service": "STORAGE",
    "name": "AWS S3",
    "baseUrl": null,
    "auth": {
        "style": "aws-sigv4"
    },
    "fields": [
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
        },
        {
            "key": "region",
            "label": "Region",
            "secret": false,
            "required": true
        }
    ],
    "endpoints": []
};
