// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/// @title Mock ERC721 Token that doesn't support ERC2981
/// @author Trader Joe
contract ERC721WithoutRoyaltyToken is ERC721("Sample NFT", "NFT"), Ownable {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIds;

    /// @dev Mint a NFT to `_to`
    /// @param _to The address that will receive the mint
    /// @return the `tokenId` of the newly minted NFT
    function mint(address _to) external returns (uint256) {
        _tokenIds.increment();

        uint256 newTokenId = _tokenIds.current();
        _mint(_to, newTokenId);

        return newTokenId;
    }

    function tokenURI(uint256) public pure override returns (string memory) {
        return
            "https://ikzttp.mypinata.cloud/ipfs/QmQFkLSQysj94s5GvTHPyzTxrawwtjgiiYS2TBLgrvw8CW/5629";
    }

    function admin() external view returns (address) {
        return owner();
    }
}
