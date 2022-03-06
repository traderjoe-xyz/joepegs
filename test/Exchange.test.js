const { ethers, network, upgrades } = require("hardhat");
const { expect } = require("chai");
const { advanceTimeAndBlock, duration } = require("./utils/time");

describe("Exchange", function () {
  before(async function () {
    this.ERC721TokenCF = await ethers.getContractFactory("ERC721Token");
    this.CurrencyManagerCF = await ethers.getContractFactory("CurrencyManager");
    this.ExecutionManagerCF = await ethers.getContractFactory(
      "ExecutionManager"
    );
    this.OrderBookCF = await ethers.getContractFactory("OrderBook");
    this.RoyaltyFeeRegistryCF = await ethers.getContractFactory(
      "RoyaltyFeeRegistry"
    );
    this.RoyaltyFeeSetterCF = await ethers.getContractFactory(
      "RoyaltyFeeSetter"
    );
    this.RoyaltyFeeManagerCF = await ethers.getContractFactory(
      "RoyaltyFeeManager"
    );
    this.StrategyStandardSaleForFixedPriceCF = await ethers.getContractFactory(
      "StrategyStandardSaleForFixedPrice"
    );
    this.ExchangeCF = await ethers.getContractFactory("LooksRareExchange");
    this.TransferManagerERC721CF = await ethers.getContractFactory(
      "TransferManagerERC721"
    );
    this.TransferManagerERC1155CF = await ethers.getContractFactory(
      "TransferManagerERC1155"
    );
    this.TransferSelectorNFTCF = await ethers.getContractFactory(
      "TransferSelectorNFT"
    );

    this.signers = await ethers.getSigners();
    this.dev = this.signers[0];
    this.alice = this.signers[1];
    this.bob = this.signers[2];
    this.carol = this.signers[3];
  });

  beforeEach(async function () {
    this.erc721Token = await this.ERC721TokenCF.deploy();
    this.currencyManager = await this.CurrencyManagerCF.deploy();
    this.executionManager = await this.ExecutionManagerCF.deploy();
    this.orderBook = await this.OrderBookCF.deploy();
    this.royaltyFeeLimit = 1000; // 1000 = 10%
    this.royaltyFeeRegistry = await this.RoyaltyFeeRegistryCF.deploy(
      this.royaltyFeeLimit
    );
    this.royaltyFeeSetter = await this.RoyaltyFeeSetterCF.deploy(
      this.royaltyFeeRegistry.address
    );
    this.royaltyFeeManager = await this.RoyaltyFeeManagerCF.deploy(
      this.royaltyFeeRegistry.address
    );
    this.protocolFee = 100; // 100 = 1%
    this.strategyStandardSaleForFixedPrice =
      await this.StrategyStandardSaleForFixedPriceCF.deploy(this.protocolFee);
    this.WAVAX = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";
    this.exchange = await this.ExchangeCF.deploy(
      this.currencyManager.address,
      this.executionManager.address,
      this.royaltyFeeManager.address,
      this.WAVAX,
      this.dev.address, // protocolFeeRecipient
      this.orderBook.address
    );
    this.transferManagerERC721 = await this.TransferManagerERC721CF.deploy(
      this.exchange.address
    );
    this.transferManagerERC1155 = await this.TransferManagerERC1155CF.deploy(
      this.exchange.address
    );
    this.transferSelectorNFT = await this.TransferSelectorNFTCF.deploy(
      this.transferManagerERC721.address,
      this.transferManagerERC1155.address
    );

    const startTime = Date.now();
    const makerOrder = {
      isOrderAsk: true,
      signer: this.alice.address,
      collection: this.erc721Token.address,
      price: 1e18,
      tokenId: 1,
      amount: 1,
      strategy: this.strategyStandardSaleForFixedPrice.address,
      currency: this.WAVAX,
      nonce: 1,
      startTime,
      endTime: startTime + 100000,
      minPercentageToAsk: 9000,
      params: "",
    };
  });

  describe("test", function () {
    it("test", async function () {});
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
