// MinIO — STORAGE sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "minio",
    "service": "STORAGE",
    "name": "MinIO",
    "baseUrl": null,
    "auth": {
        "style": "aws-sigv4"
    },
    "fields": [
        {
            "key": "endpoint",
            "label": "Endpoint URL",
            "secret": false,
            "required": true,
            "placeholder": "e.g. https://minio.example.com:9000"
        },
        {
            "key": "accessKey",
            "label": "Access Key",
            "secret": false,
            "required": true,
            "placeholder": "Access key for your MinIO server"
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
        }
    ],
    "endpoints": []
};
