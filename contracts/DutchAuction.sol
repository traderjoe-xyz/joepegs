// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract DutchAuction {
    uint256 private constant DURATION = 7 days;
    uint256 private constant MAX_BUY_SIZE = 5;

    mapping(address => bool) public whitelistedAddresses;

    IERC721 public immutable nft;
    uint256[] public nftIds;

    address payable public immutable seller;
    uint256 public immutable startingPrice;
    uint256 public immutable startAt;
    uint256 public immutable expiresAt;
    uint256 public immutable discountAmount;
    uint256 public immutable discountPace;

    constructor(
        uint256 _startingPrice,
        uint256 _discountAmount,
        uint256 _discountPace,
        address _nft,
        uint256[] memory _nftIds,
        address[] memory _whitelistedAddresses
    ) {
        seller = payable(msg.sender);
        startingPrice = _startingPrice;
        startAt = block.timestamp;
        expiresAt = block.timestamp + DURATION;
        discountAmount = _discountAmount;
        discountPace = _discountPace;

        require(
            _startingPrice - ((_discountAmount * DURATION) / _discountPace) > 0,
            "price <= 0 at the end of the auction"
        );

        nft = IERC721(_nft);
        nftIds = _nftIds;

        for (uint i = 0; i < _whitelistedAddresses.length; i++) {
            whitelistedAddresses[_whitelistedAddresses[i]] = true;
        }
    }

    function getDiscount() public view returns (uint256) {
        uint256 multiplier = (block.timestamp - startAt) / discountPace;
        return discountAmount * multiplier;
    }

    function getPrice() public view returns (uint256) {
        uint256 discount = getDiscount();
        return startingPrice - discount;
    }

    function buy(uint256 desiredNftCount) external payable {
        require(block.timestamp < expiresAt, "auction expired");
        require(nftIds.length > 0, "no nfts left to buy");
        require(desiredNftCount <= MAX_BUY_SIZE, "can't buy more than MAX_BUY_SIZE");
        require(desiredNftCount > 0, "can't buy zero NFT");

        bool isWhitelisted = isAddressWhitelisted(msg.sender);
        require(isWhitelisted, "msg sender not on whitelist");

        uint256 nftCount = Math.min(desiredNftCount, nftIds.length);
        uint256 price = getPrice();
        uint256 totalAmount = price * nftCount;
        require(msg.value >= totalAmount, "AVAX < total amount");

        do {
            nft.transferFrom(seller, msg.sender, nftIds[nftIds.length - 1]);
            nftIds.pop();
            nftCount = nftCount - 1;
        } while (nftCount > 0);

        uint256 refund = msg.value - totalAmount;
        if (refund > 0) {
            payable(msg.sender).transfer(refund);
        }
    }

    function isAddressWhitelisted(address _wallet) public view returns (bool) {
        return whitelistedAddresses[_wallet];
    }
}
