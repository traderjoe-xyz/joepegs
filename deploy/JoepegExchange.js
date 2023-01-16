const { verify } = require("./utils");
const { getWNative, getProxyOwner } = require("./getAddress");

module.exports = async function ({
  deployments,
  getChainId,
  getNamedAccounts,
}) {
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  const chainId = await getChainId();

  let wNativeAddress, proxyAddress, proxyOwner;

  proxyOwner = getProxyOwner(chainId);
  wNativeAddress = getWNative(chainId);

  const currencyManager = await deployments.get("CurrencyManager");
  const executionManager = await deployments.get("ExecutionManager");
  const protocolFeeManager = await deployments.get("ProtocolFeeManager");
  const royaltyFeeManager = await deployments.get("RoyaltyFeeManager");

  const args = [
    currencyManager.address,
    executionManager.address,
    protocolFeeManager.address,
    royaltyFeeManager.address,
    wNativeAddress,
    proxyOwner,
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

  await verify(proxyContract.implementation, []);
};

module.exports.tags = ["JoepegExchange"];
module.exports.dependencies = [
  "CurrencyManager",
  "ExecutionManager",
  "ProtocolFeeManager",
  "RoyaltyFeeManager",
];
