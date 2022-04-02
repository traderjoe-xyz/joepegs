const { run } = require("hardhat");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const royaltyFeeLimit = 1000; // 1000 = 10%

  const args = [royaltyFeeLimit];
  const royaltyFeeRegistry = await deploy("RoyaltyFeeRegistry", {
    from: deployer,
    args,
    log: true,
    deterministicDeployment: false,
  });

  await run("verify:verify", {
    address: royaltyFeeRegistry.address,
    constructorArguments: args,
  });
};

module.exports.tags = ["RoyaltyFeeRegistry"];
