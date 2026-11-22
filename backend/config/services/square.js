// Square — PAYMENT sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "square",
    "service": "PAYMENT",
    "name": "Square",
    "baseUrl": "https://connect.squareup.com/v2",
    "auth": {
        "style": "bearer",
        "tokenKey": "accessToken"
    },
    "fields": [
        {
            "key": "accessToken",
            "label": "Access Token",
            "secret": true,
            "required": true,
            "placeholder": "Paste the access token — hidden after saving"
        },
        {
            "key": "locationId",
            "label": "Location ID",
            "secret": false,
            "required": true,
            "placeholder": "Your Square location ID"
        }
    ],
    "endpoints": [
        {
            "name": "locations",
            "path": "/locations",
            "method": "GET"
        }
    ]
};
