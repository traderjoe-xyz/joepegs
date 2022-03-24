module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const joepegExchange = await deployments.get("JoepegExchange");

  await deploy("TransferManagerERC721", {
    from: deployer,
    args: [joepegExchange.address],
    log: true,
    deterministicDeployment: false,
  });
};

module.exports.tags = ["TransferManagerERC721"];
module.exports.dependencies = ["JoepegExchange"];
