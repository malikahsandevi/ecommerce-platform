const { findEntry, getDefinition, DEFINITIONS, isConfigured } = require('../config/services');
const { executeEntryCall } = require('../utils/integrationRunner');

/**
 * Universal Integration Runner — server-side helper for calling a
 * saved service from backend code. Resolves through the services
 * gate (config/services/index.js): the entry must exist, be toggled
 * ON and (for presets) be fully configured, or this throws. The call
 * itself is built and sent by utils/integrationRunner.js — presets go
 * to their fixed provider base with their saved credential fields;
 * custom connectors go to their saved base URL behind the SSRF guard.
 *
 * @param {string} serviceSlug - e.g. "cloudinary" / "my-sms-api"
 * @param {string} actionName - endpoint/action name, e.g. "ping"
 * @param {object} payload - Body params
 * @param {object} queryParams - Query params
 */
const runIntegration = async (serviceSlug, actionName, payload = {}, queryParams = {}) => {
  const { entry } = await findEntry(serviceSlug);
  if (!entry) throw new Error(`Integration service '${serviceSlug}' is not active.`);
  const definition = getDefinition(entry.subService) || DEFINITIONS.custom;
  if (entry.subService && entry.subService !== 'custom' && !isConfigured(definition, entry.values)) {
    throw new Error(`Integration service '${serviceSlug}' is not fully configured.`);
  }
  return executeEntryCall({ entry, definition, endpointName: actionName, payload, queryParams });
};

module.exports = { runIntegration };
