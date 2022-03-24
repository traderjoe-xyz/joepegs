module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const protocolFee = 100; // 100 = 1%

  await deploy("StrategyAnyItemFromCollectionForFixedPrice", {
    from: deployer,
    args: [protocolFee],
    log: true,
    deterministicDeployment: false,
  });
};

module.exports.tags = ["StrategyAnyItemFromCollectionForFixedPrice"];
