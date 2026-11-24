// Mailgun — EMAIL sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "mailgun",
    "service": "EMAIL",
    "name": "Mailgun",
    "baseUrl": "https://api.mailgun.net/v3",
    "auth": {
        "style": "basic",
        "userLiteral": "api",
        "passKey": "apiKey"
    },
    "fields": [
        {
            "key": "apiKey",
            "label": "API Key",
            "secret": true,
            "required": true,
            "placeholder": "Paste the API key — hidden after saving"
        },
        {
            "key": "domain",
            "label": "Domain",
            "secret": false,
            "required": true,
            "placeholder": "e.g. mg.yourdomain.com"
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
            "name": "domain",
            "path": "/domains/{domain}",
            "method": "GET"
        }
    ]
};
