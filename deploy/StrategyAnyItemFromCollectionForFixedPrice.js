const { run } = require("hardhat");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const protocolFee = 100; // 100 = 1%

  const args = [protocolFee];
  const strategyAnyItemFromCollectionForFixedPrice = await deploy(
    "StrategyAnyItemFromCollectionForFixedPrice",
    {
      from: deployer,
      args: [protocolFee],
      log: true,
      deterministicDeployment: false,
    }
  );

  await run("verify:verify", {
    address: strategyAnyItemFromCollectionForFixedPrice.address,
    constructorArguments: args,
  });
};

module.exports.tags = ["StrategyAnyItemFromCollectionForFixedPrice"];
