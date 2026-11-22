// Google Analytics — ANALYTICS sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "google-analytics",
    "service": "ANALYTICS",
    "name": "Google Analytics",
    "baseUrl": null,
    "auth": {
        "style": "none"
    },
    "fields": [
        {
            "key": "measurementId",
            "label": "Measurement ID",
            "secret": false,
            "required": true,
            "placeholder": "e.g. G-XXXXXXXXXX"
        }
    ],
    "endpoints": []
};
