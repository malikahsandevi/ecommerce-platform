// SMTP — EMAIL sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "smtp",
    "service": "EMAIL",
    "name": "SMTP",
    "baseUrl": null,
    "auth": {
        "style": "smtp"
    },
    "fields": [
        {
            "key": "host",
            "label": "Host",
            "secret": false,
            "required": true
        },
        {
            "key": "port",
            "label": "Port",
            "secret": false,
            "required": true,
            "type": "number"
        },
        {
            "key": "username",
            "label": "Username",
            "secret": false,
            "required": true
        },
        {
            "key": "password",
            "label": "Password",
            "secret": true,
            "required": true
        },
        {
            "key": "fromEmail",
            "label": "From Email",
            "secret": false,
            "required": true
        },
        {
            "key": "fromName",
            "label": "From Name",
            "secret": false,
            "required": true
        }
    ],
    "endpoints": []
};
