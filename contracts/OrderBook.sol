// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// OpenZeppelin contracts
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// LooksRare interfaces
import {ICurrencyManager} from "./interfaces/ICurrencyManager.sol";
import {IExecutionManager} from "./interfaces/IExecutionManager.sol";
import {IExecutionStrategy} from "./interfaces/IExecutionStrategy.sol";
import {IRoyaltyFeeManager} from "./interfaces/IRoyaltyFeeManager.sol";
import {ILooksRareExchange} from "./interfaces/ILooksRareExchange.sol";
import {ITransferManagerNFT} from "./interfaces/ITransferManagerNFT.sol";
import {ITransferSelectorNFT} from "./interfaces/ITransferSelectorNFT.sol";
import {IWETH} from "./interfaces/IWETH.sol";
import {IOrderBook} from "./interfaces/IOrderBook.sol";

// LooksRare libraries
import {OrderTypes} from "./libraries/OrderTypes.sol";
import {SignatureChecker} from "./libraries/SignatureChecker.sol";

contract OrderBook is IOrderBook, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    using OrderTypes for OrderTypes.MakerOrder;
    using OrderTypes for OrderTypes.TakerOrder;

    bytes32 public immutable DOMAIN_SEPARATOR;

    ICurrencyManager public currencyManager;
    IExecutionManager public executionManager;

    mapping(address => uint256) public userMinOrderNonce;
    mapping(address => mapping(uint256 => bool))
        private _isUserOrderNonceExecutedOrCancelled;

    /// @notice Mapping from user to latest order nonce
    mapping(address => uint256) public userLatestOrderNonce;

    /// @notice Mapping from NFT contract address => NFT token ID => maker orders
    mapping(address => mapping(uint256 => OrderTypes.MakerOrder[]))
        public makerOrders;

    event CancelAllOrders(address indexed user, uint256 newMinNonce);
    event CancelMultipleOrders(address indexed user, uint256[] orderNonces);
    event NewCurrencyManager(address indexed currencyManager);
    event NewExecutionManager(address indexed executionManager);

    /**
     * @notice Constructor
     * @param _currencyManager currency manager address
     * @param _executionManager execution manager address
     */
    constructor(address _currencyManager, address _executionManager) {
        // Calculate the domain separator
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f, // keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
                0xda9101ba92939daf4bb2e18cd5f942363b9297fbc3232c9dd964abb1fb70ed71, // keccak256("LooksRareExchange")
                0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6, // keccak256(bytes("1")) for versionId = 1
                block.chainid,
                address(this)
            )
        );
        currencyManager = ICurrencyManager(_currencyManager);
        executionManager = IExecutionManager(_executionManager);
    }

    function createMakerOrder(OrderTypes.MakerOrder calldata makerOrder)
        external
        override
    {
        require(
            makerOrder.signer == msg.sender,
            "Expected maker order signer to be msg.sender"
        );
        require(
            makerOrder.nonce == userLatestOrderNonce[msg.sender] + 1,
            "Expected maker order nonce to be one greater than latest user order nonce"
        );

        validateOrder(makerOrder, makerOrder.hash());

        userLatestOrderNonce[msg.sender] += 1;

        address collection = makerOrder.collection;
        uint256 tokenId = makerOrder.tokenId;
        makerOrders[collection][tokenId].push(makerOrder);
    }

    function markMakerOrderAsExecutedOrCancelled(
        address makerOrderSigner,
        uint256 makerOrderNonce
    ) external override onlyOwner {
        _isUserOrderNonceExecutedOrCancelled[makerOrderSigner][
            makerOrderNonce
        ] = true;
    }

    /**
     * @notice Cancel all pending orders for a sender
     * @param minNonce minimum user nonce
     */
    function cancelAllOrdersForSender(uint256 minNonce) external override {
        require(
            minNonce > userMinOrderNonce[msg.sender],
            "Cancel: Order nonce lower than current"
        );
        require(
            minNonce < userMinOrderNonce[msg.sender] + 500000,
            "Cancel: Cannot cancel more orders"
        );
        userMinOrderNonce[msg.sender] = minNonce;

        emit CancelAllOrders(msg.sender, minNonce);
    }

    /**
     * @notice Cancel maker orders
     * @param orderNonces array of order nonces
     */
    function cancelMultipleMakerOrders(uint256[] calldata orderNonces)
        external
        override
    {
        require(orderNonces.length > 0, "Cancel: Cannot be empty");

        for (uint256 i = 0; i < orderNonces.length; i++) {
            require(
                orderNonces[i] >= userMinOrderNonce[msg.sender],
                "Cancel: Order nonce lower than current"
            );
            _isUserOrderNonceExecutedOrCancelled[msg.sender][
                orderNonces[i]
            ] = true;
        }

        emit CancelMultipleOrders(msg.sender, orderNonces);
    }

    /**
     * @notice Update currency manager
     * @param _currencyManager new currency manager address
     */
    function updateCurrencyManager(address _currencyManager)
        external
        onlyOwner
    {
        require(
            _currencyManager != address(0),
            "Owner: Cannot be null address"
        );
        currencyManager = ICurrencyManager(_currencyManager);
        emit NewCurrencyManager(_currencyManager);
    }

    /**
     * @notice Update execution manager
     * @param _executionManager new execution manager address
     */
    function updateExecutionManager(address _executionManager)
        external
        onlyOwner
    {
        require(
            _executionManager != address(0),
            "Owner: Cannot be null address"
        );
        executionManager = IExecutionManager(_executionManager);
        emit NewExecutionManager(_executionManager);
    }

    /**
     * @notice Check whether user order nonce is executed or cancelled
     * @param user address of user
     * @param orderNonce nonce of the order
     */
    function isUserOrderNonceExecutedOrCancelled(
        address user,
        uint256 orderNonce
    ) external view override returns (bool) {
        return _isUserOrderNonceExecutedOrCancelled[user][orderNonce];
    }

    /**
     * @notice Verify the validity of the maker order
     * @param makerOrder maker order
     * @param orderHash computed hash for the order
     */
    function validateOrder(
        OrderTypes.MakerOrder calldata makerOrder,
        bytes32 orderHash
    ) public view override {
        // Verify whether order nonce has expired
        require(
            (
                !_isUserOrderNonceExecutedOrCancelled[makerOrder.signer][
                    makerOrder.nonce
                ]
            ) && (makerOrder.nonce >= userMinOrderNonce[makerOrder.signer]),
            "Order: Matching order expired"
        );

        // Verify the signer is not address(0)
        require(makerOrder.signer != address(0), "Order: Invalid signer");

        // Verify the amount is not 0
        require(makerOrder.amount > 0, "Order: Amount cannot be 0");

        // Verify the validity of the signature
        require(
            SignatureChecker.verify(
                orderHash,
                makerOrder.signer,
                makerOrder.v,
                makerOrder.r,
                makerOrder.s,
                DOMAIN_SEPARATOR
            ),
            "Signature: Invalid"
        );

        // Verify whether the currency is whitelisted
        require(
            currencyManager.isCurrencyWhitelisted(makerOrder.currency),
            "Currency: Not whitelisted"
        );

        // Verify whether strategy can be executed
        require(
            executionManager.isStrategyWhitelisted(makerOrder.strategy),
            "Strategy: Not whitelisted"
        );
    }
}
