// Firebase Auth — AUTH sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "firebase-auth",
    "service": "AUTH",
    "name": "Firebase Auth",
    "baseUrl": null,
    "auth": {
        "style": "generic"
    },
    "fields": [
        {
            "key": "projectId",
            "label": "Project ID",
            "secret": false,
            "required": true,
            "placeholder": "e.g. my-project-123"
        },
        {
            "key": "clientEmail",
            "label": "Client Email",
            "secret": false,
            "required": true,
            "placeholder": "Service account email"
        },
        {
            "key": "privateKey",
            "label": "Private Key",
            "secret": true,
            "required": true,
            "placeholder": "Paste the private key — hidden after saving"
        }
    ],
    "endpoints": []
};
