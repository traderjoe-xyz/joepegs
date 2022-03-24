module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const strategyStandardSaleForFixedPrice = await deployments.get(
    "StrategyStandardSaleForFixedPrice"
  );
  const strategyAnyItemFromCollectionForFixedPrice = await deployments.get(
    "StrategyAnyItemFromCollectionForFixedPrice"
  );

  const executionManager = await deploy("ExecutionManager", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });

  await executionManager.addStrategy(strategyStandardSaleForFixedPrice.address);
  await executionManager.addStrategy(
    strategyAnyItemFromCollectionForFixedPrice.address
  );
  await executionManager.setCollectionBidStrategy(
    strategyAnyItemFromCollectionForFixedPrice.address
  );
};

module.exports.tags = ["ExecutionManager"];
module.exports.dependencies = [
  "StrategyStandardSaleForFixedPrice",
  "StrategyAnyItemFromCollectionForFixedPrice",
];
