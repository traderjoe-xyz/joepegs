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
error AuctionManager__NoAuctionExists();
error AuctionManager__InsufficientBidPrice();
error AuctionManager__AuctionCreatorCannotPlaceBid();
error AuctionManager__TransferPreviousBidFailed();
error AuctionManager__CannotBidOnEndedAuction();

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

    uint256 public refreshTime;

    function initialize(uint256 _refreshTime) public initializer {
        __Ownable_init();

        refreshTime = _refreshTime;
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

    function placeBid(address _collection, uint256 _tokenId) public payable {
        Auction storage auction = auctions[_collection][_tokenId];
        if (auction.creator == address(0)) {
            revert AuctionManager__NoAuctionExists();
        }
        if (msg.sender == auction.creator) {
            revert AuctionManager__AuctionCreatorCannotPlaceBid();
        }
        if (block.timestamp >= auction.endTime) {
            revert AuctionManager__CannotBidOnEndedAuction();
        }

        if (auction.endTime - block.timestamp <= refreshTime) {
            auction.endTime += refreshTime;
        }

        if (auction.lastBidPrice == 0) {
            if (msg.value < auction.reservePrice) {
                revert AuctionManager__InsufficientBidPrice();
            }
            auction.lastBidder = msg.sender;
            auction.lastBidPrice = msg.value;
        } else {
            if (msg.sender == auction.lastBidder) {
                if (msg.value < auction.minimumBidIncrement) {
                    revert AuctionManager__InsufficientBidPrice();
                }
                auction.lastBidPrice += msg.value;
            } else {
                if (
                    msg.value <
                    auction.lastBidPrice + auction.minimumBidIncrement
                ) {
                    revert AuctionManager__InsufficientBidPrice();
                }

                address previousBidder = auction.lastBidder;
                uint256 previousBidPrice = auction.lastBidPrice;

                auction.lastBidder = msg.sender;
                auction.lastBidPrice = msg.value;

                (bool sent, ) = previousBidder.call{value: previousBidPrice}(
                    ""
                );
                if (!sent) {
                    revert AuctionManager__TransferPreviousBidFailed();
                }
            }
        }
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
