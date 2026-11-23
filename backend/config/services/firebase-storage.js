// Firebase Storage — STORAGE sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
//
// Fields = the Firebase web config object exactly as the Firebase
// console issues it (Project settings → Your apps → Web app): apiKey,
// authDomain, projectId, storageBucket, messagingSenderId, appId and
// measurementId. These are config identifiers, not true secrets (the
// apiKey included — Firebase documents it as an identifier), so none
// is masked; measurementId only exists when Analytics is enabled on
// the project, so it is the one optional field.
module.exports = {
    "id": "firebase-storage",
    "service": "STORAGE",
    "name": "Firebase Storage",
    "baseUrl": null,
    "auth": {
        "style": "generic"
    },
    "fields": [
        {
            "key": "apiKey",
            "label": "API Key",
            "secret": false,
            "required": true,
            "placeholder": "Web API key from Project settings"
        },
        {
            "key": "authDomain",
            "label": "Auth Domain",
            "secret": false,
            "required": true,
            "placeholder": "e.g. my-project.firebaseapp.com"
        },
        {
            "key": "projectId",
            "label": "Project ID",
            "secret": false,
            "required": true,
            "placeholder": "e.g. my-project-123"
        },
        {
            "key": "storageBucket",
            "label": "Storage Bucket",
            "secret": false,
            "required": true,
            "placeholder": "e.g. my-project.appspot.com"
        },
        {
            "key": "messagingSenderId",
            "label": "Messaging Sender ID",
            "secret": false,
            "required": true,
            "placeholder": "e.g. 123456789012"
        },
        {
            "key": "appId",
            "label": "App ID",
            "secret": false,
            "required": true,
            "placeholder": "e.g. 1:123456789012:web:abcdef123456"
        },
        {
            "key": "measurementId",
            "label": "Measurement ID",
            "secret": false,
            "required": false,
            "placeholder": "e.g. G-XXXXXXXXXX"
        }
    ],
    "endpoints": []
};
