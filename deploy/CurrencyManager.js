const { WAVAX } = require("@traderjoe-xyz/sdk");

module.exports = async function ({
  deployments,
  getChainId,
  getNamedAccounts,
}) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const chainId = await getChainId();

  if (!chainId in WAVAX) {
    throw new Error("Failed to find WAVAX address");
  }

  const wavaxAddress = WAVAX[chainId].address;

  const currencyManager = await deploy("CurrencyManager", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });

  await currencyManager.addCurrency(wavaxAddress);
};

module.exports.tags = ["CurrencyManager"];
