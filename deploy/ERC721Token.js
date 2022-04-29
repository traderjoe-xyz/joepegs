const { verify } = require("./utils");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const args = [];
  const { address } = await deploy("ERC721Token", {
    from: deployer,
    args,
    log: true,
    deterministicDeployment: false,
  });

  await verify(address, []);
};

module.exports.tags = ["ERC721Token"];
