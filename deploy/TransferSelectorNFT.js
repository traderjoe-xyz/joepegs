const { verify } = require("./utils");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  let proxyContract;

  const transferManagerERC721 = await deployments.get("TransferManagerERC721");
  const transferManagerERC1155 = await deployments.get(
    "TransferManagerERC1155"
  );

  const args = [transferManagerERC721.address, transferManagerERC1155.address];
  await catchUnknownSigner(async () => {
    proxyAddress = await deploy("TransferSelectorNFT", {
      from: deployer,
      proxy: {
        owner: deployer,
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

module.exports.tags = ["TransferSelectorNFT"];
module.exports.dependencies = [
  "TransferManagerERC721",
  "TransferManagerERC1155",
];
