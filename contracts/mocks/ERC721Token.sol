// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/// @title Joe Token, JOE
/// @author Trader Joe
/// @dev ONLY FOR TESTS
contract ERC721Token is ERC721("Sample NFT", "NFT"), Ownable {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIds;

    /// @dev Mint _amount to _to. Callable only by owner
    /// @param _to The address that will receive the mint
    function mint(address _to) external onlyOwner returns (uint256) {
        _tokenIds.increment();

        uint256 newTokenId = _tokenIds.current();
        _mint(_to, newTokenId);

        return newTokenId;
    }
}
