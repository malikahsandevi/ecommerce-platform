// Google Analytics — ANALYTICS sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
//
// The GA4 tag installs AUTOMATICALLY from the Measurement ID alone —
// that single field is the whole browser-side configuration. The one
// extra value Google issues is the Measurement Protocol API secret
// (Admin → Data Streams → Measurement Protocol API secrets), needed
// ONLY to send server-side events, so it is an optional secret field,
// never part of tag installation.
module.exports = {
    "id": "google-analytics",
    "service": "ANALYTICS",
    "name": "Google Analytics",
    "baseUrl": null,
    "auth": {
        "style": "none"
    },
    "fields": [
        {
            "key": "measurementId",
            "label": "Measurement ID",
            "secret": false,
            "required": true,
            "placeholder": "e.g. G-XXXXXXXXXX"
        },
        {
            "key": "apiSecret",
            "label": "API Secret (Measurement Protocol)",
            "secret": true,
            "required": false,
            "placeholder": "Only for server-side events — hidden after saving"
        }
    ],
    "endpoints": []
};
