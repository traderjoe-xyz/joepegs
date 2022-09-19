const { config, ethers, network } = require("hardhat");
const { expect } = require("chai");

describe("MockPendingOwnable", function () {
  before(async function () {
    this.pendingOwnableCF = await ethers.getContractFactory(
      "MockPendingOwnable"
    );

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

    // Should revert on address(0)
    await expect(
      this.pendingOwnable
        .connect(this.dev)
        .setPendingOwner(ethers.constants.AddressZero)
  ).to.be.revertedWith("PendingOwnable__AddressZero");

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
