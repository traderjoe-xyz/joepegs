const { config, ethers, network, upgrades } = require("hardhat");
const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { advanceTimeAndBlock, duration } = require("./utils/time");
const { start } = require("repl");

const WAVAX = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";

describe.only("DutchAuction", function () {
  before(async function () {
    this.DutchAuctionCF = await ethers.getContractFactory("DutchAuction");
    this.ERC721TokenCF = await ethers.getContractFactory("ERC721Token");

    this.signers = await ethers.getSigners();
    this.dev = this.signers[0];
    this.royaltyFeeRecipient = this.signers[1].address;
    this.alice = this.signers[2];
    this.bob = this.signers[3];
    this.carol = this.signers[4];

    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: config.networks.avalanche.url,
          },
          live: false,
          saveDeployments: true,
          tags: ["test", "local"],
        },
      ],
    });
  });

  beforeEach(async function () {
    this.wavax = await ethers.getContractAt("IWAVAX", WAVAX);
    this.erc721Token = await this.ERC721TokenCF.deploy();

    this.startPrice = ethers.utils.parseUnits("100", 18);
    this.discountAmount = ethers.utils.parseUnits("0.005", 18);
    this.discountPace = 20 * 60;
    this.nftIds = [0, 1, 2, 3, 4, 5];
    this.whitelistedAddresses = [this.alice.address];
    this.dutchAuction = await this.DutchAuctionCF.deploy(
      this.startPrice,
      this.discountAmount,
      this.discountPace,
      this.erc721Token.address,
      this.nftIds,
      this.whitelistedAddresses
    );

    await Promise.all(
      this.nftIds.map(() => this.erc721Token.mint(this.dev.address))
    );
    await this.erc721Token.setApprovalForAll(this.dutchAuction.address, true);
  });

  it("NFT price decreases at correct pace", async function () {
    var discount = await this.dutchAuction.getDiscount();
    expect(discount).to.be.equal(0);
    var price = await this.dutchAuction.getPrice();
    expect(price).to.be.equal(this.startPrice);

    // 110 minutes later
    await advanceTimeAndBlock(1200 * 5.5);

    discount = await this.dutchAuction.getDiscount();
    expect(discount).to.be.equal(this.discountAmount.mul(5));
    price = await this.dutchAuction.getPrice();
    expect(price).to.be.equal(this.startPrice.sub(discount));

    // 3 days later
    const threeDays = 24 * 60 * 60 * 3;
    await advanceTimeAndBlock(threeDays);

    discount = await this.dutchAuction.getDiscount();
    expect(discount).to.be.equal(
      this.discountAmount.mul(threeDays / this.discountPace + 5)
    );
    price = await this.dutchAuction.getPrice();
    expect(price).to.be.equal(this.startPrice.sub(discount));
  });

  it("Auction expires after 7 days", async function () {
    await advanceTimeAndBlock(24 * 60 * 60 * 7 + 1);
    await expect(this.dutchAuction.buy(1)).to.be.revertedWith(
      "auction expired"
    );
  });

  it("NFT are transfered to sender when he is on the whitelist and have enough AVAX", async function () {
    const buySize = 5;
    const totalPrice = this.startPrice.mul(buySize);
    await this.dev.sendTransaction({
      to: this.alice.address,
      value: totalPrice,
    });

    expect(await this.erc721Token.balanceOf(this.alice.address)).to.equal(0);
    await this.dutchAuction
      .connect(this.alice)
      .buy(buySize, { value: totalPrice });
    expect(await this.erc721Token.balanceOf(this.alice.address)).to.equal(
      buySize
    );
  });

  it("Buy transaction reverts when the caller is not on whitelist", async function () {
    await expect(this.dutchAuction.connect(this.bob).buy(2)).to.be.revertedWith(
      "msg sender not on whitelist"
    );
  });

  it("Buy transaction reverts when the caller didn't send enough AVAX", async function () {
    await expect(
      this.dutchAuction.connect(this.alice).buy(1)
    ).to.be.revertedWith("AVAX < total amount");
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
