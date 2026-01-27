const { pool, query } = require('../db');
const { ApiError } = require('../utils/errors');
const { getMockProvider } = require('./providers');

function sanitizeDiscoveryItem(item) {
  return {
    resourceId: item.resourceId,
    resourceName: item.resourceName,
    resourceType: item.resourceType,
    provider: item.provider,
    region: item.region,
    state: item.state,
    metadata: item.metadata || {},
    tags: item.tags || {},
    costDaily: item.costDaily ?? 0,
    costMonthly: item.costMonthly ?? 0,
  };
}

async function insertActivityLog(client, orgId, userId, payload) {
  await client.query(
    `INSERT INTO activity_log
      (organization_id, user_id, action_type, resource_type, resource_id, entity_type, entity_id,
       changes, status, message, created_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, NOW())`,
    [
      orgId,
      userId,
      payload.actionType,
      payload.resourceType || null,
      payload.resourceId || null,
      payload.entityType || null,
      payload.entityId || null,
      JSON.stringify(payload.changes || {}),
      payload.status || 'success',
      payload.message || '',
    ]
  );
}

/**
 * PUBLIC_INTERFACE
 * Run a mock discovery for a single cloud account:
 * - marks cloud_accounts sync_status running -> success/failed
 * - upserts discovered items into resources table
 * - marks any previously-known resources not present as state='deleted'
 * - writes activity_log events
 *
 * NOTE: This is a mock discovery (no real provider calls).
 *
 * @param {any} cloudAccountRow row from cloud_accounts
 * @param {{ initiatedByUserId?: string|null }} options options
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, resourcesDiscovered?: number, error?: string }>}
 */
