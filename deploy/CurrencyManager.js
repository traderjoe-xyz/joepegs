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

  let wNativeAddress, proxyOwner, proxyContract;

  proxyOwner = getProxyOwner(chainId);
  wNativeAddress = getWNative(chainId);

  const args = [];
  await catchUnknownSigner(async () => {
    proxyContract = await deploy("CurrencyManager", {
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

  const currencyManager = await ethers.getContract("CurrencyManager", deployer);

  if (proxyContract && proxyContract.newlyDeployed) {
    await currencyManager.addCurrency(wNativeAddress);
  }

  await verify(proxyContract.implementation, []);
};

module.exports.tags = ["CurrencyManager"];
