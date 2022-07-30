// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title AuctionManager
 * @notice Runs english auctions
 */
contract AuctionManager is Initializable, OwnableUpgradeable {
    function initialize() public initializer {
        __Ownable_init();
    }
}
