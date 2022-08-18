// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../utils/PausableAdminUpgradeable.sol";

/// @title Mock contract using `PausableAdminUpgradeable`
/// @author Trader Joe
contract MockPausableAdminUpgradeable is
    Initializable,
    PausableAdminUpgradeable
{
    function initialize() public initializer {
        __PausableAdmin_init();
    }
}
