const { verify } = require("./utils");

module.exports = async function ({
  deployments,
  getChainId,
  getNamedAccounts,
}) {
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  const chainId = await getChainId();

  let wavaxAddress, proxyAddress, proxyOwner;

  if (chainId == 4) {
    // rinkeby contract addresses
    wavaxAddress = ethers.utils.getAddress(
      "0xc778417e063141139fce010982780140aa0cd5ab"
    ); // wrapped ETH ethers.utils.getAddress
    proxyOwner = deployer;
  } else if (chainId == 43114 || chainId == 31337) {
    // avalanche mainnet or hardhat network ethers.utils.getAddresses
    wavaxAddress = ethers.utils.getAddress(
      "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7"
    );
    // multisig
    proxyOwner = "0x2fbB61a10B96254900C03F1644E9e1d2f5E76DD2";
  } else if (chainId == 43113) {
    // fuji contract addresses
    wavaxAddress = ethers.utils.getAddress(
      "0x1D308089a2D1Ced3f1Ce36B1FcaF815b07217be3"
    );
    proxyOwner = deployer;
  } else {
    throw new Error("Failed to find WAVAX address");
  }

  const currencyManager = await deployments.get("CurrencyManager");
  const executionManager = await deployments.get("ExecutionManager");
  const protocolFeeManager = await deployments.get("ProtocolFeeManager");
  const royaltyFeeManager = await deployments.get("RoyaltyFeeManager");

  const args = [
    currencyManager.address,
    executionManager.address,
    protocolFeeManager.address,
    royaltyFeeManager.address,
    wavaxAddress,
    deployer,
  ];
  // NOTE: We need to remember to call `updateTransferSelectorNFT` after deploy.
  // We cannot simply do that in this deploy script to avoid circular dependency
  // issue with `TransferSelectorNFT`
  await catchUnknownSigner(async () => {
    proxyContract = await deploy("JoepegExchange", {
      from: deployer,
      proxy: {
        owner: proxyOwner,
        proxyContract: "OpenZeppelinTransparentProxy",
        viaAdminContract: "DefaultProxyAdmin",
        execute: {
          init: {
            methodName: "initialize",
            args: args,
          },
        },
      },
      log: true,
      deterministicDeployment: false,
    });
  });

  await verify(proxyContract.address, args);
};

module.exports.tags = ["JoepegExchange"];
module.exports.dependencies = [
  "CurrencyManager",
  "ExecutionManager",
  "ProtocolFeeManager",
  "RoyaltyFeeManager",
];
