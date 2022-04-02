const { run } = require("hardhat");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const strategyStandardSaleForFixedPrice = await deployments.get(
    "StrategyStandardSaleForFixedPrice"
  );
  const strategyAnyItemFromCollectionForFixedPrice = await deployments.get(
    "StrategyAnyItemFromCollectionForFixedPrice"
  );

  const args = [];
  const { address } = await deploy("ExecutionManager", {
    from: deployer,
    args,
    log: true,
    deterministicDeployment: false,
  });

  const executionManager = await ethers.getContract(
    "ExecutionManager",
    deployer
  );

  await executionManager.addStrategy(strategyStandardSaleForFixedPrice.address);
  await executionManager.addStrategy(
    strategyAnyItemFromCollectionForFixedPrice.address
  );

  await run("verify:verify", {
    address,
    constructorArguments: args,
  });
};

module.exports.tags = ["ExecutionManager"];
module.exports.dependencies = [
  "StrategyStandardSaleForFixedPrice",
  "StrategyAnyItemFromCollectionForFixedPrice",
];
