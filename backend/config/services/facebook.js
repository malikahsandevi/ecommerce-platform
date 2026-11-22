// Facebook — AUTH sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "facebook",
    "service": "AUTH",
    "name": "Facebook",
    "baseUrl": null,
    "auth": {
        "style": "oauth"
    },
    "fields": [
        {
            "key": "appId",
            "label": "App ID",
            "secret": false,
            "required": true,
            "placeholder": "Your app ID"
        },
        {
            "key": "appSecret",
            "label": "App Secret",
            "secret": true,
            "required": true,
            "placeholder": "Paste the app secret — hidden after saving"
        }
    ],
    "endpoints": []
};
