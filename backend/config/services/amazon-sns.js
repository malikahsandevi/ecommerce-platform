// Amazon SNS — SMS_NOTIFICATION sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "amazon-sns",
    "service": "SMS_NOTIFICATION",
    "name": "Amazon SNS",
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
            "placeholder": "Access key ID (starts with AKIA\u2026)"
        },
        {
            "key": "secretKey",
            "label": "Secret Key",
            "secret": true,
            "required": true,
            "placeholder": "Paste the secret key — hidden after saving"
        },
        {
            "key": "region",
            "label": "Region",
            "secret": false,
            "required": true,
            "placeholder": "e.g. eu-west-1"
        }
    ],
    "endpoints": []
};
