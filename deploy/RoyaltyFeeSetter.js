const { run } = require("hardhat");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const royaltyFeeRegistry = await deployments.get("RoyaltyFeeRegistry");

  const args = [royaltyFeeRegistry.address];
  const { address } = await deploy("RoyaltyFeeSetter", {
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

module.exports.tags = ["RoyaltyFeeSetter"];
module.exports.dependencies = ["RoyaltyFeeRegistry"];
