const { query } = require('../db');
const { ApiError } = require('../utils/errors');

function sanitizeResourceRow(row) {
  return {
    id: row.id,
    cloudAccountId: row.cloud_account_id,
    organizationId: row.organization_id,
    resourceId: row.resource_id,
    resourceName: row.resource_name,
    resourceType: row.resource_type,
    provider: row.provider,
    region: row.region,
    state: row.state,
    metadata: row.resource_metadata || {},
    tags: row.tags || {},
    costDaily: row.cost_daily,
    costMonthly: row.cost_monthly,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeSort(sortBy) {
  const mapping = {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    lastSyncedAt: 'last_synced_at',
    costMonthly: 'cost_monthly',
    costDaily: 'cost_daily',
    resourceName: 'resource_name',
    resourceType: 'resource_type',
    provider: 'provider',
    region: 'region',
    state: 'state',
  };

  return mapping[sortBy] || 'created_at';
}

function normalizeOrder(sortOrder) {
  return String(sortOrder || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
}

/**
 * PUBLIC_INTERFACE
 * List resources for an organization with filtering/sorting/pagination.
 * @param {string} orgId organization id
 * @param {any} options query options
 * @returns {Promise<{ resources: any[], pagination: { limit: number, offset: number, total: number } }>}
 */
async function listResources(orgId, options = {}) {
  const limitRaw = Number(options.limit ?? 50);
  const offsetRaw = Number(options.offset ?? 0);

  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 200) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  const provider = options.provider ? String(options.provider).trim().toLowerCase() : null;
  const cloudAccountId = options.cloudAccountId ? String(options.cloudAccountId).trim() : null;
  const resourceType = options.resourceType ? String(options.resourceType).trim() : null;
  const region = options.region ? String(options.region).trim() : null;
  const state = options.state ? String(options.state).trim() : null;

  const search = options.search ? String(options.search).trim() : null;

  const tagKey = options.tagKey ? String(options.tagKey).trim() : null;
  const tagValue = options.tagValue ? String(options.tagValue).trim() : null;

  const sortBy = normalizeSort(String(options.sortBy || 'createdAt'));
  const sortOrder = normalizeOrder(options.sortOrder);

  const where = ['organization_id = $1'];
  const params = [orgId];

  if (provider) {
    params.push(provider);
    where.push(`provider = $${params.length}`);
  }

  if (cloudAccountId) {
    params.push(cloudAccountId);
    where.push(`cloud_account_id = $${params.length}`);
  }

  if (resourceType) {
    params.push(resourceType);
    where.push(`resource_type = $${params.length}`);
  }

  if (region) {
    params.push(region);
    where.push(`region = $${params.length}`);
  }

  if (state) {
    params.push(state);
    where.push(`state = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    where.push(
      `(resource_name ILIKE $${params.length} OR resource_id ILIKE $${params.length})`
    );
  }

  if (tagKey && tagValue) {
    params.push(tagKey);
    params.push(tagValue);
    where.push(`(tags ->> $${params.length - 1}) = $${params.length}`);
  } else if (tagKey) {
    params.push(tagKey);
    where.push(`tags ? $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*)::int AS total FROM resources ${whereSql}`, params);
  const total = countResult.rows[0].total;

  // NOTE: sortBy is selected from a strict allowlist above (no SQL injection).
  const rowsResult = await query(
    `SELECT *
     FROM resources
     ${whereSql}
     ORDER BY ${sortBy} ${sortOrder}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    resources: rowsResult.rows.map(sanitizeResourceRow),
    pagination: { limit, offset, total },
  };
}

/**
 * PUBLIC_INTERFACE
 * Get a single resource by id (org-scoped), including recent cost breakdowns.
 * @param {string} orgId organization id
 * @param {string} resourceDbId resources.id (UUID)
 * @returns {Promise<{ resource: any, costBreakdowns: any[] }>}
 */
async function getResource(orgId, resourceDbId) {
  const resourceResult = await query(
    `SELECT *
     FROM resources
     WHERE id = $1 AND organization_id = $2`,
    [resourceDbId, orgId]
  );

  if (resourceResult.rowCount === 0) {
    throw new ApiError(404, 'Resource not found', 'RESOURCE_NOT_FOUND');
  }

  const resource = resourceResult.rows[0];

  const costResult = await query(
    `SELECT id, service_name, region, cost_date, usage_quantity, usage_unit, cost_amount, currency, created_at
     FROM cost_breakdowns
     WHERE organization_id = $1 AND resource_id = $2
     ORDER BY cost_date DESC
     LIMIT 90`,
    [orgId, resourceDbId]
  );

  return {
    resource: sanitizeResourceRow(resource),
    costBreakdowns: costResult.rows.map((r) => ({
      id: r.id,
      serviceName: r.service_name,
      region: r.region,
      costDate: r.cost_date,
      usageQuantity: r.usage_quantity,
      usageUnit: r.usage_unit,
      costAmount: r.cost_amount,
      currency: r.currency,
      createdAt: r.created_at,
    })),
  };
}

module.exports = {
  listResources,
  getResource,
};
