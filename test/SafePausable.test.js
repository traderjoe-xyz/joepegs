const { config, ethers, network } = require("hardhat");
const { expect } = require("chai");

let PAUSER_ROLE, UNPAUSER_ROLE, PAUSER_ADMIN_ROLE, UNPAUSER_ADMIN_ROLE;
describe("SafePausable", function () {
  before(async function () {
    this.safePausableCF = await ethers.getContractFactory("MockSafePausable");

    this.signers = await ethers.getSigners();
    this.dev = this.signers[0];
    this.alice = this.signers[1];
    this.bob = this.signers[2];
    this.exploiter = this.signers[2];
  });

  beforeEach(async function () {
    this.safePausable = await this.safePausableCF.deploy();

    PAUSER_ROLE = await this.safePausable.PAUSER_ROLE();
    UNPAUSER_ROLE = await this.safePausable.UNPAUSER_ROLE();

    PAUSER_ADMIN_ROLE = await this.safePausable.PAUSER_ADMIN_ROLE();
    UNPAUSER_ADMIN_ROLE = await this.safePausable.UNPAUSER_ADMIN_ROLE();
  });

  it("Should allow owner to pause and unpause", async function () {
    await this.safePausable.pause();
    await expect(this.safePausable.pause()).to.be.revertedWith(
      "SafePausable__AlreadyPaused"
    );

    await expect(this.safePausable.pausableFunction()).to.be.revertedWith(
      "Pausable: paused"
    );
    await this.safePausable.doSomething();

    await this.safePausable.unpause();
    await expect(this.safePausable.unpause()).to.be.revertedWith(
      "SafePausable__AlreadyUnpaused"
    );

    await this.safePausable.pausableFunction();
    await this.safePausable.doSomething();
  });

  it("Should allow PAUSE_ROLE to pause", async function () {
    await this.safePausable.grantRole(PAUSER_ROLE, this.alice.address);

    await expect(
      this.safePausable.connect(this.bob).pause()
    ).to.be.revertedWith(
      "SafeAccessControlEnumerable__SenderMissingRoleAndIsNotOwner"
    );
    await this.safePausable.connect(this.alice).pause();

    await expect(this.safePausable.pausableFunction()).to.be.revertedWith(
      "Pausable: paused"
    );
  });

  it("Should allow UNPAUSE_ROLE to unpause", async function () {
    await this.safePausable.grantRole(UNPAUSER_ROLE, this.alice.address);
    await this.safePausable.pause();

    await expect(
      this.safePausable.connect(this.bob).unpause()
    ).to.be.revertedWith(
      "SafeAccessControlEnumerable__SenderMissingRoleAndIsNotOwner"
    );
    await this.safePausable.connect(this.alice).unpause();

    await this.safePausable.pausableFunction();
  });

  it("Should allow PAUSER_ADMIN_ROLE to only grant PAUSER_ROLE", async function () {
    await this.safePausable.grantRole(PAUSER_ADMIN_ROLE, this.alice.address);

    await this.safePausable
      .connect(this.alice)
      .grantRole(PAUSER_ROLE, this.bob.address);

    await expect(
      this.safePausable
        .connect(this.alice)
        .grantRole(UNPAUSER_ROLE, this.bob.address)
    ).to.be.revertedWith(
      "SafeAccessControlEnumerable__SenderMissingRoleAndIsNotOwner"
    );
    await expect(
      this.safePausable
        .connect(this.alice)
        .grantRole(PAUSER_ADMIN_ROLE, this.bob.address)
    ).to.be.revertedWith(
      "SafeAccessControlEnumerable__SenderMissingRoleAndIsNotOwner"
    );
    await expect(
      this.safePausable
        .connect(this.alice)
        .grantRole(UNPAUSER_ADMIN_ROLE, this.bob.address)
    ).to.be.revertedWith(
      "SafeAccessControlEnumerable__SenderMissingRoleAndIsNotOwner"
    );
  });

  it("Should allow UNPAUSER_ADMIN_ROLE to only grant UNPAUSER_ROLE", async function () {
    await this.safePausable.grantRole(UNPAUSER_ADMIN_ROLE, this.alice.address);

    await this.safePausable
      .connect(this.alice)
      .grantRole(UNPAUSER_ROLE, this.bob.address);

    await expect(
      this.safePausable
        .connect(this.alice)
        .grantRole(PAUSER_ROLE, this.bob.address)
    ).to.be.revertedWith(
      "SafeAccessControlEnumerable__SenderMissingRoleAndIsNotOwner"
    );
    await expect(
      this.safePausable
        .connect(this.alice)
        .grantRole(PAUSER_ADMIN_ROLE, this.bob.address)
    ).to.be.revertedWith(
      "SafeAccessControlEnumerable__SenderMissingRoleAndIsNotOwner"
    );
    await expect(
      this.safePausable
        .connect(this.alice)
        .grantRole(UNPAUSER_ADMIN_ROLE, this.bob.address)
    ).to.be.revertedWith(
      "SafeAccessControlEnumerable__SenderMissingRoleAndIsNotOwner"
    );
  });

  it("Should revert if PAUSER_ADMIN_ROLE tries to pause/unpause", async function () {
    await this.safePausable.grantRole(PAUSER_ADMIN_ROLE, this.alice.address);

    await expect(
      this.safePausable.connect(this.alice).pause()
    ).to.be.revertedWith(
      "SafeAccessControlEnumerable__SenderMissingRoleAndIsNotOwner"
    );
    await expect(
      this.safePausable.connect(this.alice).unpause()
    ).to.be.revertedWith(
      "SafeAccessControlEnumerable__SenderMissingRoleAndIsNotOwner"
    );
  });

  it("Should revert if UNPAUSER_ADMIN_ROLE tries to pause/unpause", async function () {
    await this.safePausable.grantRole(UNPAUSER_ADMIN_ROLE, this.alice.address);

    await expect(
      this.safePausable.connect(this.alice).pause()
    ).to.be.revertedWith(
      "SafeAccessControlEnumerable__SenderMissingRoleAndIsNotOwner"
    );
    await expect(
      this.safePausable.connect(this.alice).unpause()
    ).to.be.revertedWith(
      "SafeAccessControlEnumerable__SenderMissingRoleAndIsNotOwner"
    );
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
