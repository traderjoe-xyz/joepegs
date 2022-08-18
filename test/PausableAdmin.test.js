const { config, ethers, network } = require("hardhat");
const { expect } = require("chai");

describe("BatchTransferNFT", function () {
  before(async function () {
    this.pausableAdminCF = await ethers.getContractFactory("PausableAdmin");

    this.signers = await ethers.getSigners();
    this.dev = this.signers[0];
    this.alice = this.signers[1];
    this.bob = this.signers[2];
    this.exploiter = this.signers[2];
  });

  beforeEach(async function () {
    this.pausableAdmin = await this.pausableAdminCF.deploy();
  });

  it("Should allow owner to pause and unpause the contract", async function () {
    await this.pausableAdmin.pause();

    expect(await this.pausableAdmin.paused()).to.be.equal(true);

    await expect(this.pausableAdmin.pause()).to.be.revertedWith(
      "PausableAdmin__AlreadyPaused"
    );

    await this.pausableAdmin.unpause();

    expect(await this.pausableAdmin.paused()).to.be.equal(false);

    await expect(this.pausableAdmin.unpause()).to.be.revertedWith(
      "PausableAdmin__AlreadyUnpaused"
    );
  });

  it("Should revert if a non owner tries to pause or unpause the contract", async function () {
    await expect(
      this.pausableAdmin.connect(this.alice).pause()
    ).to.be.revertedWith("PausableAdmin__OnlyPauseAdmin");
    await expect(
      this.pausableAdmin.connect(this.alice).unpause()
    ).to.be.revertedWith("PendingOwnable__NotOwner");
  });

  it("Should allow a new admin to pause but revert to unpause the contract", async function () {
    await this.pausableAdmin
      .connect(this.dev)
      .addPauseAdmin(this.alice.address);

    await this.pausableAdmin.connect(this.alice).pause();

    expect(await this.pausableAdmin.paused()).to.be.equal(true);

    await expect(
      this.pausableAdmin.connect(this.alice).unpause()
    ).to.be.revertedWith("PendingOwnable__NotOwner");

    await this.pausableAdmin.renouncePauseAdmin();

    await expect(this.pausableAdmin.renouncePauseAdmin()).to.be.revertedWith(
      "PausableAdmin__AddressIsNotPauseAdmin"
    );
  });

  it("Should only allow admin to add or remove admin", async function () {
    this.pausableAdmin.connect(this.dev).addPauseAdmin(this.alice.address);

    await expect(
      this.pausableAdmin.connect(this.bob).addPauseAdmin(this.bob.address)
    ).to.be.revertedWith("PendingOwnable__NotOwner");

    await expect(
      this.pausableAdmin.connect(this.alice).addPauseAdmin(this.bob.address)
    ).to.be.revertedWith("PendingOwnable__NotOwner");

    await expect(
      this.pausableAdmin.connect(this.bob).removePauseAdmin(this.dev.address)
    ).to.be.revertedWith("PendingOwnable__NotOwner");

    await expect(
      this.pausableAdmin.connect(this.alice).removePauseAdmin(this.dev.address)
    ).to.be.revertedWith("PendingOwnable__NotOwner");
  });

  it("Should add new owner to admin and remove the privilege of the previous one", async function () {
    this.pausableAdmin.connect(this.dev).setPendingOwner(this.alice.address);

    await expect(
      this.pausableAdmin.connect(this.dev).becomeOwner()
    ).to.be.revertedWith("PendingOwnable__NotPendingOwner");

    await expect(
      this.pausableAdmin.connect(this.bob).becomeOwner()
    ).to.be.revertedWith("PendingOwnable__NotPendingOwner");

    await this.pausableAdmin.connect(this.alice).becomeOwner();

    expect(
      await this.pausableAdmin.isPauseAdmin(this.alice.address)
    ).to.be.equal(true);

    expect(await this.pausableAdmin.isPauseAdmin(this.dev.address)).to.be.equal(
      false
    );

    await this.pausableAdmin
      .connect(this.alice)
      .addPauseAdmin(this.bob.address);

    await expect(
      this.pausableAdmin.connect(this.dev).addPauseAdmin(this.dev.address)
    ).to.be.revertedWith("PendingOwnable__NotOwner");

    await expect(
      this.pausableAdmin.connect(this.dev).removePauseAdmin(this.alice.address)
    ).to.be.revertedWith("PendingOwnable__NotOwner");

    await this.pausableAdmin
      .connect(this.alice)
      .removePauseAdmin(this.bob.address);
  });

  it("Should transfer ownership, add the new owner and remove the previous one in all cases", async function () {
    // new owner isn't admin, previous owner is admin (0,1)
    await transferOwnershipAndChecks(this.pausableAdmin, this.alice, this.dev);

    // new owner is admin, previous owner is admin (1,1)
    await this.pausableAdmin
      .connect(this.alice)
      .addPauseAdmin(this.dev.address);
    await transferOwnershipAndChecks(this.pausableAdmin, this.dev, this.alice);

    // new owner is admin, previous owner isn't admin (1,0)
    await this.pausableAdmin
      .connect(this.dev)
      .addPauseAdmin(this.alice.address);
    await this.pausableAdmin.connect(this.dev).renouncePauseAdmin();
    await transferOwnershipAndChecks(this.pausableAdmin, this.alice, this.dev);

    // new owner is admin, previous owner is admin (0,0)
    await this.pausableAdmin.connect(this.alice).renouncePauseAdmin();
    await transferOwnershipAndChecks(this.pausableAdmin, this.dev, this.alice);
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});

const transferOwnershipAndChecks = async (
  contract,
  newOwner,
  previousOwner
) => {
  await contract.connect(previousOwner).setPendingOwner(newOwner.address);
  await contract.connect(newOwner).becomeOwner();

  expect(await contract.isPauseAdmin(newOwner.address)).to.be.equal(true);

  expect(await contract.isPauseAdmin(previousOwner.address)).to.be.equal(false);
};
