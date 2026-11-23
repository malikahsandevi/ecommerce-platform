// DigitalOcean Spaces — STORAGE sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "digitalocean-spaces",
    "service": "STORAGE",
    "name": "DigitalOcean Spaces",
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
            "placeholder": "Spaces access key from the API page"
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
            "placeholder": "e.g. nyc3"
        }
    ],
    "endpoints": []
};
