const { config, ethers, network } = require("hardhat");
const { expect } = require("chai");

describe("MockPausableAdminUpgradeable", function () {
  before(async function () {
    this.mockPausableAdminUpgradeableCF = await ethers.getContractFactory(
      "MockPausableAdminUpgradeable"
    );

    this.signers = await ethers.getSigners();
    this.dev = this.signers[0];
    this.alice = this.signers[1];
    this.bob = this.signers[2];
    this.exploiter = this.signers[2];
  });

  beforeEach(async function () {
    this.mockPausableAdminUpgradeable =
      await this.mockPausableAdminUpgradeableCF.deploy();
    await this.mockPausableAdminUpgradeable.initialize();
  });

  it("Should not allow multiple initialization", async function () {
    await expect(
      this.mockPausableAdminUpgradeable.initialize()
    ).to.be.revertedWith("Initializable: contract is already initialized");
  });

  it("Should allow owner to pause and unpause the contract", async function () {
    await this.mockPausableAdminUpgradeable.pause();

    expect(await this.mockPausableAdminUpgradeable.paused()).to.be.equal(true);

    await expect(this.mockPausableAdminUpgradeable.pause()).to.be.revertedWith(
      "PausableAdmin__AlreadyPaused"
    );

    await this.mockPausableAdminUpgradeable.unpause();

    expect(await this.mockPausableAdminUpgradeable.paused()).to.be.equal(false);

    await expect(
      this.mockPausableAdminUpgradeable.unpause()
    ).to.be.revertedWith("PausableAdmin__AlreadyUnpaused");
  });

  it("Should revert if a non owner tries to pause or unpause the contract", async function () {
    await expect(
      this.mockPausableAdminUpgradeable.connect(this.alice).pause()
    ).to.be.revertedWith("PausableAdmin__OnlyPauseAdmin");
    await expect(
      this.mockPausableAdminUpgradeable.connect(this.alice).unpause()
    ).to.be.revertedWith("PendingOwnable__NotOwner");
  });

  it("Should allow a new admin to pause but revert to unpause the contract", async function () {
    await this.mockPausableAdminUpgradeable
      .connect(this.dev)
      .addPauseAdmin(this.alice.address);

    await this.mockPausableAdminUpgradeable.connect(this.alice).pause();

    expect(await this.mockPausableAdminUpgradeable.paused()).to.be.equal(true);

    await expect(
      this.mockPausableAdminUpgradeable.connect(this.alice).unpause()
    ).to.be.revertedWith("PendingOwnable__NotOwner");

    await this.mockPausableAdminUpgradeable.renouncePauseAdmin();

    await expect(
      this.mockPausableAdminUpgradeable.renouncePauseAdmin()
    ).to.be.revertedWith("PausableAdmin__AddressIsNotPauseAdmin");
  });

  it("Should only allow admin to add or remove admin", async function () {
    await this.mockPausableAdminUpgradeable
      .connect(this.dev)
      .addPauseAdmin(this.alice.address);

    await expect(
      this.mockPausableAdminUpgradeable
        .connect(this.bob)
        .addPauseAdmin(this.bob.address)
    ).to.be.revertedWith("PendingOwnable__NotOwner");

    await expect(
      this.mockPausableAdminUpgradeable
        .connect(this.alice)
        .addPauseAdmin(this.bob.address)
    ).to.be.revertedWith("PendingOwnable__NotOwner");

    await expect(
      this.mockPausableAdminUpgradeable
        .connect(this.bob)
        .removePauseAdmin(this.dev.address)
    ).to.be.revertedWith("PendingOwnable__NotOwner");

    await expect(
      this.mockPausableAdminUpgradeable
        .connect(this.alice)
        .removePauseAdmin(this.dev.address)
    ).to.be.revertedWith("PendingOwnable__NotOwner");
  });

  it("Should add new owner to admin and remove the privilege of the previous one", async function () {
    await this.mockPausableAdminUpgradeable
      .connect(this.dev)
      .setPendingOwner(this.alice.address);

    await expect(
      this.mockPausableAdminUpgradeable.connect(this.dev).becomeOwner()
    ).to.be.revertedWith("PendingOwnable__NotPendingOwner");

    await expect(
      this.mockPausableAdminUpgradeable.connect(this.bob).becomeOwner()
    ).to.be.revertedWith("PendingOwnable__NotPendingOwner");

    await this.mockPausableAdminUpgradeable.connect(this.alice).becomeOwner();

    expect(
      await this.mockPausableAdminUpgradeable.isPauseAdmin(this.alice.address)
    ).to.be.equal(true);

    expect(
      await this.mockPausableAdminUpgradeable.isPauseAdmin(this.dev.address)
    ).to.be.equal(false);

    await this.mockPausableAdminUpgradeable
      .connect(this.alice)
      .addPauseAdmin(this.bob.address);

    await expect(
      this.mockPausableAdminUpgradeable
        .connect(this.dev)
        .addPauseAdmin(this.dev.address)
    ).to.be.revertedWith("PendingOwnable__NotOwner");

    await expect(
      this.mockPausableAdminUpgradeable
        .connect(this.dev)
        .removePauseAdmin(this.alice.address)
    ).to.be.revertedWith("PendingOwnable__NotOwner");

    await this.mockPausableAdminUpgradeable
      .connect(this.alice)
      .removePauseAdmin(this.bob.address);
  });

  it("Should transfer ownership, add the new owner and remove the previous one in all cases", async function () {
    // new owner isn't admin, previous owner is admin (0,1)
    await transferOwnershipAndChecks(
      this.mockPausableAdminUpgradeable,
      this.alice,
      this.dev
    );

    // new owner is admin, previous owner is admin (1,1)
    await this.mockPausableAdminUpgradeable
      .connect(this.alice)
      .addPauseAdmin(this.dev.address);
    await transferOwnershipAndChecks(
      this.mockPausableAdminUpgradeable,
      this.dev,
      this.alice
    );

    // new owner is admin, previous owner isn't admin (1,0)
    await this.mockPausableAdminUpgradeable
      .connect(this.dev)
      .addPauseAdmin(this.alice.address);
    await this.mockPausableAdminUpgradeable
      .connect(this.dev)
      .renouncePauseAdmin();
    await transferOwnershipAndChecks(
      this.mockPausableAdminUpgradeable,
      this.alice,
      this.dev
    );

    // new owner is admin, previous owner is admin (0,0)
    await this.mockPausableAdminUpgradeable
      .connect(this.alice)
      .renouncePauseAdmin();
    await transferOwnershipAndChecks(
      this.mockPausableAdminUpgradeable,
      this.dev,
      this.alice
    );
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
