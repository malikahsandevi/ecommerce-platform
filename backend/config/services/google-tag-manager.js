// Google Tag Manager — ANALYTICS sub-service definition
// (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
//
// GTM installs AUTOMATICALLY from its Container ID alone — that
// single field is the whole configuration.
module.exports = {
    "id": "google-tag-manager",
    "service": "ANALYTICS",
    "name": "Google Tag Manager",
    "baseUrl": null,
    "auth": {
        "style": "none"
    },
    "fields": [
        {
            "key": "containerId",
            "label": "Container ID",
            "secret": false,
            "required": true,
            "placeholder": "e.g. GTM-XXXXXXX"
        }
    ],
    "endpoints": []
};
