// Mapbox — MAPS sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "mapbox",
    "service": "MAPS",
    "name": "Mapbox",
    "baseUrl": "https://api.mapbox.com",
    "auth": {
        "style": "queryKey",
        "param": "access_token",
        "key": "accessToken"
    },
    "fields": [
        {
            "key": "accessToken",
            "label": "Access Token",
            "secret": true,
            "required": true,
            "placeholder": "Paste the access token — hidden after saving"
        }
    ],
    "endpoints": []
};
