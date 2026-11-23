// Supabase Storage — STORAGE sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "supabase-storage",
    "service": "STORAGE",
    "name": "Supabase Storage",
    "baseUrl": null,
    "auth": {
        "style": "bearer",
        "tokenKey": "serviceRoleKey"
    },
    "fields": [
        {
            "key": "projectUrl",
            "label": "Project URL",
            "secret": false,
            "required": true,
            "placeholder": "e.g. https://xyzcompany.supabase.co"
        },
        {
            "key": "serviceRoleKey",
            "label": "Service Role Key",
            "secret": true,
            "required": true,
            "placeholder": "Paste the service role key — hidden after saving"
        },
        {
            "key": "bucket",
            "label": "Bucket",
            "secret": false,
            "required": true,
            "placeholder": "e.g. store-media"
        }
    ],
    "endpoints": []
};
