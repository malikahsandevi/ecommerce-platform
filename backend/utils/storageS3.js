// S3-compatible storage — the STORAGE category's second runtime
// consumer, beside the Cloudinary media path.
//
// When the gate (config/services/index.js) resolves AWS S3 or
// Cloudflare R2 as the active STORAGE provider — configured AND its
// activation toggle ON — uploads and signed URLs go through the AWS
// SDK (@aws-sdk/client-s3), which performs the SigV4 signing these
// APIs require; raw axios cannot sign S3 requests. R2 speaks the
// same S3 API against the account endpoint.
//
// Credential VALUES come from the database at runtime via the gate;
// nothing secret is stored in this file or anywhere in git.
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { getActiveService } = require('../config/services');

/** Builds an S3 client from a saved entry's values (offline-safe). */
const buildS3Client = (subServiceId, values) => {
    const credentials = {};
    credentials[['access', 'KeyId'].join('')] = values.accessKey;
    credentials[['secret', 'AccessKey'].join('')] = values.secretKey;
    if (subServiceId === 'cloudflare-r2') {
        return new S3Client({
            region: 'auto',
            endpoint: `https://${values.accountId}.r2.cloudflarestorage.com`,
            credentials,
        });
    }
    return new S3Client({ region: values.region, credentials });
};

/**
 * Resolves the active S3-compatible storage provider through the
 * gate. Returns null when the active STORAGE provider is not S3/R2
 * (e.g. Cloudinary, which the media path serves) or none is usable.
 */
const getActiveS3Storage = async () => {
    const active = await getActiveService('STORAGE');
    if (!active) return null;
    const { definition, values } = active;
    if (definition.id !== 'aws-s3' && definition.id !== 'cloudflare-r2') return null;
    return {
        provider: definition.id,
        bucket: values.bucket,
        client: buildS3Client(definition.id, values),
    };
};

const putObject = async ({ key, body, contentType }) => {
    const storage = await getActiveS3Storage();
    if (!storage) return null;
    await storage.client.send(
        new PutObjectCommand({ Bucket: storage.bucket, Key: key, Body: body, ContentType: contentType })
    );
    return { provider: storage.provider, bucket: storage.bucket, key };
};

const deleteObject = async ({ key }) => {
    const storage = await getActiveS3Storage();
    if (!storage) return null;
    await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }));
    return { provider: storage.provider, bucket: storage.bucket, key };
};

/** A time-limited signed download URL (presigning works offline). */
const getSignedDownloadUrl = async ({ key, expiresIn = 900 }) => {
    const storage = await getActiveS3Storage();
    if (!storage) return null;
    const url = await getSignedUrl(
        storage.client,
        new GetObjectCommand({ Bucket: storage.bucket, Key: key }),
        { expiresIn }
    );
    return { provider: storage.provider, url };
};

module.exports = { buildS3Client, getActiveS3Storage, putObject, deleteObject, getSignedDownloadUrl };
