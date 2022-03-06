const { ethers, network, upgrades } = require("hardhat");
const { expect } = require("chai");
const { advanceTimeAndBlock, duration } = require("./utils/time");
const { signTypedData } = require("@metamask/eth-sig-util");

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

    // Following https://medium.com/metamask/eip712-is-coming-what-to-expect-and-how-to-use-it-bb92fd1a7a26
    // const domain = [
    //   { name: "name", type: "string" },
    //   { name: "version", type: "string" },
    //   { name: "chainId", type: "uint256" },
    //   { name: "verifyingContract", type: "address" },
    // ];
    // Following https://dev.to/zemse/ethersjs-signing-eip712-typed-structs-2ph8
    const makerOrderType = [
      { name: "isOrderAsk", type: "bool" },
      { name: "signer", type: "address" },
      { name: "collection", type: "address" },
      { name: "price", type: "uint256" },
      { name: "tokenId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "strategy", type: "address" },
      { name: "currency", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "minPercentageToAsk", type: "uint256" },
      { name: "params", type: "bytes" },
    ];
    const types = {
      MakerOrder: makerOrderType,
    };
    // const makerOrder = [
    //   { name: "isOrderAsk", type: "bool", value: true },
    //   { name: "signer", type: "address", value: this.alice.address },
    //   { name: "collection", type: "address", value: this.erc721Token.address },
    //   { name: "price", type: "uint256", value: 1e18 },
    //   { name: "tokenId", type: "uint256", value: 1 },
    //   { name: "amount", type: "uint256", value: 1 },
    //   {
    //     name: "strategy",
    //     type: "address",
    //     value: this.strategyStandardSaleForFixedPrice.address,
    //   },
    //   { name: "currency", type: "address", value: this.WAVAX },
    //   { name: "nonce", type: "uint256", value: 1 },
    //   { name: "startTime", type: "uint256", value: startTime },
    //   { name: "endTime", type: "uint256", value: startTime + 100000 },
    //   { name: "minPercentageToAsk", type: "uint256", value: 9000 },
    //   { name: "params", type: "bytes", value: "" },
    // ];

    const domain = {
      name: "LooksRareExchange",
      version: "1",
      chainId: 43114, // Avalanche mainnet
      verifyingContract: this.exchange.address,
    };

    // console.log(`SIGNER:`, ethers.provider.getSigner());

    const startTime = Date.now();
    const makerOrder = {
      isOrderAsk: true,
      signer: this.alice.address,
      collection: this.erc721Token.address,
      price: 100,
      tokenId: 1,
      amount: 1,
      strategy: this.strategyStandardSaleForFixedPrice.address,
      currency: this.WAVAX,
      nonce: 1,
      startTime,
      endTime: startTime + 100000,
      minPercentageToAsk: 9000,
      params: ethers.utils.formatBytes32String(""),
    };
    const signedMessage = await this.alice._signTypedData(
      domain,
      types,
      makerOrder
    );

    const expectedSignerAddress = this.alice.address;
    const recoveredAddress = ethers.utils.verifyTypedData(
      domain,
      types,
      makerOrder,
      signedMessage
    );
    console.log(
      `ADDRESSES:`,
      expectedSignerAddress,
      recoveredAddress,
      expectedSignerAddress === recoveredAddress
    );
    // const data = JSON.stringify({
    //   types: {
    //     EIP712Domain: domain,
    //     MakerOrder: makerOrder,
    //   },
    //   domain: domainData,
    //   primaryType: "MakerOrder",
    //   message: message,
    // });

    // const signedMessage = await ethers.provider.send("eth_signTypedData_v3", [
    //   this.alice.address,
    //   data,
    // ]);
    console.log(`SIGNED MESSAGE:`, signedMessage);
    // const signature = signedMessage.result.substring(2);
    // const r = "0x" + signature.substring(0, 64);
    // const s = "0x" + signature.substring(64, 128);
    // const v = parseInt(signature.substring(128, 130), 16);

    // const makerOrder = [
    //   { name: "isOrderAsk", type: "bool", value: true },
    //   { name: "signer", type: "address", value: this.alice.address },
    //   { name: "collection", type: "address", value: this.erc721Token.address },
    //   { name: "price", type: "uint256", value: 1e18 },
    //   { name: "tokenId", type: "uint256", value: 1 },
    //   { name: "amount", type: "uint256", value: 1 },
    //   {
    //     name: "strategy",
    //     type: "address",
    //     value: this.strategyStandardSaleForFixedPrice.address,
    //   },
    //   { name: "currency", type: "address", value: this.WAVAX },
    //   { name: "nonce", type: "uint256", value: 1 },
    //   { name: "startTime", type: "uint256", value: startTime },
    //   { name: "endTime", type: "uint256", value: startTime + 100000 },
    //   { name: "minPercentageToAsk", type: "uint256", value: 9000 },
    //   { name: "params", type: "bytes", value: "" },
    // ];

    // // https://metamask.github.io/eth-sig-util/modules.html#signTypedData
    // const signedMessage = signTypedData({
    //   privateKey: Buffer.from(this.alice.privateKey, "hex"),
    //   data: makerOrder,
    //   version: "V4",
    // });
    // console.log(`SIGNED MESSAGE:`, signedMessage);
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
