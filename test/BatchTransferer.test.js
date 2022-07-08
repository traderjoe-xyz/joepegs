const { config, ethers, network } = require("hardhat");
const { expect } = require("chai");

describe.only("BatchTransferer", () => {
  before(async () => {
    this.ERC721TokenCF = await ethers.getContractFactory("ERC721Token");
    this.ERC1155TokenCF = await ethers.getContractFactory("ERC1155Token");
    this.batchTransfererCF = await ethers.getContractFactory("BatchTransferer");

    this.signers = await ethers.getSigners();
    this.dev = this.signers[0];
    this.alice = this.signers[1];
    this.bob = this.signers[2];
  });

  beforeEach(async () => {
    // Deploy contracts
    this.erc721Token = await this.ERC721TokenCF.deploy();
    this.erc1155Token = await this.ERC1155TokenCF.deploy();
    this.batchTransferer = await this.batchTransfererCF.deploy();

    // Mint ERC721
    await this.erc721Token.mint(this.alice.address);
    await this.erc721Token.mint(this.alice.address);

    // Mint ERC1155
    await this.erc1155Token.mint(this.alice.address, 1, 5);
    await this.erc1155Token.mint(this.alice.address, 2, 2);
  });

  it("can transfer multiple ERC721 and ERC1155 tokens", async () => {
    // Check that Alice owns the ERC721 tokens
    expect(await this.erc721Token.ownerOf(1)).to.be.equal(this.alice.address);
    expect(await this.erc721Token.ownerOf(2)).to.be.equal(this.alice.address);

    // Check that Alice owns the ERC1155 tokens
    expect(
      await this.erc1155Token.balanceOf(this.alice.address, 1)
    ).to.be.equal(5);
    expect(
      await this.erc1155Token.balanceOf(this.alice.address, 2)
    ).to.be.equal(2);

    // Approve batchTransferer to transfer ERC721 collection
    await this.erc721Token
      .connect(this.alice)
      .setApprovalForAll(this.batchTransferer.address, true);

    // Approve batchTransferer to transfer ERC1155 collection
    await this.erc1155Token
      .connect(this.alice)
      .setApprovalForAll(this.batchTransferer.address, true);

    // Batch transfer tokens
    const tokens = [
      { collection: this.erc721Token.address, tokenId: 1, amount: 1 },
      { collection: this.erc721Token.address, tokenId: 2, amount: 1 },
      { collection: this.erc1155Token.address, tokenId: 1, amount: 4 },
      { collection: this.erc1155Token.address, tokenId: 2, amount: 2 },
    ];
    await this.batchTransferer
      .connect(this.alice)
      .batchTransferNonFungibleTokens(
        this.alice.address,
        this.bob.address,
        tokens
      );

    // Check that Bob received the ERC721 tokens
    expect(await this.erc721Token.ownerOf(1)).to.be.equal(this.bob.address);
    expect(await this.erc721Token.ownerOf(2)).to.be.equal(this.bob.address);

    // Check that Bob received the ERC1155 tokens
    expect(await this.erc1155Token.balanceOf(this.bob.address, 1)).to.be.equal(
      4
    );
    expect(await this.erc1155Token.balanceOf(this.bob.address, 2)).to.be.equal(
      2
    );

    // Check that Alice still has the remaining ERC1155 tokens
    expect(
      await this.erc1155Token.balanceOf(this.alice.address, 1)
    ).to.be.equal(1);
    expect(
      await this.erc1155Token.balanceOf(this.alice.address, 2)
    ).to.be.equal(0);
  });

  it("reverts when the msg sender is not the tokens owner", async () => {
    const tokens = [
      { collection: this.erc721Token.address, tokenId: 1, amount: 1 },
    ];
    await expect(
      this.batchTransferer
        .connect(this.bob)
        .batchTransferNonFungibleTokens(
          this.alice.address,
          this.bob.address,
          tokens
        )
    ).to.be.revertedWith("Only assets owner can transfer");
  });
});
