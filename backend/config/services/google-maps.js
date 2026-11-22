// Google Maps — MAPS sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "google-maps",
    "service": "MAPS",
    "name": "Google Maps",
    "baseUrl": "https://maps.googleapis.com/maps/api",
    "auth": {
        "style": "queryKey",
        "param": "key",
        "key": "apiKey"
    },
    "fields": [
        {
            "key": "apiKey",
            "label": "API Key",
            "secret": true,
            "required": true,
            "placeholder": "Paste the API key — hidden after saving"
        }
    ],
    "endpoints": [
        {
            "name": "geocode",
            "path": "/geocode/json",
            "method": "GET"
        }
    ]
};
