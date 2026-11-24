// Meta Pixel — ANALYTICS sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "meta-pixel",
    "service": "ANALYTICS",
    "name": "Meta Pixel",
    "baseUrl": null,
    "auth": {
        "style": "none"
    },
    "fields": [
        {
            "key": "pixelId",
            "label": "Pixel ID",
            "secret": false,
            "required": true,
            "placeholder": "e.g. 123456789012345"
        },
        {
            "key": "planName",
            "label": "Plan Name",
            "secret": false,
            "required": false,
            "plan": true,
            "placeholder": "e.g. Free"
        }
    ],
    "endpoints": []
};
