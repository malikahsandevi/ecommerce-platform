// Clerk — AUTH sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "clerk",
    "service": "AUTH",
    "name": "Clerk",
    "baseUrl": "https://api.clerk.com/v1",
    "auth": {
        "style": "bearer",
        "tokenKey": "secretKey"
    },
    "fields": [
        {
            "key": "publishableKey",
            "label": "Publishable Key",
            "secret": false,
            "required": true,
            "placeholder": "e.g. pk_live_\u2026"
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
        },
        {
            "key": "mauLimit",
            "label": "Monthly Active Users Limit",
            "secret": false,
            "required": false,
            "plan": true,
            "placeholder": "e.g. 7,500 users"
        }
    ],
    "endpoints": []
};
