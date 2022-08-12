const { config, ethers, network } = require("hardhat");
const { expect } = require("chai");

describe("BatchTransferNFT", function () {
  before(async function () {
    this.ERC721TokenCF = await ethers.getContractFactory("ERC721Token");
    this.ERC1155TokenCF = await ethers.getContractFactory("ERC1155Token");
    this.BatchTransferNFTCF = await ethers.getContractFactory(
      "BatchTransferNFT"
    );

    this.signers = await ethers.getSigners();
    this.dev = this.signers[0];
    this.alice = this.signers[1];
    this.bob = this.signers[2];
    this.exploiter = this.signers[2];
  });

  beforeEach(async function () {
    this.erc721Token = await this.ERC721TokenCF.deploy();
    this.erc1155Token = await this.ERC1155TokenCF.deploy();
    this.batchTransferNFT = await this.BatchTransferNFTCF.deploy();

    // Mint ERC721 tokens
    for (let i = 0; i < 3; ++i) await this.erc721Token.mint(this.alice.address);

    // Mint ERC1155 tokens
    this.erc1155Tokens = [
      { id: 1, amount: 10 },
      { id: 2, amount: 5 },
    ];
    await Promise.all(
      this.erc1155Tokens.map((token) =>
        this.erc1155Token.mint(this.alice.address, token.id, token.amount, [])
      )
    );
  });
  it("Should revert if the contract isn't approved", async function () {
    const recipient = this.bob.address;

    const transfersERC721 = [
      {
        nft: this.erc721Token.address,
        recipient: recipient,
        tokenId: 1,
        quantity: 0,
      },
    ];

    await expect(
      this.batchTransferNFT.connect(this.alice).batchTransfer(transfersERC721)
    ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");

    const token = this.erc1155Tokens[0];

    const transfersERC1155 = [
      {
        nft: this.erc1155Token.address,
        recipient: recipient,
        tokenId: token.id,
        quantity: token.amount,
      },
    ];

    await expect(
      this.batchTransferNFT.connect(this.alice).batchTransfer(transfersERC1155)
    ).to.be.revertedWith("ERC1155: caller is not owner nor approved");
  });

  it("Should revert if another user tries to transfer NFTs even if the user has approved the contract", async function () {
    const tokenIds = [1, 2];
    const recipient = this.bob.address;

    // Alice must approve the batchTransferNFT as operator for both NFTs
    await this.erc1155Token
      .connect(this.alice)
      .setApprovalForAll(this.batchTransferNFT.address, true);
    await this.erc721Token
      .connect(this.alice)
      .setApprovalForAll(this.batchTransferNFT.address, true);

    const transfersERC721 = [
      {
        nft: this.erc721Token.address,
        recipient: recipient,
        tokenId: 1,
        quantity: 0,
      },
    ];

    await expect(
      this.batchTransferNFT.connect(this.bob).batchTransfer(transfersERC721)
    ).to.be.revertedWith("ERC721: transfer from incorrect owner");

    const token = this.erc1155Tokens[0];

    const transfersERC1155 = [
      {
        nft: this.erc1155Token.address,
        recipient: recipient,
        tokenId: token.id,
        quantity: token.amount,
      },
    ];

    await expect(
      this.batchTransferNFT.connect(this.bob).batchTransfer(transfersERC1155)
    ).to.be.revertedWith("ERC1155: caller is not owner nor approved");
  });

  it("Should allow to transfer multiple ERC721 tokens in a single call", async function () {
    const tokenIds = [1, 2];
    const sender = this.alice.address;
    const recipient = this.bob.address;

    // Check that Alice has the tokens
    expect(await this.erc721Token.ownerOf(1)).to.be.equal(sender);
    expect(await this.erc721Token.ownerOf(2)).to.be.equal(sender);

    // Alice must approve the batchTransferNFT contract as operator
    await this.erc721Token
      .connect(this.alice)
      .setApprovalForAll(this.batchTransferNFT.address, true);

    const transfers = tokenIds.map((tokenId) => {
      return {
        nft: this.erc721Token.address,
        recipient: recipient,
        tokenId: tokenId,
        quantity: 0,
      };
    });

    // Transfer NFTs
    await this.batchTransferNFT.connect(this.alice).batchTransfer(transfers);

    // Check that Bob received the tokens
    expect(await this.erc721Token.ownerOf(1)).to.be.equal(recipient);
    expect(await this.erc721Token.ownerOf(2)).to.be.equal(recipient);
  });

  it("Should allow to transfer multiple ERC1155 tokens in a single call", async function () {
    const sender = this.alice.address;
    const recipient = this.bob.address;

    // Check that Alice has the tokens
    let balances = await Promise.all(
      this.erc1155Tokens.map((token) =>
        this.erc1155Token.balanceOf(sender, token.id)
      )
    );
    expect(balances.map((balance) => balance.toNumber())).to.eql(
      this.erc1155Tokens.map((token) => token.amount)
    );

    // Alice must approve the batchTransferNFT as operator
    await this.erc1155Token
      .connect(this.alice)
      .setApprovalForAll(this.batchTransferNFT.address, true);

    const transfers = this.erc1155Tokens.map((token) => {
      return {
        nft: this.erc1155Token.address,
        recipient: recipient,
        tokenId: token.id,
        quantity: token.amount,
      };
    });

    // Transfer NFTs
    await this.batchTransferNFT.connect(this.alice).batchTransfer(transfers);

    // Check that Bob received the tokens
    balances = await Promise.all(
      this.erc1155Tokens.map((token) =>
        this.erc1155Token.balanceOf(recipient, token.id)
      )
    );
    expect(balances.map((balance) => balance.toNumber())).to.eql(
      this.erc1155Tokens.map((token) => token.amount)
    );
  });

  it("Should allow to transfer multiple ERC721 and ERC1155 tokens in a single call", async function () {
    const tokenIds = [1, 2];
    const recipient = this.bob.address;

    // Alice must approve the batchTransferNFT as operator for both NFTs
    await this.erc1155Token
      .connect(this.alice)
      .setApprovalForAll(this.batchTransferNFT.address, true);
    await this.erc721Token
      .connect(this.alice)
      .setApprovalForAll(this.batchTransferNFT.address, true);

    const transfersERC1155 = this.erc1155Tokens.map((token) => {
      return {
        nft: this.erc1155Token.address,
        recipient: recipient,
        tokenId: token.id,
        quantity: token.amount,
      };
    });
    const transfersERC721 = tokenIds.map((tokenId) => {
      return {
        nft: this.erc721Token.address,
        recipient: recipient,
        tokenId: tokenId,
        quantity: 0,
      };
    });

    const transfers = transfersERC1155.concat(transfersERC721);

    // Transfer NFTs
    await this.batchTransferNFT.connect(this.alice).batchTransfer(transfers);

    // Check that Bob received the tokens
    expect(await this.erc721Token.ownerOf(1)).to.be.equal(recipient);
    expect(await this.erc721Token.ownerOf(2)).to.be.equal(recipient);
    balances = await Promise.all(
      this.erc1155Tokens.map((token) =>
        this.erc1155Token.balanceOf(recipient, token.id)
      )
    );
    expect(balances.map((balance) => balance.toNumber())).to.eql(
      this.erc1155Tokens.map((token) => token.amount)
    );
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
