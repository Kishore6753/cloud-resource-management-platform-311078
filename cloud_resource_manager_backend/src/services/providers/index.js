const { ApiError } = require('../../utils/errors');
const { listMockAwsResources } = require('./awsMock');
const { listMockAzureResources } = require('./azureMock');
const { listMockGcpResources } = require('./gcpMock');

/**
 * PUBLIC_INTERFACE
 * Return a provider mock implementation for the given provider string.
 * @param {'aws'|'azure'|'gcp'} provider cloud provider identifier
 * @returns {{ listResources: (cloudAccountRow: any) => any[] }}
 */
function getMockProvider(provider) {
  if (provider === 'aws') {
    return {
      listResources: listMockAwsResources,
    };
  }
  if (provider === 'azure') {
    return {
      listResources: listMockAzureResources,
    };
  }
  if (provider === 'gcp') {
    return {
      listResources: listMockGcpResources,
    };
  }

  throw new ApiError(400, `Unsupported provider: ${provider}`, 'PROVIDER_UNSUPPORTED');
}

module.exports = {
  getMockProvider,
};
