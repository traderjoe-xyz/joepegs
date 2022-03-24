module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const royaltyFeeRegistry = await deployments.get("RoyaltyFeeRegistry");

  await deploy("RoyaltyFeeManager", {
    from: deployer,
    args: [royaltyFeeRegistry.address],
    log: true,
    deterministicDeployment: false,
  });
};

module.exports.tags = ["RoyaltyFeeManager"];
module.exports.dependencies = ["RoyaltyFeeRegistry"];
