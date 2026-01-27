const crypto = require('crypto');

const AWS_REGIONS = [
  'us-east-1',
  'us-west-2',
  'eu-west-1',
  'eu-central-1',
  'ap-southeast-1',
];

function createSeededRng(seed) {
  let counter = 0;
  return () => {
    const hash = crypto
      .createHash('sha256')
      .update(`${seed}:${counter++}`)
      .digest();
    // 0..1
    return hash.readUInt32BE(0) / 0xffffffff;
  };
}

function pick(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

function dollars(value) {
  // keep 2 decimals, avoid negative
  const n = Math.max(0, Number(value) || 0);
  return Number(n.toFixed(2));
}

/**
 * PUBLIC_INTERFACE
 * Generate a deterministic set of mock AWS resources for a cloud account.
 * The output is used by resource discovery jobs to populate the DB.
 * @param {{ id: string, provider: 'aws', account_number?: string|null, account_name?: string|null }} cloudAccountRow
 * @returns {Array<{resourceId: string, resourceName: string, resourceType: string, region: string, state: string, metadata: any, tags: any, costDaily: number, costMonthly: number}>}
 */
function listMockAwsResources(cloudAccountRow) {
  const seed = `aws:${cloudAccountRow.account_number || cloudAccountRow.id}`;
  const rng = createSeededRng(seed);

  const region = pick(AWS_REGIONS, rng);

  const resources = [
    {
      resourceType: 'ec2_instance',
      state: pick(['running', 'stopped'], rng),
      resourceName: `web-${Math.floor(rng() * 900 + 100)}`,
      metadata: {
        instanceType: pick(['t3.micro', 't3.small', 'm5.large', 'c6i.large'], rng),
        vpcId: `vpc-${Math.floor(rng() * 90000 + 10000)}`,
        publicIp: rng() > 0.5,
        os: pick(['linux', 'windows'], rng),
      },
      tags: {
        Environment: pick(['prod', 'staging', 'dev'], rng),
        Owner: pick(['platform', 'infra', 'app'], rng),
        ManagedBy: 'cloud-resource-manager',
      },
      costDaily: dollars(1.2 + rng() * 8.5),
    },
    {
      resourceType: 'rds_instance',
      state: pick(['available', 'stopped', 'modifying'], rng),
      resourceName: `db-${Math.floor(rng() * 900 + 100)}`,
      metadata: {
        engine: pick(['postgres', 'mysql'], rng),
        engineVersion: pick(['14', '15', '8.0'], rng),
        instanceClass: pick(['db.t3.medium', 'db.m5.large'], rng),
        multiAz: rng() > 0.6,
        storageGb: pick([20, 50, 100, 200], rng),
      },
      tags: {
        Environment: pick(['prod', 'staging'], rng),
        DataClass: pick(['pii', 'internal', 'public'], rng),
        ManagedBy: 'cloud-resource-manager',
      },
      costDaily: dollars(4.5 + rng() * 18),
    },
    {
      resourceType: 's3_bucket',
      state: 'active',
      resourceName: `assets-${Math.floor(rng() * 9000 + 1000)}`,
      metadata: {
        versioning: rng() > 0.4,
        encryption: pick(['SSE-S3', 'SSE-KMS'], rng),
        objectsApprox: Math.floor(rng() * 200000),
      },
      tags: {
        Environment: pick(['prod', 'staging', 'dev'], rng),
        Team: pick(['growth', 'core', 'platform'], rng),
        ManagedBy: 'cloud-resource-manager',
      },
      costDaily: dollars(0.2 + rng() * 2.0),
    },
    {
      resourceType: 'alb',
      state: 'active',
      resourceName: `alb-${Math.floor(rng() * 900 + 100)}`,
      metadata: {
        scheme: pick(['internet-facing', 'internal'], rng),
        listeners: pick([1, 2, 3], rng),
      },
      tags: {
        Environment: pick(['prod', 'staging'], rng),
        ManagedBy: 'cloud-resource-manager',
      },
      costDaily: dollars(0.9 + rng() * 4.2),
    },
  ];

  // Spread across regions a bit
  return resources.map((r, idx) => {
    const chosenRegion = idx % 2 === 0 ? region : pick(AWS_REGIONS, rng);
    const costMonthly = dollars(r.costDaily * 30);

    return {
      ...r,
      region: chosenRegion,
      costMonthly,
      resourceId: `aws:${cloudAccountRow.account_number || cloudAccountRow.id}:${r.resourceType}:${idx + 1}`,
    };
  });
}

module.exports = {
  listMockAwsResources,
};
