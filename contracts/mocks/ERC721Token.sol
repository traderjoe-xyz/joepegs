// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import {IERC165, IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";

/// @title Joe Token, JOE
/// @author Trader Joe
/// @dev ONLY FOR TESTS
contract ERC721Token is ERC721("Sample NFT", "NFT"), Ownable, IERC2981 {
    using Counters for Counters.Counter;

    // https://eips.ethereum.org/EIPS/eip-2981
    bytes4 public constant INTERFACE_ID_ERC2981 = 0x2a55205a;

    Counters.Counter private _tokenIds;

    /// @dev Mint _amount to _to. Callable only by owner
    /// @param _to The address that will receive the mint
    function mint(address _to) external onlyOwner returns (uint256) {
        _tokenIds.increment();

        uint256 newTokenId = _tokenIds.current();
        _mint(_to, newTokenId);

        return newTokenId;
    }

    /**
     * @dev Returns how much royalty is owed and to whom, based on a sale price that may be denominated in any unit of
     * exchange. The royalty amount is denominated and should be payed in that same unit of exchange.
     */
    function royaltyInfo(uint256 _tokenId, uint256 _salePrice)
        external
        view
        override
        returns (address receiver, uint256 royaltyAmount)
    {
        receiver = owner();
        royaltyAmount = _salePrice / 100;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(IERC165, ERC721)
        returns (bool)
    {
        return
            interfaceId == INTERFACE_ID_ERC2981 ||
            super.supportsInterface(interfaceId);
    }
}
