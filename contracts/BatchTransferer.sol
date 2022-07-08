// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IBatchTransferer} from "./interfaces/IBatchTransferer.sol";

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

contract BatchTransferer is IBatchTransferer {
    // ERC721 interfaceID
    bytes4 public constant INTERFACE_ID_ERC721 = 0x80ac58cd;
    // ERC1155 interfaceID
    bytes4 public constant INTERFACE_ID_ERC1155 = 0xd9b67a26;

    /**
     * @notice Transfer multiple ERC721 and/or ERC1155 in one transaction
     * @param from the sender address
     * @param to the receiver address
     * @param nfts the non fungible tokens to send
     */
    function batchTransferNonFungibleTokens(
        address from,
        address to,
        NonFungibleToken[] calldata nfts
    ) external override {
        require(
            msg.sender == from,
            "BatchTransferer: Only assets owner can transfer"
        );
        for (uint256 i = 0; i < nfts.length; i++) {
            _transferNonFungibleToken(from, to, nfts[i]);
        }
    }

    /**
     * @notice Transfer an ERC721 or ERC1155 from the sender to the receiver
     * @param from the sender address
     * @param to the receiver address
     * @param nft the non fungible token to send
     */
    function _transferNonFungibleToken(
        address from,
        address to,
        NonFungibleToken calldata nft
    ) internal {
        address collection = nft.collection;
        uint256 tokenId = nft.tokenId;
        if (IERC165(collection).supportsInterface(INTERFACE_ID_ERC721)) {
            IERC721(collection).safeTransferFrom(from, to, tokenId);
        } else if (
            IERC165(collection).supportsInterface(INTERFACE_ID_ERC1155)
        ) {
            IERC1155(collection).safeTransferFrom(
                from,
                to,
                tokenId,
                nft.amount,
                ""
            );
        }
    }
}
