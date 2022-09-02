// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../utils/SafeAccessControlEnumerable.sol";

/// @title Mock contract using `SafeAccessControlEnumerable`
/// @author Trader Joe
contract MockSafeAccessControlEnumerable is SafeAccessControlEnumerable {
    function setRoleAdmin(bytes32 role, bytes32 adminRole) external onlyOwner {
        _setRoleAdmin(role, adminRole);
    }
}
