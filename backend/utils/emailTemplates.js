// Email templates + fail-soft sending — the transactional email flows.
//
// Every business flow that needs to email someone (order confirmation,
// order status updates, admin password reset) builds its message here
// and sends it through utils/mailer.js `sendMail`, which resolves the
// first configured + switched-ON EMAIL service (SMTP / Hosting Mail via
// nodemailer, SendGrid, Resend, Mailgun).
//
// FAIL-SOFT BY CONTRACT: `sendEmailSafe` never throws. When no email
// service is configured (EMAIL_NOT_CONFIGURED) or the provider errors,
// the failure is logged and the caller's flow — placing an order,
// changing its status, requesting a reset — continues exactly as if
// email did not exist. Email is a notification, never a dependency.
const Setting = require('../models/Setting');
const { sendMail } = require('./mailer');

const getStoreBranding = async () => {
    try {
        const settings = await Setting.findOne().sort({ createdAt: 1 }).select('general').lean();
        return {
            storeName: settings?.general?.storeName?.trim() || 'Ecom Store',
            currency: settings?.general?.currency || 'USD',
        };
    } catch {
        return { storeName: 'Ecom Store', currency: 'USD' };
    }
};

const money = (currency, amount) => `${currency} ${Number(amount || 0).toFixed(2)}`;

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/** Sends one email; logs and swallows every failure. Returns true when sent. */
const sendEmailSafe = async ({ to, subject, text, html }) => {
    if (!to) return false;
    try {
        await sendMail({ to, subject, text, html });
        return true;
    } catch (error) {
        console.error(`[email] Could not send "${subject}" to ${to}: ${error.message}`);
        return false;
    }
};

// One small shared layout: store name header, a heading, body lines and
// a quiet sign-off. `lines` are PLAIN text; the HTML twin escapes them,
// so the two versions can never drift apart.
const buildMessage = ({ storeName, heading, lines, cta }) => {
    const textLines = [heading, '', ...lines];
    if (cta) textLines.push('', `${cta.label}: ${cta.url}`);
    textLines.push('', `— ${storeName}`);
    const text = textLines.join('\n');

    const bodyHtml = lines.map((line) => `<p style="margin:0 0 10px;">${escapeHtml(line)}</p>`).join('');
    const ctaHtml = cta
        ? `<p style="margin:18px 0 0;"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">${escapeHtml(cta.label)}</a></p>`
        : '';
    const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
    <p style="margin:0 0 4px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">${escapeHtml(storeName)}</p>
    <h1 style="margin:0 0 16px;font-size:20px;">${escapeHtml(heading)}</h1>
    ${bodyHtml}
    ${ctaHtml}
    <p style="margin:24px 0 0;font-size:12px;color:#6b7280;">— ${escapeHtml(storeName)}</p>
  </div>
</body></html>`;
    return { text, html };
};

const itemLines = (order, currency) =>
    (order.items || []).map((item) => {
        const lineTotal = money(currency, Number(item.price || 0) * Number(item.quantity || 0));
        return `${item.name} × ${item.quantity} — ${lineTotal}`;
    });

const totalsLines = (order, currency) => {
    const lines = [];
    if (order.subtotal != null) lines.push(`Subtotal: ${money(currency, order.subtotal)}`);
    if (Number(order.shippingCost) > 0) lines.push(`Shipping: ${money(currency, order.shippingCost)}`);
    if (Number(order.tax) > 0) lines.push(`Tax: ${money(currency, order.tax)}`);
    if (Number(order.discount) > 0) lines.push(`Discount: −${money(currency, order.discount)}`);
    lines.push(`Total: ${money(currency, order.total)}`);
    return lines;
};

const firstNameOf = (customerName) => String(customerName || '').trim().split(' ')[0] || 'there';

/** "Order confirmed" — sent when an order is successfully placed. */
const sendOrderConfirmationEmail = async ({ to, customerName, order }) => {
    const { storeName, currency } = await getStoreBranding();
    const lines = [
        `Hi ${firstNameOf(customerName)}, thank you for your order. We have received it and it is being prepared.`,
        `Order number: ${order.orderNumber}`,
        `Status: ${order.status || 'pending'}`,
        'Items:',
        ...itemLines(order, currency),
        ...totalsLines(order, currency),
    ];
    const { text, html } = buildMessage({
        storeName,
        heading: `Order ${order.orderNumber} confirmed`,
        lines,
        cta: null,
    });
    return sendEmailSafe({
        to,
        subject: `Order ${order.orderNumber} confirmed — ${storeName}`,
        text,
        html,
    });
};

const STATUS_LINES = {
    processing: 'Your order is being prepared.',
    shipped: 'Your order has been shipped and is on its way to you.',
    delivered: 'Your order has been delivered. Thank you for shopping with us.',
    cancelled: 'Your order has been cancelled.',
    refunded: 'Your order has been refunded.',
    pending: 'Your order is awaiting processing.',
};

/** "Order status changed" — sent when an admin updates the status. */
const sendOrderStatusEmail = async ({ to, customerName, order, previousStatus }) => {
    const { storeName, currency } = await getStoreBranding();
    const status = order.status || 'pending';
    const lines = [
        `Hi ${firstNameOf(customerName)}, the status of your order has changed.`,
        `Order number: ${order.orderNumber}`,
        `Status: ${previousStatus} → ${status}`,
        STATUS_LINES[status] || `Your order is now ${status}.`,
    ];
    if (status === 'shipped' && order.trackingNumber) {
        lines.push(`Tracking number: ${order.trackingNumber}${order.shippingCarrier ? ` (${order.shippingCarrier})` : ''}`);
    }
    lines.push(`Total: ${money(currency, order.total)}`);
    const { text, html } = buildMessage({
        storeName,
        heading: `Order ${order.orderNumber} — ${status}`,
        lines,
        cta: null,
    });
    return sendEmailSafe({
        to,
        subject: `Order ${order.orderNumber} is now ${status} — ${storeName}`,
        text,
        html,
    });
};

/** Admin password reset — the email carries the one-time reset link. */
const sendPasswordResetEmail = async ({ to, resetUrl }) => {
    const { storeName } = await getStoreBranding();
    const lines = [
        'We received a request to reset the password for your admin account.',
        'Use the button below to choose a new password. This link expires in 1 hour and can be used only once.',
        'If you did not request this, you can ignore this email — your password will not change.',
    ];
    const { text, html } = buildMessage({
        storeName,
        heading: 'Reset your password',
        lines,
        cta: { label: 'Reset password', url: resetUrl },
    });
    return sendEmailSafe({
        to,
        subject: `Reset your password — ${storeName} Admin`,
        text,
        html,
    });
};

module.exports = {
    sendEmailSafe,
    sendOrderConfirmationEmail,
    sendOrderStatusEmail,
    sendPasswordResetEmail,
    getStoreBranding,
};
