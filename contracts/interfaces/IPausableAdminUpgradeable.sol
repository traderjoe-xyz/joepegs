// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IPausableAdminUpgradeable {
    event PauseAdminAdded(address newAdmin);
    event PauseAdminRemoved(address sender, address removedAdmin);

    function getPauseAdminAt(uint256 _index) external view returns (address);

    function isPauseAdmin(address _user) external view returns (bool);

    function getNumberOfPauseAdmin() external view returns (uint256);

    function addPauseAdmin(address _newAdmin) external;

    function removePauseAdmin(address _admin) external;

    function renouncePauseAdmin() external;
}
