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

  const transferManagerERC721 = await deployments.get("TransferManagerERC721");
  const transferManagerERC1155 = await deployments.get(
    "TransferManagerERC1155"
  );

  const args = [transferManagerERC721.address, transferManagerERC1155.address];
  await catchUnknownSigner(async () => {
    proxyContract = await deploy("TransferSelectorNFT", {
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

module.exports.tags = ["TransferSelectorNFT"];
module.exports.dependencies = [
  "TransferManagerERC721",
  "TransferManagerERC1155",
];
