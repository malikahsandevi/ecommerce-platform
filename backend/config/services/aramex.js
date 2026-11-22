// Aramex — SHIPPING sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "aramex",
    "service": "SHIPPING",
    "name": "Aramex",
    "baseUrl": null,
    "auth": {
        "style": "soap"
    },
    "fields": [
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
            "key": "accountNumber",
            "label": "Account Number",
            "secret": false,
            "required": true,
            "placeholder": "e.g. 123456789"
        },
        {
            "key": "accountPin",
            "label": "Account PIN",
            "secret": true,
            "required": true,
            "placeholder": "Paste the account PIN — hidden after saving"
        }
    ],
    "endpoints": []
};
