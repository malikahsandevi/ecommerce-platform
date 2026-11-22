// GitHub — AUTH sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "github",
    "service": "AUTH",
    "name": "GitHub",
    "baseUrl": null,
    "auth": {
        "style": "oauth"
    },
    "fields": [
        {
            "key": "clientId",
            "label": "Client ID",
            "secret": false,
            "required": true,
            "placeholder": "Client ID from the provider dashboard"
        },
        {
            "key": "clientSecret",
            "label": "Client Secret",
            "secret": true,
            "required": true,
            "placeholder": "Paste the client secret — hidden after saving"
        }
    ],
    "endpoints": []
};
