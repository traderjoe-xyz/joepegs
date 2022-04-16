const { run } = require("hardhat");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // TODO: Update to finalized value
  const defaultProtocolFeeAmount = 1000; // 1000 -> 10%

  const args = [defaultProtocolFeeAmount];
  const { address } = await deploy("ProtocolFeeManager", {
    from: deployer,
    args,
    log: true,
    deterministicDeployment: false,
  });

  await run("verify:verify", {
    address,
    constructorArguments: args,
  });
};

module.exports.tags = ["ProtocolFeeManager"];
