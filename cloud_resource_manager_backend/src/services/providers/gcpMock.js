const crypto = require('crypto');

const GCP_REGIONS = [
  'us-central1',
  'us-east1',
  'europe-west1',
  'europe-north1',
  'asia-southeast1',
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
 * Generate a deterministic set of mock GCP resources for a cloud account.
 * @param {{ id: string, provider: 'gcp', account_number?: string|null, account_name?: string|null }} cloudAccountRow
 * @returns {Array<{resourceId: string, resourceName: string, resourceType: string, region: string, state: string, metadata: any, tags: any, costDaily: number, costMonthly: number}>}
 */
function listMockGcpResources(cloudAccountRow) {
  const seed = `gcp:${cloudAccountRow.account_number || cloudAccountRow.id}`;
  const rng = createSeededRng(seed);

  const region = pick(GCP_REGIONS, rng);

  const resources = [
    {
      resourceType: 'compute_instance',
      state: pick(['RUNNING', 'TERMINATED'], rng),
      resourceName: `worker-${Math.floor(rng() * 900 + 100)}`,
      metadata: {
        machineType: pick(['e2-medium', 'n2-standard-2', 'c3-standard-4'], rng),
        preemptible: rng() > 0.75,
        os: pick(['debian', 'ubuntu', 'cos'], rng),
      },
      tags: {
        environment: pick(['prod', 'staging', 'dev'], rng),
        owner: pick(['platform', 'ml', 'ops'], rng),
        managed_by: 'cloud-resource-manager',
      },
      costDaily: dollars(0.9 + rng() * 7.5),
    },
    {
      resourceType: 'cloud_sql_instance',
      state: pick(['RUNNABLE', 'SUSPENDED'], rng),
      resourceName: `sql-${Math.floor(rng() * 900 + 100)}`,
      metadata: {
        databaseVersion: pick(['POSTGRES_14', 'POSTGRES_15', 'MYSQL_8_0'], rng),
        tier: pick(['db-custom-1-3840', 'db-custom-2-7680'], rng),
        highAvailability: rng() > 0.6,
      },
      tags: {
        environment: pick(['prod', 'staging'], rng),
        managed_by: 'cloud-resource-manager',
      },
      costDaily: dollars(2.5 + rng() * 14.0),
    },
    {
      resourceType: 'storage_bucket',
      state: 'ACTIVE',
      resourceName: `bucket-${Math.floor(rng() * 9000 + 1000)}`,
      metadata: {
        storageClass: pick(['STANDARD', 'NEARLINE', 'COLDLINE'], rng),
        versioning: rng() > 0.5,
        publicAccessPrevention: pick(['enforced', 'inherited'], rng),
      },
      tags: {
        environment: pick(['prod', 'staging', 'dev'], rng),
        team: pick(['core', 'platform', 'data'], rng),
        managed_by: 'cloud-resource-manager',
      },
      costDaily: dollars(0.15 + rng() * 1.8),
    },
  ];

  return resources.map((r, idx) => {
    const chosenRegion = idx % 2 === 0 ? region : pick(GCP_REGIONS, rng);
    const costMonthly = dollars(r.costDaily * 30);

    return {
      ...r,
      region: chosenRegion,
      costMonthly,
      resourceId: `gcp:${cloudAccountRow.account_number || cloudAccountRow.id}:${r.resourceType}:${idx + 1}`,
    };
  });
}

module.exports = {
  listMockGcpResources,
};
