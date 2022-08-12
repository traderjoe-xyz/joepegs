// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

/**
 * @title BatchTransferNFT
 * @notice Enables to batch transfer multiple NFTs in a single call to this contract
 */
contract BatchTransferNFT {
    struct Transfer {
        address nft;
        address recipient;
        uint256 tokenId;
        uint256 quantity;
    }

    /**
     * @notice Batch transfer different NFT in a single call
     * @param _transfers The list of transfer.
     * The quantity defines the type of NFT:
     *  - quantity = 0: ERC721
     *  - quantity > 0: ERC1155
     */
    function batchTransfer(Transfer[] calldata _transfers) external {
        uint256 _length = _transfers.length;
        unchecked {
            for (uint256 i; i < _length; ++i) {
                Transfer memory _transfer = _transfers[i];
                if (_transfer.quantity == 0) {
                    IERC721(_transfer.nft).safeTransferFrom(
                        msg.sender,
                        _transfer.recipient,
                        _transfer.tokenId,
                        ""
                    );
                } else {
                    IERC1155(_transfer.nft).safeTransferFrom(
                        msg.sender,
                        _transfer.recipient,
                        _transfer.tokenId,
                        _transfer.quantity,
                        ""
                    );
                }
            }
        }
    }
}
