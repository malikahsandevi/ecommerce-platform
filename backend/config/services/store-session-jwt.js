// Store Session (JWT) — AUTH sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
// This is a NORMAL catalogue entry like every other service: its
// secret is the `jwtSecret` field of its integrations entry. The
// "verify" endpoint is internal — the runner answers it by signing a
// probe token with the saved secret and verifying it (no HTTP call).
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
            "required": true,
            "placeholder": "A long random string — hidden after saving"
        }
    ],
    "endpoints": [
        {
            "name": "verify",
            "path": "/",
            "method": "GET"
        }
    ]
};
