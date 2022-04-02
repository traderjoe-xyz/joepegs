const { run } = require("hardhat");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const royaltyFeeRegistry = await deployments.get("RoyaltyFeeRegistry");

  const args = [royaltyFeeRegistry.address];
  const royaltyFeeManager = await deploy("RoyaltyFeeManager", {
    from: deployer,
    args,
    log: true,
    deterministicDeployment: false,
  });

  await run("verify:verify", {
    address: royaltyFeeManager.address,
    constructorArguments: args,
  });
};

module.exports.tags = ["RoyaltyFeeManager"];
module.exports.dependencies = ["RoyaltyFeeRegistry"];
