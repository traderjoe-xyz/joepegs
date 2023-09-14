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

  const royaltyFeeLimit = 2000; // 2000 = 20%
  const maxNumRecipients = 5;

  const args = [royaltyFeeLimit, maxNumRecipients];
  await catchUnknownSigner(async () => {
    proxyContract = await deploy("RoyaltyFeeRegistryV2", {
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
      "RoyaltyFeeRegistryV2",
      proxyContract.implementation
    );
    await implementationContract.initialize(...args);
  }

  await verify(proxyContract.implementation, []);
};

module.exports.tags = ["RoyaltyFeeRegistryV2"];
