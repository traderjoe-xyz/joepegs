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

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
