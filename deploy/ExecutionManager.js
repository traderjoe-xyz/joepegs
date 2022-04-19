const { verify } = require("./utils");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  let proxyContract;

  const strategyAnyItemFromCollectionForFixedPrice = await deployments.get(
    "StrategyAnyItemFromCollectionForFixedPrice"
  );
  const strategyPrivateSale = await deployments.get("StrategyPrivateSale");
  const strategyStandardSaleForFixedPrice = await deployments.get(
    "StrategyStandardSaleForFixedPrice"
  );

  const args = [];
  await catchUnknownSigner(async () => {
    proxyAddress = await deploy("ExecutionManager", {
      from: deployer,
      proxy: {
        owner: deployer,
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
  })

  const executionManager = await ethers.getContract(
    "ExecutionManager",
    deployer
  );

  await executionManager.addStrategy(
    strategyAnyItemFromCollectionForFixedPrice.address
  );
  await executionManager.addStrategy(strategyPrivateSale.address);
  await executionManager.addStrategy(strategyStandardSaleForFixedPrice.address);

  await verify(proxyContract.address, args);
};

module.exports.tags = ["ExecutionManager"];
module.exports.dependencies = [
  "StrategyAnyItemFromCollectionForFixedPrice",
  "StrategyPrivateSale",
  "StrategyStandardSaleForFixedPrice",
];
