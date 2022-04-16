const { run } = require("hardhat");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const args = [];
  const { address } = await deploy("StrategyPrivateSale", {
    from: deployer,
    args,
    log: true,
    deterministicDeployment: false,
  });

  await run("verify:verify", {
    address,
    constructorArguments: args,
  });
};

module.exports.tags = ["StrategyPrivateSale"];
