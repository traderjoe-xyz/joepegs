// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

error PausableAdmin__AlreadyPaused();
error PausableAdmin__AlreadyUnpaused();
error PausableAdmin__OnlyRenounceForSelf(address sender);
error PausableAdmin__OnlyPauseAdmin(address sender);
error PausableAdmin__AddressIsNotPauseAdmin(address sender);
error PausableAdmin__AddressIsAlreadyPauseAdmin(address sender);
