// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../utils/SafePausable.sol";

/// @title Mock contract using `SafePausable`
/// @author Trader Joe
contract MockSafePausable is SafePausable {
    uint256 shh;

    function pausableFunction() external whenNotPaused {
        shh = shh;
    }

    function doSomething() external {
        shh = shh;
    }
}
