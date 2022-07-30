// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

error AuctionManager__AuctionAlreadyExists();
error AuctionManager__InvalidBuyNowPrice();
error AuctionManager__InvalidDuration();
error AuctionManager__OnlyAuctionCreatorCanCancel();
error AuctionManager__CannotCancelAuctionWithBid();

/**
 * @title AuctionManager
 * @notice Runs english auctions
 */
contract AuctionManager is Initializable, OwnableUpgradeable {
    struct Auction {
        address creator;
        address lastBidder;
        uint256 lastBidPrice;
        uint256 endTime;
        uint256 reservePrice;
        uint256 buyNowPrice;
        uint256 minimumBidIncrement;
    }

    mapping(address => mapping(uint256 => Auction)) public auctions;

    function initialize() public initializer {
        __Ownable_init();
    }

    function startAuction(
        address _collection,
        uint256 _tokenId,
        uint256 _duration,
        uint256 _reservePrice,
        uint256 _minimumBidIncrement,
        uint256 _buyNowPrice
    ) public {
        if (_duration == 0) {
            revert AuctionManager__InvalidDuration();
        }
        if (_buyNowPrice > 0 && _buyNowPrice < _reservePrice) {
            revert AuctionManager__InvalidBuyNowPrice();
        }
        if (auctions[_collection][_tokenId].creator != address(0)) {
            revert AuctionManager__AuctionAlreadyExists();
        }

        auctions[_collection][_tokenId] = Auction({
            creator: msg.sender,
            lastBidder: address(0),
            lastBidPrice: 0,
            endTime: block.timestamp + _duration,
            reservePrice: _reservePrice,
            buyNowPrice: _buyNowPrice,
            minimumBidIncrement: _minimumBidIncrement
        });

        IERC721(_collection).safeTransferFrom(
            msg.sender,
            address(this),
            _tokenId
        );
    }

    function cancelAuction(address _collection, uint256 _tokenId) public {
        Auction memory auction = auctions[_collection][_tokenId];
        if (msg.sender != auction.creator) {
            revert AuctionManager__OnlyAuctionCreatorCanCancel();
        }
        if (auction.lastBidder != address(0)) {
            revert AuctionManager__CannotCancelAuctionWithBid();
        }

        auctions[_collection][_tokenId] = Auction({
            creator: address(0),
            lastBidder: address(0),
            lastBidPrice: 0,
            endTime: 0,
            reservePrice: 0,
            buyNowPrice: 0,
            minimumBidIncrement: 0
        });

        IERC721(_collection).safeTransferFrom(
            address(this),
            auction.creator,
            _tokenId
        );
    }
}
