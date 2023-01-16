const { verify } = require("./utils");
const { getProxyOwner } = require("./getAddress");

module.exports = async function ({
  getNamedAccounts,
  deployments,
  getChainId,
}) {
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  let proxyContract, proxyOwner;

  const chainId = await getChainId();

  proxyOwner = getProxyOwner(chainId);

  const joepegExchange = await deployments.get("JoepegExchange");

  const args = [joepegExchange.address];

  await catchUnknownSigner(async () => {
    proxyContract = await deploy("TransferManagerERC721", {
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

module.exports.tags = ["TransferManagerERC721"];
module.exports.dependencies = ["JoepegExchange"];
