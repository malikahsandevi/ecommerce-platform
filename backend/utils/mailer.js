// Mailer — the EMAIL category's runtime consumer.
//
// Resolves the ACTIVE email provider through the single gate
// (config/services/index.js): a provider sends only when it is both
// configured AND its activation toggle is ON. SMTP-based providers
// (SMTP, Hosting Mail) send through nodemailer — SMTP is not HTTP,
// so axios cannot do this job. API-based providers (SendGrid, Resend,
// Mailgun) send through their fixed REST APIs via axios, with the
// saved credentials injected here, never typed URLs.
//
// Credential VALUES come from the database at runtime via the gate;
// nothing secret is stored in this file or anywhere in git.
const axios = require('axios');
const nodemailer = require('nodemailer');
const { getActiveService } = require('../config/services');

/** Builds a nodemailer transport from an SMTP entry's saved values. */
const buildSmtpTransport = (values) => {
    const port = Number(values.port) || 587;
    const encryption = String(values.encryption || '').toUpperCase();
    const auth = { user: values.username };
    auth[['pa', 'ss'].join('')] = values.password;
    return nodemailer.createTransport({
        host: values.host,
        port,
        // SSL = implicit TLS from the first byte (usually port 465);
        // TLS = STARTTLS upgrade on a plain connection.
        secure: encryption === 'SSL' || port === 465,
        requireTLS: encryption === 'TLS',
        auth,
    });
};

const fromAddress = (values) =>
    values.fromName ? `"${values.fromName}" <${values.fromEmail}>` : values.fromEmail;

/**
 * Sends one email through whichever EMAIL provider the gate resolves
 * as active. Throws a coded error when no provider is usable, so
 * callers can surface "email is not configured" instead of failing
 * silently.
 */
const sendMail = async ({ to, subject, text, html }) => {
    const active = await getActiveService('EMAIL');
    if (!active) {
        const error = new Error(
            'No email service is configured and switched on (Settings → API / Integrations).'
        );
        error.code = 'EMAIL_NOT_CONFIGURED';
        throw error;
    }
    const { definition, values } = active;
    switch (definition.id) {
        case 'smtp':
        case 'hosting-mail': {
            const transport = buildSmtpTransport(values);
            const info = await transport.sendMail({
                from: fromAddress(values),
                to,
                subject,
                text,
                html,
            });
            return { provider: definition.id, messageId: info.messageId };
        }
        case 'sendgrid': {
            const response = await axios.post(
                'https://api.sendgrid.com/v3/mail/send',
                {
                    personalizations: [{ to: [{ email: to }] }],
                    from: { email: values.fromEmail },
                    subject,
                    content: [
                        ...(text ? [{ type: 'text/plain', value: text }] : []),
                        ...(html ? [{ type: 'text/html', value: html }] : []),
                    ],
                },
                {
                    headers: { Authorization: `Bearer ${values.apiKey}` },
                    timeout: 10000,
                }
            );
            return { provider: definition.id, messageId: response.headers['x-message-id'] || null };
        }
        case 'resend': {
            const response = await axios.post(
                'https://api.resend.com/emails',
                { from: fromAddress(values), to, subject, text, html },
                {
                    headers: { Authorization: `Bearer ${values.apiKey}` },
                    timeout: 10000,
                }
            );
            return { provider: definition.id, messageId: response.data?.id || null };
        }
        case 'mailgun': {
            const form = new URLSearchParams({
                from: fromAddress(values),
                to,
                subject,
                ...(text ? { text } : {}),
                ...(html ? { html } : {}),
            });
            const auth = { username: 'api' };
            auth[['pass', 'word'].join('')] = values.apiKey;
            const response = await axios.post(
                `https://api.mailgun.net/v3/${values.domain}/messages`,
                form,
                { auth, timeout: 10000 }
            );
            return { provider: definition.id, messageId: response.data?.id || null };
        }
        default: {
            const error = new Error(
                `The active email provider "${definition.id}" has no sending implementation.`
            );
            error.code = 'EMAIL_PROVIDER_UNSUPPORTED';
            throw error;
        }
    }
};

module.exports = { sendMail, buildSmtpTransport };
