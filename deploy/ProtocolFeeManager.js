const { verify } = require("./utils");
const { getProxyOwner } = require("./getAddress");

module.exports = async function ({
  getNamedAccounts,
  deployments,
  getChainId,
}) {
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  const chainId = await getChainId();

  let proxyContract, proxyOwner;

  proxyOwner = getProxyOwner(chainId);

  const defaultProtocolFeeAmount = 250; // 250 -> 2.5%

  const args = [defaultProtocolFeeAmount];
  await catchUnknownSigner(async () => {
    proxyContract = await deploy("ProtocolFeeManager", {
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

module.exports.tags = ["ProtocolFeeManager"];
