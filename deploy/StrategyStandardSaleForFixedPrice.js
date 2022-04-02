const { run } = require("hardhat");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const protocolFee = 100; // 100 = 1%

  const args = [protocolFee];
  const strategyStandardSaleForFixedPrice = await deploy(
    "StrategyStandardSaleForFixedPrice",
    {
      from: deployer,
      args,
      log: true,
      deterministicDeployment: false,
    }
  );

  await run("verify:verify", {
    address: strategyStandardSaleForFixedPrice.address,
    constructorArguments: args,
  });
};

module.exports.tags = ["StrategyStandardSaleForFixedPrice"];
