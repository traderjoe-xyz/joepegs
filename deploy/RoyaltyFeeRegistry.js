const { verify } = require("./utils");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const royaltyFeeLimit = 1000; // 1000 = 10%

  const args = [royaltyFeeLimit];
  const { address } = await deploy("RoyaltyFeeRegistry", {
    from: deployer,
    args,
    log: true,
    deterministicDeployment: false,
  });

  await verify(address, args);
};

module.exports.tags = ["RoyaltyFeeRegistry"];
