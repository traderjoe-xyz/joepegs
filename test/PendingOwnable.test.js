const { config, ethers, network } = require("hardhat");
const { expect } = require("chai");

describe("BatchTransferNFT", function () {
  before(async function () {
    this.pendingOwnableCF = await ethers.getContractFactory("PendingOwnable");

    this.signers = await ethers.getSigners();
    this.dev = this.signers[0];
    this.alice = this.signers[1];
    this.bob = this.signers[2];
    this.exploiter = this.signers[2];
  });

  beforeEach(async function () {
    this.pendingOwnable = await this.pendingOwnableCF.deploy();
  });

  it("Should revert if a non owner tries to use owner function", async function () {
    await expect(
      this.pendingOwnable
        .connect(this.alice)
        .setPendingOwner(this.alice.address)
    ).to.be.revertedWith("PendingOwnable__NotOwner");

    await expect(
      this.pendingOwnable.connect(this.alice).revokePendingOwner()
    ).to.be.revertedWith("PendingOwnable__NotOwner");

    await expect(
      this.pendingOwnable.connect(this.alice).becomeOwner()
    ).to.be.revertedWith("PendingOwnable__NotPendingOwner");

    await expect(
      this.pendingOwnable.connect(this.alice).renounceOwnership()
    ).to.be.revertedWith("PendingOwnable__NotOwner");
  });

  it("Should allow owner to call ownable function", async function () {
    await expect(
      this.pendingOwnable.connect(this.dev).revokePendingOwner()
    ).to.be.revertedWith("PendingOwnable__NoPendingOwner");

    await this.pendingOwnable
      .connect(this.dev)
      .setPendingOwner(this.alice.address);

    await expect(
      this.pendingOwnable.connect(this.dev).setPendingOwner(this.alice.address)
    ).to.be.revertedWith("PendingOwnable__PendingOwnerAlreadySet");

    await this.pendingOwnable.connect(this.dev).revokePendingOwner();

    await expect(
      this.pendingOwnable.connect(this.dev).revokePendingOwner()
    ).to.be.revertedWith("PendingOwnable__NoPendingOwner");
  });

  it("Should allow the pendingOwner to become the owner and revert on the previous owner", async function () {
    await this.pendingOwnable
      .connect(this.dev)
      .setPendingOwner(this.alice.address);

    await this.pendingOwnable.connect(this.alice).becomeOwner();

    await expect(
      this.pendingOwnable.connect(this.dev).setPendingOwner(this.alice.address)
    ).to.be.revertedWith("PendingOwnable__NotOwner");

    await expect(
      this.pendingOwnable.connect(this.alice).becomeOwner()
    ).to.be.revertedWith("PendingOwnable__NotPendingOwner");
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
