const crypto = require('crypto');

// ── 2FA recovery codes (GAP B) ──────────────────────────────────────
// Ten one-time codes per set. Each code is 10 characters from an
// unambiguous alphabet (no 0/O, 1/I/L) — 50 bits of entropy — shown
// to the owner grouped as XXXXX-XXXXX. Only the SHA-256 hash of the
// normalized code is stored: at 50 bits, an offline attacker with
// the hash still faces 2^50 work per code, and online guessing is
// bounded by the GAP A throttle on the verify step. A code is
// single-use; a fresh set replaces (kills) the old one.
const RECOVERY_CODE_COUNT = 10;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const normalizeRecoveryCode = (code) =>
    String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const hashRecoveryCode = (code) =>
    crypto.createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');

const randomCode = () => {
    let raw = '';
    const bytes = crypto.randomBytes(10);
    for (const byte of bytes) raw += ALPHABET[byte % ALPHABET.length];
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
};

/** A fresh set: the plain codes (shown once) + the stored records. */
const generateRecoveryCodeSet = () => {
    const plain = [];
    const records = [];
    const seen = new Set();
    while (plain.length < RECOVERY_CODE_COUNT) {
        const code = randomCode();
        const hash = hashRecoveryCode(code);
        if (seen.has(hash)) continue;
        seen.add(hash);
        plain.push(code);
        records.push({ hash, usedAt: null, createdAt: new Date() });
    }
    return { plain, records };
};

/** Finds the index of a live (unused) code matching the input, or -1. */
const matchRecoveryCode = (records, input) => {
    const hash = hashRecoveryCode(input);
    if (!hash || normalizeRecoveryCode(input).length < 8) return -1;
    const candidate = Buffer.from(hash, 'utf8');
    return (records || []).findIndex((record) => {
        if (!record || record.usedAt) return false;
        const stored = Buffer.from(String(record.hash || ''), 'utf8');
        return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
    });
};

const remainingRecoveryCodes = (records) =>
    (records || []).filter((record) => record && !record.usedAt).length;

module.exports = {
    RECOVERY_CODE_COUNT,
    generateRecoveryCodeSet,
    matchRecoveryCode,
    remainingRecoveryCodes,
    hashRecoveryCode,
    normalizeRecoveryCode,
};
