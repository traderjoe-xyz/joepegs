module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const transferManagerERC721 = await deployments.get("TransferManagerERC721");
  const transferManagerERC1155 = await deployments.get(
    "TransferManagerERC1155"
  );

  await deploy("TransferSelectorNFT", {
    from: deployer,
    args: [transferManagerERC721.address, transferManagerERC1155.address],
    log: true,
    deterministicDeployment: false,
  });
};

module.exports.tags = ["TransferSelectorNFT"];
module.exports.dependencies = [
  "TransferManagerERC721",
  "TransferManagerERC1155",
];
