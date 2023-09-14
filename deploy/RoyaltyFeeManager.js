const { verify } = require("./utils");
const { getProxyOwner } = require("./getAddress");

module.exports = async function ({
  getNamedAccounts,
  deployments,
  getChainId,
}) {
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  let proxyContract, proxyOwner;

  const chainId = await getChainId();

  proxyOwner = getProxyOwner(chainId);

  const royaltyFeeRegistry = await deployments.get("RoyaltyFeeRegistry");
  const royaltyFeeRegistryV2 = await deployments.get("RoyaltyFeeRegistryV2");

  const args = [royaltyFeeRegistry.address, royaltyFeeRegistryV2.address];
  await catchUnknownSigner(async () => {
    proxyContract = await deploy("RoyaltyFeeManager", {
      from: deployer,
      proxy: {
        owner: proxyOwner,
        proxyContract: "OpenZeppelinTransparentProxy",
        viaAdminContract: "DefaultProxyAdmin",
        execute: {
          init: {
            methodName: "initialize",
            args: args,
          },
        },
      },
      log: true,
      deterministicDeployment: false,
    });
  });

  await verify(proxyContract.implementation, []);
};

module.exports.tags = ["RoyaltyFeeManager"];
module.exports.dependencies = ["RoyaltyFeeRegistry", "RoyaltyFeeRegistryV2"];
