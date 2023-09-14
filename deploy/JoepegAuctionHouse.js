const { ethers } = require("hardhat");
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

  let wNativeAddress, proxyOwner;

  proxyOwner = getProxyOwner(chainId);
  wNativeAddress = getWNative(chainId);

  const currencyManager = await deployments.get("CurrencyManager");
  const protocolFeeManager = await deployments.get("ProtocolFeeManager");
  const royaltyFeeManager = await deployments.get("RoyaltyFeeManager");

  const constructorArgs = [wNativeAddress];
  const initArgs = [
    500, // englishAuctionMinBidIncrementPct, 500 = 5%
    300, // englishAuctionRefreshTime, 300 = 5 minutes
    currencyManager.address,
    protocolFeeManager.address,
    royaltyFeeManager.address,
    proxyOwner,
  ];
  await catchUnknownSigner(async () => {
    proxyContract = await deploy("JoepegAuctionHouse", {
      from: deployer,
      args: constructorArgs,
      proxy: {
        owner: proxyOwner,
        proxyContract: "OpenZeppelinTransparentProxy",
        viaAdminContract: "DefaultProxyAdmin",
        execute: {
          init: {
            methodName: "initialize",
            args: initArgs,
          },
        },
      },
      log: true,
      deterministicDeployment: false,
    });
  });

  if (proxyContract && proxyContract.newlyDeployed) {
    // Initialize implementation contract
    const implementationContract = await ethers.getContractAt(
      "JoepegAuctionHouse",
      proxyContract.implementation
    );
    await implementationContract.initialize(...initArgs);
  }

  await verify(proxyContract.implementation, constructorArgs);
};

module.exports.tags = ["JoepegAuctionHouse"];
module.exports.dependencies = [
  "CurrencyManager",
  "ProtocolFeeManager",
  "RoyaltyFeeManager",
];
