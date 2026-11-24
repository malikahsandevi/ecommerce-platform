// Postmark — EMAIL sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "postmark",
    "service": "EMAIL",
    "name": "Postmark",
    "baseUrl": "https://api.postmarkapp.com",
    "auth": {
        "style": "apiKeyHeader",
        "header": "X-Postmark-Server-Token",
        "key": "serverToken"
    },
    "fields": [
        {
            "key": "serverToken",
            "label": "Server Token",
            "secret": true,
            "required": true,
            "placeholder": "Paste the server token — hidden after saving"
        },
        {
            "key": "fromEmail",
            "label": "From Email",
            "secret": false,
            "required": true,
            "placeholder": "name@example.com"
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
            "key": "sendLimit",
            "label": "Monthly Send Limit",
            "secret": false,
            "required": false,
            "plan": true,
            "placeholder": "e.g. 40,000 emails"
        }
    ],
    "endpoints": [
        {
            "name": "server",
            "path": "/server",
            "method": "GET"
        }
    ]
};
