// Store Session (JWT) — AUTH sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "store-session-jwt",
    "service": "AUTH",
    "name": "Store Session (JWT)",
    "baseUrl": null,
    "auth": {
        "style": "internal"
    },
    "fields": [
        {
            "key": "jwtSecret",
            "label": "JWT Secret",
            "secret": true,
            "required": true
        }
    ],
    "endpoints": [],
    "builtIn": true
};
