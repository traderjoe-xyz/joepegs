module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const royaltyFeeLimit = 1000; // 1000 = 10%

  await deploy("RoyaltyFeeRegistry", {
    from: deployer,
    args: [royaltyFeeLimit],
    log: true,
    deterministicDeployment: false,
  });
};

module.exports.tags = ["RoyaltyFeeRegistry"];
