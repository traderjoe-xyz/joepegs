const { WAVAX } = require("@traderjoe-xyz/sdk");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const chainId = await getChainId();

  if (!chainId in WAVAX) {
    throw new Error("Failed to find WAVAX address");
  }

  const wavaxAddress = WAVAX[chainId].address;

  const currencyManager = await deployments.get("CurrencyManager");
  const executionManager = await deployments.get("ExecutionManager");
  const royaltyFeeManager = await deployments.get("RoyaltyFeeManager");

  await deploy("JoepegExchange", {
    from: deployer,
    args: [
      currencyManager.address,
      executionManager.address,
      royaltyFeeManager.address,
      wavaxAddress,
      deployer,
    ],
    log: true,
    deterministicDeployment: false,
  });
};

module.exports.tags = ["JoepegExchange"];
module.exports.dependencies = [
  "CurrencyManager",
  "ExecutionManager",
  "RoyaltyFeeManager",
];
