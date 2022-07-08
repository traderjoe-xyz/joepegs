// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IBatchTransferer {
    struct NonFungibleToken {
        address collection; // collection address
        uint256 tokenId; // id of the token
        uint256 amount; // amount of tokens to transfer (must be 1 for ERC721, 1+ for ERC1155)
    }

    function batchTransferNonFungibleTokens(
        address from,
        address to,
        NonFungibleToken[] calldata nfts
    ) external;
}
