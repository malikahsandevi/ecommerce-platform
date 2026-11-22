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
            "required": true
        },
        {
            "key": "domain",
            "label": "Domain",
            "secret": false,
            "required": true
        },
        {
            "key": "fromEmail",
            "label": "From Email",
            "secret": false,
            "required": true
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