async function discoverForAccount(cloudAccountRow, options = {}) {
  const initiatedByUserId = options.initiatedByUserId || null;

  if (!cloudAccountRow) {
    throw new ApiError(400, 'cloudAccountRow is required', 'VALIDATION_ERROR');
  }

  const orgId = cloudAccountRow.organization_id;
  const accountId = cloudAccountRow.id;

  if (!cloudAccountRow.is_active) {
    return { ok: false, skipped: true, reason: 'account_disabled' };
  }

  const provider = String(cloudAccountRow.provider || '').trim().toLowerCase();
  const providerMock = getMockProvider(provider);

  // Deterministic inventory for this account
  const discovered = providerMock
    .listResources(cloudAccountRow)
    .map((r) => ({
      ...sanitizeDiscoveryItem({ ...r, provider }),
    }));

  const discoveredIds = discovered.map((r) => r.resourceId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Try to acquire "job lock" by setting running only if not already running.
    const lockResult = await client.query(
      `UPDATE cloud_accounts
       SET sync_status = 'running',
           sync_error = NULL,
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND sync_status <> 'running'
       RETURNING id`,
      [accountId, orgId]
    );

    if (lockResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return { ok: true, skipped: true, reason: 'already_running' };
    }

    // Upsert discovered resources
    for (const item of discovered) {
      await client.query(
        `INSERT INTO resources
          (cloud_account_id, organization_id, resource_id, resource_name, resource_type, provider,
           region, state, resource_metadata, tags, cost_daily, cost_monthly, last_synced_at,
           created_at, updated_at)
         VALUES
          ($1, $2, $3, $4, $5, $6,
           $7, $8, $9::jsonb, $10::jsonb, $11, $12, NOW(),
           NOW(), NOW())
         ON CONFLICT (cloud_account_id, resource_id)
         DO UPDATE SET
           resource_name = EXCLUDED.resource_name,
           resource_type = EXCLUDED.resource_type,
           provider = EXCLUDED.provider,
           region = EXCLUDED.region,
           state = EXCLUDED.state,
           resource_metadata = EXCLUDED.resource_metadata,
           tags = EXCLUDED.tags,
           cost_daily = EXCLUDED.cost_daily,
           cost_monthly = EXCLUDED.cost_monthly,
           last_synced_at = NOW(),
           updated_at = NOW()`,
        [
          accountId,
          orgId,
          item.resourceId,
          item.resourceName,
          item.resourceType,
          provider,
          item.region,
          item.state,
          JSON.stringify(item.metadata || {}),
          JSON.stringify(item.tags || {}),
          item.costDaily,
          item.costMonthly,
        ]
      );
    }

    // Mark stale resources as deleted (do not hard-delete; preserves history)
    if (discoveredIds.length > 0) {
      await client.query(
        `UPDATE resources
         SET state = 'deleted',
             cost_daily = 0,
             cost_monthly = 0,
             last_synced_at = NOW(),
             updated_at = NOW()
         WHERE cloud_account_id = $1
           AND organization_id = $2
           AND resource_id <> ALL($3::text[])`,
        [accountId, orgId, discoveredIds]
      );
    } else {
      await client.query(
        `UPDATE resources
         SET state = 'deleted',
             cost_daily = 0,
             cost_monthly = 0,
             last_synced_at = NOW(),
             updated_at = NOW()
         WHERE cloud_account_id = $1 AND organization_id = $2`,
        [accountId, orgId]
      );
    }

    await client.query(
      `UPDATE cloud_accounts
       SET sync_status = 'success',
           last_sync_at = NOW(),
           next_sync_at = NOW() + (sync_frequency || ' minutes')::interval,
           sync_error = NULL,
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [accountId, orgId]
    );

    await insertActivityLog(client, orgId, initiatedByUserId, {
      actionType: 'resource_discovery.completed',
      resourceType: 'cloud_account',
      resourceId: accountId,
      entityType: 'cloud_account',
      entityId: accountId,
      changes: {
        provider,
        resourcesDiscovered: discovered.length,
      },
      status: 'success',
      message: `Resource discovery completed: discovered ${discovered.length} resources for ${provider}`,
    });

    await client.query('COMMIT');

    return {
      ok: true,
      resourcesDiscovered: discovered.length,
    };
  } catch (e) {
    await client.query('ROLLBACK');

    // best-effort: update cloud account to failed in separate connection
    try {
      await query(
        `UPDATE cloud_accounts
         SET sync_status = 'failed',
             sync_error = $3,
             updated_at = NOW()
         WHERE id = $1 AND organization_id = $2`,
        [accountId, orgId, String(e && e.message ? e.message : 'Discovery failed')]
      );
    } catch (_) {
      // ignore secondary failure
    }

    // eslint-disable-next-line no-console
    console.error('resourceDiscovery.discoverForAccount error:', e);

    throw e;
  } finally {
    client.release();
  }
}

/**
 * PUBLIC_INTERFACE
 * Run discovery across all active accounts in a given organization.
 * Intended for manual triggering from an org-admin endpoint.
 *
 * @param {string} orgId organization id
 * @param {string|null} initiatedByUserId user id (may be null for system jobs)
 * @returns {Promise<{ ok: true, totalAccounts: number, succeeded: number, failed: number, results: any[] }>}
 */
async function runDiscoveryForOrganization(orgId, initiatedByUserId) {
  const accounts = await query(
    `SELECT *
     FROM cloud_accounts
     WHERE organization_id = $1 AND is_active = true
     ORDER BY created_at ASC`,
    [orgId]
  );

  const results = [];
  let succeeded = 0;
  let failed = 0;

  for (const account of accounts.rows) {
    try {
      const result = await discoverForAccount(account, { initiatedByUserId });
      results.push({ cloudAccountId: account.id, provider: account.provider, ...result });
      if (result.ok && !result.skipped) succeeded += 1;
    } catch (e) {
      failed += 1;
      results.push({
        cloudAccountId: account.id,
        provider: account.provider,
        ok: false,
        error: String(e && e.message ? e.message : e),
      });
    }
  }

  return {
    ok: true,
    totalAccounts: accounts.rowCount,
    succeeded,
    failed,
    results,
  };
}

/**
 * PUBLIC_INTERFACE
 * Run discovery for accounts that are due (next_sync_at <= now).
 * Intended for the in-process scheduler.
 *
 * @param {{ limit?: number }} options options
 * @returns {Promise<{ ok: true, totalDue: number, processed: number, results: any[] }>}
 */
async function runDueDiscoveries(options = {}) {
  const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, Number(options.limit)) : 25;

  const due = await query(
    `SELECT *
     FROM cloud_accounts
     WHERE is_active = true
       AND next_sync_at IS NOT NULL
       AND next_sync_at <= NOW()
       AND sync_status <> 'running'
     ORDER BY next_sync_at ASC
     LIMIT $1`,
    [limit]
  );

  const results = [];
  let processed = 0;

  for (const account of due.rows) {
    try {
      const result = await discoverForAccount(account, { initiatedByUserId: null });
      results.push({ cloudAccountId: account.id, orgId: account.organization_id, ...result });
      if (result.ok && !result.skipped) processed += 1;
    } catch (e) {
      results.push({
        cloudAccountId: account.id,
        orgId: account.organization_id,
        ok: false,
        error: String(e && e.message ? e.message : e),
      });
      processed += 1;
    }
  }

  return {
    ok: true,
    totalDue: due.rowCount,
    processed,
    results,
  };
}

module.exports = {
  discoverForAccount,
  runDiscoveryForOrganization,
  runDueDiscoveries,
};
