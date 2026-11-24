// Firebase Auth — AUTH sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
//
// Firebase issues ONE web config object per project/app (Project
// settings → Your apps → Web app) and Firebase Auth consumes that
// same object, so the fields mirror it exactly: apiKey, authDomain,
// projectId, storageBucket, messagingSenderId, appId, measurementId.
// These are config identifiers, not true secrets, so none is masked;
// measurementId only exists when Analytics is enabled, so it is the
// one optional field.
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
        },
        {
            "key": "planName",
            "label": "Plan Name",
            "secret": false,
            "required": false,
            "plan": true,
            "placeholder": "e.g. Free"
        },
        {
            "key": "mauLimit",
            "label": "Monthly Active Users Limit",
            "secret": false,
            "required": false,
            "plan": true,
            "placeholder": "e.g. 7,500 users"
        }
    ],
    "endpoints": []
};
