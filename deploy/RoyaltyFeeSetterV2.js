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

  const royaltyFeeRegistryV2 = await deployments.get("RoyaltyFeeRegistryV2");

  const args = [royaltyFeeRegistryV2.address];
  await catchUnknownSigner(async () => {
    proxyContract = await deploy("RoyaltyFeeSetterV2", {
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

  if (proxyContract && proxyContract.newlyDeployed) {
    // Initialize implementation contract
    const implementationContract = await ethers.getContractAt(
      "RoyaltyFeeSetterV2",
      proxyContract.implementation
    );
    await implementationContract.initialize(...args);
  }

  await verify(proxyContract.implementation, []);
};

module.exports.tags = ["RoyaltyFeeSetterV2"];
module.exports.dependencies = ["RoyaltyFeeRegistryV2"];
