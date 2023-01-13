task("transfer-ownerships", "Transfer ownerships of deployed contracts")
  .addParam("newOwner")
  .setAction(async ({ newOwner }, hre) => {
    const newOwnerAddress = ethers.utils.getAddress(newOwner);
    console.log(`Transferring all ownerships to ${newOwnerAddress}`);

    await transferOwnership("CurrencyManager", newOwnerAddress);
    await transferOwnership("JoepegExchange", newOwnerAddress);
    await transferOwnership("ExecutionManager", newOwnerAddress);
    await transferOwnership("ProtocolFeeManager", newOwnerAddress);
    await transferOwnership("RoyaltyFeeManager", newOwnerAddress);
    await transferOwnership("RoyaltyFeeRegistry", newOwnerAddress);
    await transferOwnership("RoyaltyFeeSetter", newOwnerAddress);
    await transferOwnership("TransferSelectorNFT", newOwnerAddress);
    await transferOwnership("ERC721Token", newOwnerAddress);
    await transferOwnership("ERC1155Token", newOwnerAddress);
    await transferOwnership("BatchTransferNFT", newOwnerAddress);
    await transferOwnership("RoyaltyFeeRegistryV2", newOwnerAddress);
    await transferOwnership("RoyaltyFeeSetterV2", newOwnerAddress);
    await transferOwnership("JoepegAuctionHouse", newOwnerAddress);
  });

const transferOwnership = async (contractName, newOwner) => {
  const contractAddress = (await hre.deployments.get(contractName)).address;
  const contractInstance = await ethers.getContractAt(
    contractName,
    contractAddress
  );
  let contract = {
    address: contractAddress,
    contract: contractInstance,
    name: contractName,
    newOwner: newOwner,
  };
  if ((await contract.contract.owner()) == newOwner) {
    console.log(
      `${newOwner} is already owner of ${contract.name} (${contract.address})`
    );
    return;
  }
  if ("transferOwnership" in contract.contract.functions) {
    await oneStepOwnershipTransfer(contract);
  } else if ("setPendingOwner" in contract.contract.functions) {
    await twoStepOwnershipTransfer(contract);
  } else {
    console.log(
      `WARNING Contract ${contractName} doesn't have transferOwnership or setPendingOwner function`
    );
  }
};

const oneStepOwnershipTransfer = async (contract) => {
  const tx = await contract.contract.transferOwnership(contract.newOwner);
  await tx.wait();
  if ((await contract.contract.owner()) == contract.newOwner) {
    console.log(
      `Ownership of ${contract.name} (${contract.address}) was transferred`
    );
  } else {
    console.log(
      `WARNING ${contract.name} (${contract.address}) owner didn't change`
    );
  }
};

const twoStepOwnershipTransfer = async (contract) => {
  const pendingOwner = await contract.contract.pendingOwner();

  if (pendingOwner != ethers.constants.AddressZero) {
    console.log(
      `WARNING - Contract ${contract.name} (${contract.address}) has pending owner = ${pendingOwner}`
    );
    return;
  }
  const tx = await contract.contract.setPendingOwner(contract.newOwner);
  await tx.wait();
  console.log(
    `WARNING use becomeOwner function on contract ${contract.name} (${contract.address}) with newOwner address`
  );
};
