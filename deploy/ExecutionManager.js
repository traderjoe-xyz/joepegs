const { verify } = require("./utils");
const { getProxyOwner } = require("./getAddress");

module.exports = async function ({
  getNamedAccounts,
  deployments,
  getChainId,
}) {
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  const chainId = await getChainId();

  let proxyContract, proxyOwner;

  proxyOwner = getProxyOwner(chainId);

  const strategyStandardSaleForFixedPrice = await deployments.get(
    "StrategyStandardSaleForFixedPrice"
  );
  const strategyAnyItemFromCollectionForFixedPrice = await deployments.get(
    "StrategyAnyItemFromCollectionForFixedPrice"
  );

  const args = [];
  await catchUnknownSigner(async () => {
    proxyContract = await deploy("ExecutionManager", {
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

  const executionManager = await ethers.getContract(
    "ExecutionManager",
    deployer
  );

  if (proxyContract && proxyContract.newlyDeployed) {
    await executionManager.addStrategy(
      strategyStandardSaleForFixedPrice.address
    );
    await executionManager.addStrategy(
      strategyAnyItemFromCollectionForFixedPrice.address
    );
  }

  await verify(proxyContract.implementation, []);
};

module.exports.tags = ["ExecutionManager"];
module.exports.dependencies = [
  "StrategyStandardSaleForFixedPrice",
  "StrategyAnyItemFromCollectionForFixedPrice",
];
