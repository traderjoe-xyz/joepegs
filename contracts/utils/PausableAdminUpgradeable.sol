// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import "../interfaces/IPausableAdmin.sol";
import "./PausableAdminErrors.sol";
import "./PendingOwnableUpgradeable.sol";

abstract contract PausableAdminUpgradeable is
    PendingOwnableUpgradeable,
    PausableUpgradeable,
    IPausableAdmin
{
    using EnumerableSet for EnumerableSet.AddressSet;

    EnumerableSet.AddressSet private _pauseAdmins;

    modifier onlyPauseAdmin() {
        if (!_pauseAdmins.contains(msg.sender))
            revert PausableAdmin__OnlyPauseAdmin(msg.sender);
        _;
    }

    /**
     * @dev Initializes the contract adding `msg.sender` as a pause admin
     */
    function __PausableAdmin_init() internal onlyInitializing {
        __PendingOwnable_init();
        __Pausable_init();

        _addPauseAdmin(msg.sender);
    }

    /**
     * @notice View function to return the pause admin at index `_index`
     * @param _index The index in the array
     * @return The address of the admin at index `_index`
     */
    function getPauseAdminAt(uint256 _index)
        external
        view
        override
        returns (address)
    {
        return _pauseAdmins.at(_index);
    }

    /**
     * @notice View function to return the number of pause admins
     * @return The number of pause admins
     */
    function getNumberOfPauseAdmin() external view override returns (uint256) {
        return _pauseAdmins.length();
    }

    /**
     * @notice View function to check whether a user is an admin (true) or not (false)
     * @param _user The address of the user
     * @return Whether the user is an admin (true) or not (false)
     */
    function isPauseAdmin(address _user) external view override returns (bool) {
        return _pauseAdmins.contains(_user);
    }

    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[EIP section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        pure
        virtual
        override
        returns (bool)
    {
        return
            interfaceId == type(IPausableAdmin).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
     * @notice Transfers the ownership to the new owner (`pendingOwner`).
     * This will also remove the previousOwner of PauseAdmin and add the new owner.
     * Can only be called by the pending owner (checked within the `super.becomeOwner()`)
     */
    function becomeOwner() public virtual override {
        address _previousOwner = owner();

        if (!_pauseAdmins.contains(msg.sender)) {
            _addPauseAdmin(msg.sender);
        }
        if (_pauseAdmins.contains(_previousOwner)) {
            _removePauseAdmin(_previousOwner);
        }
        super.becomeOwner();
    }

    /**
     * @notice Function to add a pause admin
     * @dev Only callable by the owner
     * @param _newAdmin The address of the new admin to add
     */
    function addPauseAdmin(address _newAdmin) external override onlyOwner {
        _addPauseAdmin(_newAdmin);
    }

    /**
     * @notice Function to remove a pause admin
     * @dev Only callable by the owner
     * @param _admin The address of the admin to remove
     */
    function removePauseAdmin(address _admin) external override onlyOwner {
        _removePauseAdmin(_admin);
    }

    /**
     * @notice Function callable by any admin to renounce their role
     * @dev Only callable by the admin himself
     */
    function renouncePauseAdmin() external override {
        _removePauseAdmin(msg.sender);
    }

    /**
     * @notice Function to pause the contract
     * @dev Only callable by any pause admin
     */
    function pause() external onlyPauseAdmin {
        if (paused()) revert PausableAdmin__AlreadyPaused();
        _pause();
    }

    /**
     * @notice Function to unpause the contract
     * @dev Only callable by the owner
     */
    function unpause() external onlyOwner {
        if (!paused()) revert PausableAdmin__AlreadyUnpaused();
        _unpause();
    }

    /**
     * @notice Internal function to add a pause admin
     * @param _newAdmin The address of the new admin to add
     */
    function _addPauseAdmin(address _newAdmin) internal {
        if (!_pauseAdmins.add(_newAdmin))
            revert PausableAdmin__AddressIsAlreadyPauseAdmin(_newAdmin);
        emit PauseAdminAdded(_newAdmin);
    }

    /**
     * @notice Internal function to remove a pause admin
     * @param _admin The address of the admin to remove
     */
    function _removePauseAdmin(address _admin) internal {
        if (!_pauseAdmins.remove(_admin))
            revert PausableAdmin__AddressIsNotPauseAdmin(_admin);
        emit PauseAdminRemoved(msg.sender, _admin);
    }
}
