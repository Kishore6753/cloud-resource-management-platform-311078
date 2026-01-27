const { pool, query } = require('../db');
const { ApiError } = require('../utils/errors');
const { encryptJson, decryptJson } = require('../utils/crypto');
const resourceDiscoveryService = require('./resourceDiscovery');

const PROVIDERS = ['aws', 'azure', 'gcp'];
const DEFAULT_SYNC_FREQUENCY_MIN = 360; // minutes
const MIN_SYNC_FREQUENCY_MIN = 15;
const MAX_SYNC_FREQUENCY_MIN = 60 * 24 * 7; // 7 days

function toProvider(value) {
  return String(value || '').trim().toLowerCase();
}

function toTrimmedOrNull(value) {
  const v = String(value || '').trim();
  return v ? v : null;
}

function normalizeSyncFrequency(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_SYNC_FREQUENCY_MIN;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < MIN_SYNC_FREQUENCY_MIN || rounded > MAX_SYNC_FREQUENCY_MIN) return null;
  return rounded;
}

function defaultCredentialTypeForProvider(provider) {
  if (provider === 'aws') return 'access_key';
  if (provider === 'azure') return 'service_principal';
  if (provider === 'gcp') return 'service_account';
  return 'generic';
}

function validateCredential(provider, credentialType, credentialData) {
  const errors = [];

  if (!provider || !PROVIDERS.includes(provider)) {
    errors.push('provider must be one of: aws, azure, gcp');
  }

  if (!credentialType) {
    errors.push('credentialType is required');
  }

  if (!credentialData || typeof credentialData !== 'object') {
    errors.push('credentialData must be an object');
    return errors;
  }

  // Provider-specific hints (best-effort validation; does NOT contact providers).
  if (provider === 'aws' && credentialType === 'access_key') {
    if (!credentialData.accessKeyId) errors.push('credentialData.accessKeyId is required');
    if (!credentialData.secretAccessKey) errors.push('credentialData.secretAccessKey is required');
  }

  if (provider === 'azure' && credentialType === 'service_principal') {
    if (!credentialData.tenantId) errors.push('credentialData.tenantId is required');
    if (!credentialData.clientId) errors.push('credentialData.clientId is required');
    if (!credentialData.clientSecret) errors.push('credentialData.clientSecret is required');
  }

  if (provider === 'gcp' && credentialType === 'service_account') {
    const sa = credentialData.serviceAccountJson;
    if (!sa) {
      errors.push('credentialData.serviceAccountJson is required');
    }
  }

  return errors;
}

function sanitizeCredentialRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    providerType: row.provider_type,
    credentialType: row.credential_type,
    isValid: row.is_valid,
    lastVerifiedAt: row.last_verified_at,
    verificationError: row.verification_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sanitizeCloudAccountRow(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    provider: row.provider,
    accountName: row.account_name,
    accountNumber: row.account_number,
    accountEmail: row.account_email,
    isActive: row.is_active,
    syncFrequency: row.sync_frequency,
    lastSyncAt: row.last_sync_at,
    nextSyncAt: row.next_sync_at,
    syncStatus: row.sync_status,
    syncError: row.sync_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getAccountOrThrow(orgId, accountId) {
  const result = await query(
    `SELECT *
     FROM cloud_accounts
     WHERE id = $1 AND organization_id = $2`,
    [accountId, orgId]
  );

  if (result.rowCount === 0) {
    throw new ApiError(404, 'Cloud account not found', 'CLOUD_ACCOUNT_NOT_FOUND');
  }

  return result.rows[0];
}

async function getLatestCredentialForAccount(accountId) {
  const result = await query(
    `SELECT *
     FROM cloud_credentials
     WHERE cloud_account_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [accountId]
  );
  return result.rowCount ? result.rows[0] : null;
}

async function upsertCredential(client, cloudAccountId, provider, credentialType, credentialData) {
  const validationErrors = validateCredential(provider, credentialType, credentialData);
  if (validationErrors.length > 0) {
    throw new ApiError(400, 'Invalid credential payload', 'VALIDATION_ERROR', {
      errors: validationErrors,
    });
  }

  const encrypted = encryptJson({
    provider,
    credentialType,
    credentialData,
    rotatedAt: new Date().toISOString(),
  });

  const existing = await client.query(
    `SELECT id
     FROM cloud_credentials
     WHERE cloud_account_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [cloudAccountId]
  );

  if (existing.rowCount > 0) {
    const id = existing.rows[0].id;
    const updated = await client.query(
      `UPDATE cloud_credentials
       SET provider_type = $1,
           credential_type = $2,
           encrypted_credential = $3,
           is_valid = true,
           last_verified_at = NULL,
           verification_error = NULL,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [provider, credentialType, encrypted, id]
    );
    return updated.rows[0];
  }

  const inserted = await client.query(
    `INSERT INTO cloud_credentials
      (cloud_account_id, provider_type, credential_type, encrypted_credential, is_valid)
     VALUES ($1, $2, $3, $4, true)
     RETURNING *`,
    [cloudAccountId, provider, credentialType, encrypted]
  );

  return inserted.rows[0];
}

class CloudAccountsService {
  /**
   * PUBLIC_INTERFACE
   * List cloud accounts for an organization (org context required).
   * @param {string} orgId organization id
   * @param {{ limit?: any, offset?: any }} options pagination
   * @returns {Promise<{ cloudAccounts: any[], pagination: any }>}
   */
  async list(orgId, options = {}) {
    const limitRaw = Number(options.limit ?? 50);
    const offsetRaw = Number(options.offset ?? 0);

    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 200) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

    const result = await query(
      `SELECT ca.*,
              cc.id AS cred_id,
              cc.provider_type AS cred_provider_type,
              cc.credential_type AS cred_credential_type,
              cc.is_valid AS cred_is_valid,
              cc.last_verified_at AS cred_last_verified_at,
              cc.verification_error AS cred_verification_error,
              cc.created_at AS cred_created_at,
              cc.updated_at AS cred_updated_at
       FROM cloud_accounts ca
       LEFT JOIN LATERAL (
         SELECT *
         FROM cloud_credentials
         WHERE cloud_account_id = ca.id
         ORDER BY created_at DESC
         LIMIT 1
       ) cc ON true
       WHERE ca.organization_id = $1
       ORDER BY ca.created_at DESC
       LIMIT $2 OFFSET $3`,
      [orgId, limit, offset]
    );

    const countResult = await query(
      'SELECT COUNT(*)::int AS total FROM cloud_accounts WHERE organization_id = $1',
      [orgId]
    );

    const total = countResult.rows[0].total;

    return {
      cloudAccounts: result.rows.map((r) => ({
        ...sanitizeCloudAccountRow(r),
        credential: r.cred_id
          ? sanitizeCredentialRow({
              id: r.cred_id,
              provider_type: r.cred_provider_type,
              credential_type: r.cred_credential_type,
              is_valid: r.cred_is_valid,
              last_verified_at: r.cred_last_verified_at,
              verification_error: r.cred_verification_error,
              created_at: r.cred_created_at,
              updated_at: r.cred_updated_at,
            })
          : null,
      })),
      pagination: {
        limit,
        offset,
        total,
      },
    };
  }

  /**
   * PUBLIC_INTERFACE
   * Create a cloud account (org context required).
   * @param {string} orgId organization id
   * @param {string} userId user id (for audit/attribution, future use)
   * @param {any} input payload
   * @returns {Promise<any>}
   */
  async create(orgId, userId, input) {
    const provider = toProvider(input.provider);
    const accountName = String(input.accountName || '').trim();
    const accountNumber = toTrimmedOrNull(input.accountNumber);
    const accountEmail = toTrimmedOrNull(input.accountEmail);
    const isActive = input.isActive === undefined ? true : Boolean(input.isActive);

    const syncFrequency = normalizeSyncFrequency(input.syncFrequency);
    if (!syncFrequency) {
      throw new ApiError(400, 'Invalid syncFrequency', 'VALIDATION_ERROR', {
        hint: `syncFrequency must be between ${MIN_SYNC_FREQUENCY_MIN} and ${MAX_SYNC_FREQUENCY_MIN} minutes`,
      });
    }

    if (!PROVIDERS.includes(provider)) {
      throw new ApiError(400, 'Invalid provider', 'VALIDATION_ERROR', {
        allowed: PROVIDERS,
      });
    }

    if (!accountName) {
      throw new ApiError(400, 'accountName is required', 'VALIDATION_ERROR');
    }

    const credentialType = String(input.credentialType || defaultCredentialTypeForProvider(provider));
    const credentialData = input.credentialData;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const inserted = await client.query(
        `INSERT INTO cloud_accounts
          (organization_id, provider, account_name, account_number, account_email, is_active,
           sync_frequency, last_sync_at, next_sync_at, sync_status, sync_error)
         VALUES
          ($1, $2, $3, $4, $5, $6,
           $7, NULL, NOW() + ($7 || ' minutes')::interval, 'pending', NULL)
         RETURNING *`,
        [orgId, provider, accountName, accountNumber, accountEmail, isActive, syncFrequency]
      );

      const cloudAccount = inserted.rows[0];
      let credential = null;

      if (credentialData) {
        credential = await upsertCredential(
          client,
          cloudAccount.id,
          provider,
          credentialType,
          credentialData
        );
      }

      await client.query('COMMIT');

      return {
        cloudAccount: sanitizeCloudAccountRow(cloudAccount),
        credential: sanitizeCredentialRow(credential),
      };
    } catch (e) {
      await client.query('ROLLBACK');

      if (String(e && e.message).toLowerCase().includes('duplicate key')) {
        throw new ApiError(
          409,
          'Cloud account already exists for this organization/provider/account number',
          'CLOUD_ACCOUNT_EXISTS'
        );
      }

      // eslint-disable-next-line no-console
      console.error('CloudAccountsService.create error:', e);
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * PUBLIC_INTERFACE
   * Get cloud account details (org context required).
   * @param {string} orgId org id
   * @param {string} accountId cloud account id
   * @returns {Promise<any>}
   */
  async get(orgId, accountId) {
    const cloudAccount = await getAccountOrThrow(orgId, accountId);
    const credential = await getLatestCredentialForAccount(accountId);

    return {
      cloudAccount: sanitizeCloudAccountRow(cloudAccount),
      credential: sanitizeCredentialRow(credential),
    };
  }

  /**
   * PUBLIC_INTERFACE
   * Update a cloud account (org context required).
   * Supports rotating credentials by supplying credentialType + credentialData.
   * @param {string} orgId org id
   * @param {string} userId user id (for audit/attribution, future use)
   * @param {string} accountId cloud account id
   * @param {any} input update payload
   * @returns {Promise<any>}
   */
  async update(orgId, userId, accountId, input) {
    const existing = await getAccountOrThrow(orgId, accountId);

    const accountName =
      input.accountName !== undefined ? String(input.accountName || '').trim() : undefined;
    const accountNumber =
      input.accountNumber !== undefined ? toTrimmedOrNull(input.accountNumber) : undefined;
    const accountEmail =
      input.accountEmail !== undefined ? toTrimmedOrNull(input.accountEmail) : undefined;
    const isActive = input.isActive !== undefined ? Boolean(input.isActive) : undefined;

    const syncFrequency =
      input.syncFrequency !== undefined ? normalizeSyncFrequency(input.syncFrequency) : undefined;

    if (syncFrequency === null) {
      throw new ApiError(400, 'Invalid syncFrequency', 'VALIDATION_ERROR', {
        hint: `syncFrequency must be between ${MIN_SYNC_FREQUENCY_MIN} and ${MAX_SYNC_FREQUENCY_MIN} minutes`,
      });
    }

    if (accountName !== undefined && !accountName) {
      throw new ApiError(400, 'accountName cannot be empty', 'VALIDATION_ERROR');
    }

    const wantsCredentialUpdate =
      input.credentialData !== undefined && input.credentialData !== null;

    const credentialType = String(
      input.credentialType || defaultCredentialTypeForProvider(existing.provider)
    );
    const credentialData = input.credentialData;

    const nextSyncFrequency = syncFrequency !== undefined ? syncFrequency : existing.sync_frequency;
    const nextIsActive = isActive !== undefined ? isActive : existing.is_active;

    // Compute next_sync_at rules:
    // - If deactivated => next_sync_at NULL, sync_status 'disabled'
    // - If activated => next_sync_at NOW() + sync_frequency, sync_status pending (if previously disabled)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updated = await client.query(
        `UPDATE cloud_accounts
         SET account_name = COALESCE($1, account_name),
             account_number = COALESCE($2, account_number),
             account_email = COALESCE($3, account_email),
             is_active = COALESCE($4, is_active),
             sync_frequency = COALESCE($5, sync_frequency),
             next_sync_at = CASE
               WHEN COALESCE($4, is_active) = false THEN NULL
               ELSE NOW() + (COALESCE($5, sync_frequency) || ' minutes')::interval
             END,
             sync_status = CASE
               WHEN COALESCE($4, is_active) = false THEN 'disabled'
               WHEN sync_status = 'disabled' THEN 'pending'
               ELSE sync_status
             END,
             sync_error = CASE
               WHEN COALESCE($4, is_active) = false THEN NULL
               ELSE sync_error
             END,
             updated_at = NOW()
         WHERE id = $6 AND organization_id = $7
         RETURNING *`,
        [
          accountName !== undefined ? accountName : null,
          accountNumber !== undefined ? accountNumber : null,
          accountEmail !== undefined ? accountEmail : null,
          isActive !== undefined ? nextIsActive : null,
          syncFrequency !== undefined ? nextSyncFrequency : null,
          accountId,
          orgId,
        ]
      );

      if (updated.rowCount === 0) {
        throw new ApiError(404, 'Cloud account not found', 'CLOUD_ACCOUNT_NOT_FOUND');
      }

      let credential = null;
      if (wantsCredentialUpdate) {
        credential = await upsertCredential(
          client,
          accountId,
          existing.provider,
          credentialType,
          credentialData
        );
      } else {
        credential = await (async () => {
          const current = await client.query(
            `SELECT *
             FROM cloud_credentials
             WHERE cloud_account_id = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [accountId]
          );
          return current.rowCount ? current.rows[0] : null;
        })();
      }

      await client.query('COMMIT');

      return {
        cloudAccount: sanitizeCloudAccountRow(updated.rows[0]),
        credential: sanitizeCredentialRow(credential),
      };
    } catch (e) {
      await client.query('ROLLBACK');
      if (String(e && e.message).toLowerCase().includes('duplicate key')) {
        throw new ApiError(
          409,
          'Cloud account already exists for this organization/provider/account number',
          'CLOUD_ACCOUNT_EXISTS'
        );
      }
      // eslint-disable-next-line no-console
      console.error('CloudAccountsService.update error:', e);
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * PUBLIC_INTERFACE
   * Delete a cloud account (org context required).
   * @param {string} orgId org id
   * @param {string} userId user id (for audit/attribution, future use)
   * @param {string} accountId cloud account id
   * @returns {Promise<{ ok: true }>}
   */
  async remove(orgId, userId, accountId) {
    // Ensure org ownership before deleting
    await getAccountOrThrow(orgId, accountId);

    await query('DELETE FROM cloud_accounts WHERE id = $1 AND organization_id = $2', [
      accountId,
      orgId,
    ]);

    return { ok: true };
  }

  /**
   * PUBLIC_INTERFACE
   * Return credential summary for a cloud account.
   * @param {string} orgId org id
   * @param {string} accountId cloud account id
   * @returns {Promise<any>}
   */
  async getCredentialSummary(orgId, accountId) {
    await getAccountOrThrow(orgId, accountId);
    const credential = await getLatestCredentialForAccount(accountId);

    return { credential: sanitizeCredentialRow(credential) };
  }

  /**
   * PUBLIC_INTERFACE
   * Upsert/rotate credentials for a cloud account.
   * @param {string} orgId org id
   * @param {string} userId user id (for audit/attribution, future use)
   * @param {string} accountId cloud account id
   * @param {{ credentialType?: string, credentialData: any }} input payload
   * @returns {Promise<any>}
   */
  async putCredentials(orgId, userId, accountId, input) {
    const account = await getAccountOrThrow(orgId, accountId);
    const credentialType = String(
      input.credentialType || defaultCredentialTypeForProvider(account.provider)
    );
    const credentialData = input.credentialData;

    if (!credentialData) {
      throw new ApiError(400, 'credentialData is required', 'VALIDATION_ERROR');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const credential = await upsertCredential(
        client,
        accountId,
        account.provider,
        credentialType,
        credentialData
      );

      await client.query('COMMIT');
      return { credential: sanitizeCredentialRow(credential) };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * PUBLIC_INTERFACE
   * Verify stored credentials for an account (best-effort, format-only).
   * Decrypts stored credential payload and validates required fields.
   * @param {string} orgId org id
   * @param {string} userId user id (for audit/attribution, future use)
   * @param {string} accountId cloud account id
   * @returns {Promise<any>}
   */
  async verifyCredentials(orgId, userId, accountId) {
    const account = await getAccountOrThrow(orgId, accountId);
    const credential = await getLatestCredentialForAccount(accountId);

    if (!credential) {
      throw new ApiError(404, 'No credentials found for this cloud account', 'CREDENTIAL_NOT_FOUND');
    }

    let decrypted;
    try {
      decrypted = decryptJson(credential.encrypted_credential);
    } catch (e) {
      await query(
        `UPDATE cloud_credentials
         SET is_valid = false,
             last_verified_at = NOW(),
             verification_error = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [credential.id, 'Unable to decrypt credentials (check server encryption key)']
      );

      throw new ApiError(
        500,
        'Failed to decrypt credentials (server misconfiguration)',
        'CREDENTIAL_DECRYPT_FAILED'
      );
    }

    const provider = toProvider(decrypted.provider || credential.provider_type || account.provider);
    const credentialType = String(decrypted.credentialType || credential.credential_type || '');
    const credentialData = decrypted.credentialData;

    const errors = validateCredential(provider, credentialType, credentialData);

    const isValid = errors.length === 0;
    const verificationError = isValid ? null : errors.join('; ');

    await query(
      `UPDATE cloud_credentials
       SET is_valid = $2,
           last_verified_at = NOW(),
           verification_error = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [credential.id, isValid, verificationError]
    );

    const refreshed = await query('SELECT * FROM cloud_credentials WHERE id = $1', [credential.id]);

    return {
      credential: sanitizeCredentialRow(refreshed.rows[0]),
      verification: {
        ok: isValid,
        errors: errors,
      },
    };
  }

  /**
   * PUBLIC_INTERFACE
   * Trigger a mock sync for a cloud account.
   *
   * Updated behavior:
   * - Runs a mock provider discovery job
   * - Upserts discovered items into `resources`
   * - Updates cloud_accounts sync_status/last_sync_at/next_sync_at
   *
   * @param {string} orgId org id
   * @param {string} userId user id (for audit/attribution, future use)
   * @param {string} accountId cloud account id
   * @returns {Promise<any>}
   */
  async syncNow(orgId, userId, accountId) {
    const account = await getAccountOrThrow(orgId, accountId);

    if (!account.is_active) {
      throw new ApiError(400, 'Cloud account is disabled', 'CLOUD_ACCOUNT_DISABLED');
    }

    const discovery = await resourceDiscoveryService.discoverForAccount(account, {
      initiatedByUserId: userId,
    });

    const refreshed = await query(
      'SELECT * FROM cloud_accounts WHERE id = $1 AND organization_id = $2',
      [accountId, orgId]
    );

    return { cloudAccount: sanitizeCloudAccountRow(refreshed.rows[0]), discovery };
  }
}

module.exports = new CloudAccountsService();
