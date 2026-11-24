// SendCloud — SHIPPING sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "sendcloud",
    "service": "SHIPPING",
    "name": "SendCloud",
    "baseUrl": "https://panel.sendcloud.sc/api/v2",
    "auth": {
        "style": "basic",
        "userKey": "publicKey",
        "passKey": "secretKey"
    },
    "fields": [
        {
            "key": "publicKey",
            "label": "Public Key",
            "secret": false,
            "required": true,
            "placeholder": "Your public key"
        },
        {
            "key": "secretKey",
            "label": "Secret Key",
            "secret": true,
            "required": true,
            "placeholder": "Paste the secret key — hidden after saving"
        },
        {
            "key": "planName",
            "label": "Plan Name",
            "secret": false,
            "required": false,
            "plan": true,
            "placeholder": "e.g. Free"
        }
    ],
    "endpoints": [
        {
            "name": "user",
            "path": "/user",
            "method": "GET"
        }
    ]
};
