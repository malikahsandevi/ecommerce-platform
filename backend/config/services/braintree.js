// Braintree — PAYMENT sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "braintree",
    "service": "PAYMENT",
    "name": "Braintree",
    "baseUrl": {
        "byField": "environment",
        "map": {
            "Sandbox": "https://api.sandbox.braintreegateway.com/merchants/{merchantId}",
            "Production": "https://api.braintreegateway.com/merchants/{merchantId}"
        },
        "default": "https://api.sandbox.braintreegateway.com/merchants/{merchantId}"
    },
    "auth": {
        "style": "basic",
        "userKey": "publicKey",
        "passKey": "privateKey"
    },
    "fields": [
        {
            "key": "merchantId",
            "label": "Merchant ID",
            "secret": false,
            "required": true,
            "placeholder": "Your merchant ID"
        },
        {
            "key": "publicKey",
            "label": "Public Key",
            "secret": false,
            "required": true,
            "placeholder": "Your public key"
        },
        {
            "key": "privateKey",
            "label": "Private Key",
            "secret": true,
            "required": true,
            "placeholder": "Paste the private key — hidden after saving"
        },
        {
            "key": "environment",
            "label": "Environment",
            "secret": false,
            "required": true,
            "type": "select",
            "options": [
                "Sandbox",
                "Production"
            ],
            "default": "Sandbox"
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
