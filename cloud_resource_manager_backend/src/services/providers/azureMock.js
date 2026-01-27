const crypto = require('crypto');

const AZURE_REGIONS = [
  'eastus',
  'westus2',
  'northeurope',
  'westeurope',
  'southeastasia',
];

function createSeededRng(seed) {
  let counter = 0;
  return () => {
    const hash = crypto
      .createHash('sha256')
      .update(`${seed}:${counter++}`)
      .digest();
    return hash.readUInt32BE(0) / 0xffffffff;
  };
}

function pick(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

function dollars(value) {
  const n = Math.max(0, Number(value) || 0);
  return Number(n.toFixed(2));
}

/**
 * PUBLIC_INTERFACE
 * Generate a deterministic set of mock Azure resources for a cloud account.
 * @param {{ id: string, provider: 'azure', account_number?: string|null, account_name?: string|null }} cloudAccountRow
 * @returns {Array<{resourceId: string, resourceName: string, resourceType: string, region: string, state: string, metadata: any, tags: any, costDaily: number, costMonthly: number}>}
 */
function listMockAzureResources(cloudAccountRow) {
  const seed = `azure:${cloudAccountRow.account_number || cloudAccountRow.id}`;
  const rng = createSeededRng(seed);

  const region = pick(AZURE_REGIONS, rng);

  const resources = [
    {
      resourceType: 'vm',
      state: pick(['running', 'stopped', 'deallocated'], rng),
      resourceName: `api-${Math.floor(rng() * 900 + 100)}`,
      metadata: {
        size: pick(['Standard_B2s', 'Standard_D2s_v5', 'Standard_D4s_v5'], rng),
        os: pick(['linux', 'windows'], rng),
        diskGb: pick([64, 128, 256], rng),
        zone: rng() > 0.7 ? String(pick([1, 2, 3], rng)) : null,
      },
      tags: {
        Environment: pick(['prod', 'staging', 'dev'], rng),
        Owner: pick(['platform', 'api', 'data'], rng),
        ManagedBy: 'cloud-resource-manager',
      },
      costDaily: dollars(1.0 + rng() * 9.0),
    },
    {
      resourceType: 'storage_account',
      state: 'active',
      resourceName: `st${Math.floor(rng() * 9000 + 1000)}`,
      metadata: {
        kind: pick(['StorageV2', 'BlobStorage'], rng),
        replication: pick(['LRS', 'ZRS', 'GRS'], rng),
        encryption: true,
      },
      tags: {
        Environment: pick(['prod', 'staging', 'dev'], rng),
        Team: pick(['core', 'platform', 'ml'], rng),
        ManagedBy: 'cloud-resource-manager',
      },
      costDaily: dollars(0.3 + rng() * 2.5),
    },
    {
      resourceType: 'sql_database',
      state: pick(['online', 'paused'], rng),
      resourceName: `sqldb-${Math.floor(rng() * 900 + 100)}`,
      metadata: {
        tier: pick(['Basic', 'Standard', 'GeneralPurpose'], rng),
        computeModel: pick(['Provisioned', 'Serverless'], rng),
        maxSizeGb: pick([5, 50, 250, 1024], rng),
      },
      tags: {
        Environment: pick(['prod', 'staging'], rng),
        DataClass: pick(['internal', 'pii'], rng),
        ManagedBy: 'cloud-resource-manager',
      },
      costDaily: dollars(2.8 + rng() * 12.0),
    },
  ];

  return resources.map((r, idx) => {
    const chosenRegion = idx % 2 === 0 ? region : pick(AZURE_REGIONS, rng);
    const costMonthly = dollars(r.costDaily * 30);

    return {
      ...r,
      region: chosenRegion,
      costMonthly,
      resourceId: `azure:${cloudAccountRow.account_number || cloudAccountRow.id}:${r.resourceType}:${idx + 1}`,
    };
  });
}

module.exports = {
  listMockAzureResources,
};
