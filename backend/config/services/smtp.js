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
            "required": true,
            "placeholder": "e.g. smtp.example.com"
        },
        {
            "key": "port",
            "label": "Port",
            "secret": false,
            "required": true,
            "type": "number",
            "placeholder": "587"
        },
        {
            "key": "username",
            "label": "Username",
            "secret": false,
            "required": true,
            "placeholder": "e.g. mail@yourdomain.com"
        },
        {
            "key": "password",
            "label": "Password",
            "secret": true,
            "required": true,
            "placeholder": "Paste the password — hidden after saving"
        },
        {
            "key": "fromEmail",
            "label": "From Email",
            "secret": false,
            "required": true,
            "placeholder": "name@example.com"
        },
        {
            "key": "fromName",
            "label": "From Name",
            "secret": false,
            "required": true,
            "placeholder": "e.g. My Store"
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
    "endpoints": []
};
