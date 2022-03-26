module.exports = async function ({
  deployments,
  getChainId,
  getNamedAccounts,
}) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const chainId = await getChainId();

  let wavaxAddress;

  if (chainId == 4) {
    // rinkeby contract addresses
    wavaxAddress = ethers.utils.getAddress(
      "0xc778417e063141139fce010982780140aa0cd5ab"
    ); // wrapped ETH ethers.utils.getAddress
  } else if (chainId == 43114 || chainId == 31337) {
    // avalanche mainnet or hardhat network ethers.utils.getAddresses
    wavaxAddress = ethers.utils.getAddress(
      "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7"
    );
  } else {
    throw new Error("Failed to find WAVAX address");
  }

  const currencyManager = await deployments.get("CurrencyManager");
  const executionManager = await deployments.get("ExecutionManager");
  const royaltyFeeManager = await deployments.get("RoyaltyFeeManager");
  const transferSelectorNft = await deployments.get("TransferSelectorNFT");

  const joepegExchange = await deploy("JoepegExchange", {
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

  await joepegExchange.updateTransferSelectorNFT(transferSelectorNft.address);
};

module.exports.tags = ["JoepegExchange"];
module.exports.dependencies = [
  "CurrencyManager",
  "ExecutionManager",
  "RoyaltyFeeManager",
  "TransferSelectorNFT",
];
