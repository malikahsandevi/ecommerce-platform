'use strict';

/**
 * Plan details fetchers — for the providers whose own account API reports
 * the plan / limits (the Part B audit), ask that API for the values the
 * Settings panel's Test flow fills into an entry's EMPTY plan fields.
 *
 * Contract: fetchPlanDetails(definition, values) resolves to a plain
 * { fieldKey: string } map containing ONLY the definition's plan fields
 * marked autoFill, and only values the provider actually reported. Any
 * failure (no fetcher, network error, provider error, missing value)
 * resolves to an empty map — a Test never fails because the plan lookup
 * did. Nothing here persists anything; the panel applies the values to
 * its form state only.
 */
const axios = require('axios');
const cloudinaryClient = require('./cloudinaryClient');

const TIMEOUT_MS = 8_000;
const get = (url, options = {}) =>
    axios.get(url, { timeout: TIMEOUT_MS, validateStatus: () => true, ...options }).then((r) => r);

const ok = (response) => response && response.status >= 200 && response.status < 300;
const str = (value) => (value === undefined || value === null || value === '' ? undefined : String(value));
const trimNum = (n) => {
    const num = Number(n);
    return Number.isFinite(num) ? String(Math.round(num * 100) / 100) : undefined;
};
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : undefined);

/** Cloudinary: the Admin API usage() call. Plan name from the account,
 * total space from the CREDIT limit — 1 credit = 1 GB (Credit System;
 * there is no storage.limit in the response). */
const cloudinary = async (values) => {
    const usage = await cloudinaryClient.usage(
        { cloudName: values.cloudName, apiKey: values.apiKey, apiSecret: values.apiSecret },
        TIMEOUT_MS,
    );
    return {
        planName: str(usage.plan),
        storageLimit: usage.creditsLimit != null ? `${trimNum(usage.creditsLimit)} GB` : undefined,
    };
};

/** SendGrid: account type (free/pro etc.) + remaining credit total. */
const sendgrid = async (values) => {
    const headers = { Authorization: `Bearer ${values.apiKey}` };
    const out = {};
    const account = await get('https://api.sendgrid.com/v3/user/account', { headers });
    if (ok(account)) out.planName = account.data?.type ? capitalize(String(account.data.type)) : undefined;
    const credits = await get('https://api.sendgrid.com/v3/user/credits', { headers });
    if (ok(credits) && credits.data?.total != null) out.sendLimit = str(credits.data.total);
    return out;
};

/** Twilio: account type (Trial/Full/…) + account balance. */
const twilio = async (values) => {
    const auth = { username: values.accountSid, password: values.authToken };
    const out = {};
    const account = await get(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(values.accountSid)}.json`,
        { auth },
    );
    if (ok(account)) out.planName = account.data?.type ? capitalize(String(account.data.type)) : undefined;
    const balance = await get(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(values.accountSid)}/Balance.json`,
        { auth },
    );
    if (ok(balance) && balance.data?.balance != null) {
        out.smsLimit = `${balance.data.balance} ${balance.data.currency || ''}`.trim();
    }
    return out;
};

/** Plivo: account type + cash credits. */
const plivo = async (values) => {
    const response = await get(`https://api.plivo.com/v1/Account/${encodeURIComponent(values.authId)}/`, {
        auth: { username: values.authId, password: values.authToken },
    });
    if (!ok(response)) return {};
    return {
        planName: response.data?.account_type ? capitalize(String(response.data.account_type)) : undefined,
        smsLimit: str(response.data?.cash_credits),
    };
};

/** Vonage: account balance (the API reports no plan name). */
const vonage = async (values) => {
    const response = await get('https://rest.nexmo.com/account/get-balance', {
        params: { api_key: values.apiKey, api_secret: values.apiSecret },
    });
    if (!ok(response) || response.data?.value == null) return {};
    return { smsLimit: str(response.data.value) };
};

/** MessageBird: account balance (no plan name). */
const messagebird = async (values) => {
    const response = await get('https://rest.messagebird.com/balance', {
        headers: { Authorization: `AccessKey ${values.accessKey}` },
    });
    if (!ok(response) || response.data?.amount == null) return {};
    return { smsLimit: str(response.data.amount) };
};

/** Telnyx: account balance + currency (no plan name). */
const telnyx = async (values) => {
    const response = await get('https://api.telnyx.com/v2/balance', {
        headers: { Authorization: `Bearer ${values.apiKey}` },
    });
    const data = response.data?.data;
    if (!ok(response) || !data || data.balance == null) return {};
    return { smsLimit: `${data.balance} ${data.currency || ''}`.trim() };
};

/** ClickSend: account balance (no plan name). */
const clicksend = async (values) => {
    const response = await get('https://rest.clicksend.com/v3/account', {
        auth: { username: values.username, password: values.apiKey },
    });
    const data = response.data?.data;
    if (!ok(response) || !data || data.balance == null) return {};
    return { smsLimit: str(data.balance) };
};

/** Infobip: account balance at the entry's own base URL (no plan name). */
const infobip = async (values) => {
    const base = String(values.baseUrl || '').replace(/\/+$/, '');
    if (!base) return {};
    const response = await get(`${base}/account/1/balance`, {
        headers: { Authorization: `App ${values.apiKey}`, Accept: 'application/json' },
    });
    const balance = response.data?.balance;
    if (!ok(response) || !balance || balance.amount == null) return {};
    return { smsLimit: `${balance.amount} ${balance.currency || ''}`.trim() };
};

const FETCHERS = {
    cloudinary,
    sendgrid,
    twilio,
    plivo,
    vonage,
    messagebird,
    telnyx,
    clicksend,
    infobip,
};

/**
 * Fetch the auto-fillable plan details for one definition with the given
 * (fully resolved) entry values. Returns {} when the provider has no plan
 * API, reports nothing usable, or the lookup fails for any reason.
 */
async function fetchPlanDetails(definition, values) {
    const fetcher = definition && FETCHERS[definition.id];
    if (!fetcher) return {};
    const autoKeys = (definition.fields || [])
        .filter((field) => field.plan && field.autoFill)
        .map((field) => field.key);
    if (autoKeys.length === 0) return {};
    let raw;
    try {
        raw = await fetcher(values || {});
    } catch {
        return {};
    }
    const out = {};
    for (const key of autoKeys) {
        const value = raw ? str(raw[key]) : undefined;
        if (value !== undefined) out[key] = value;
    }
    return out;
}

module.exports = { fetchPlanDetails };
