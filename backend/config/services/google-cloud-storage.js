// Google Cloud Storage — STORAGE sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
//
// Fields = the service-account key Google Cloud issues for the
// project (IAM → Service accounts → Keys): project ID + bucket, and
// the service account's client email + private key from the JSON key.
module.exports = {
    "id": "google-cloud-storage",
    "service": "STORAGE",
    "name": "Google Cloud Storage",
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
            "key": "bucket",
            "label": "Bucket",
            "secret": false,
            "required": true,
            "placeholder": "e.g. store-media"
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
