// Twilio — SMS_NOTIFICATION sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "twilio",
    "service": "SMS_NOTIFICATION",
    "name": "Twilio",
    "baseUrl": "https://api.twilio.com/2010-04-01/Accounts/{accountSid}",
    "auth": {
        "style": "basic",
        "userKey": "accountSid",
        "passKey": "authToken"
    },
    "fields": [
        {
            "key": "accountSid",
            "label": "Account SID",
            "secret": false,
            "required": true,
            "placeholder": "e.g. AC… (34 characters)"
        },
        {
            "key": "authToken",
            "label": "Auth Token",
            "secret": true,
            "required": true,
            "placeholder": "Paste the auth token — hidden after saving"
        },
        {
            "key": "fromNumber",
            "label": "From Number",
            "secret": false,
            "required": true,
            "placeholder": "e.g. +14155552671"
        }
    ],
    "endpoints": [
        {
            "name": "messages",
            "path": "/Messages.json",
            "method": "GET"
        }
    ]
};
