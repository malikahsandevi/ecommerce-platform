// Mixpanel — ANALYTICS sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "mixpanel",
    "service": "ANALYTICS",
    "name": "Mixpanel",
    "baseUrl": null,
    "auth": {
        "style": "none"
    },
    "fields": [
        {
            "key": "projectToken",
            "label": "Project Token",
            "secret": false,
            "required": true,
            "placeholder": "e.g. 1234567890abcdef\u2026"
        },
        {
            "key": "apiSecret",
            "label": "API Secret",
            "secret": true,
            "required": false,
            "placeholder": "Paste the API secret — hidden after saving"
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
    "endpoints": []
};
