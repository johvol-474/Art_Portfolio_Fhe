pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";


contract ArtPortfolioFhe is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchClosed();
    error InvalidBatch();
    error InvalidStateHash();
    error ReplayAttempt();
    error InvalidProof();
    error AlreadyInitialized();
    error NotInitialized();
    error InvalidParameter();

    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address account);
    event Unpaused(address account);
    event CooldownChanged(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event PortfolioSubmitted(address indexed owner, uint256 indexed batchId, uint256 encryptedValue);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId, address caller);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 totalValue);

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    uint256 public currentBatchId;
    bool public batchOpen;
    mapping(uint256 => euint32) public portfolioValues; // batchId => encrypted total value for that batch

    mapping(uint256 => DecryptionContext) public decryptionContexts;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkSubmissionCooldown(address _address) {
        if (block.timestamp < lastSubmissionTime[_address] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier checkDecryptionCooldown(address _address) {
        if (block.timestamp < lastDecryptionRequestTime[_address] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[msg.sender] = true;
        emit ProviderAdded(msg.sender);
        cooldownSeconds = 60; // Default 60 seconds cooldown
        currentBatchId = 1; // Start with batch 1
        batchOpen = false; // Batch closed by default
    }

    function addProvider(address _provider) external onlyOwner {
        if (!isProvider[_provider]) {
            isProvider[_provider] = true;
            emit ProviderAdded(_provider);
        }
    }

    function removeProvider(address _provider) external onlyOwner {
        if (isProvider[_provider]) {
            isProvider[_provider] = false;
            emit ProviderRemoved(_provider);
        }
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setCooldownSeconds(uint256 _cooldownSeconds) external onlyOwner {
        if (_cooldownSeconds == 0) revert InvalidParameter();
        uint256 oldCooldown = cooldownSeconds;
        cooldownSeconds = _cooldownSeconds;
        emit CooldownChanged(oldCooldown, _cooldownSeconds);
    }

    function openBatch() external onlyOwner whenNotPaused {
        if (batchOpen) {
            currentBatchId++;
        }
        batchOpen = true;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() external onlyOwner whenNotPaused {
        if (!batchOpen) revert BatchClosed();
        batchOpen = false;
        emit BatchClosed(currentBatchId);
    }

    function submitPortfolioValue(euint32 _encryptedValue) external onlyProvider whenNotPaused checkSubmissionCooldown(msg.sender) {
        if (!batchOpen) revert BatchClosed();
        if (!_encryptedValue.isInitialized()) revert NotInitialized();

        lastSubmissionTime[msg.sender] = block.timestamp;

        // For simplicity, this example aggregates by adding.
        // A real system might have more complex logic or store individual items.
        // This contract assumes portfolioValues[currentBatchId] is initialized if batch has items.
        if (FHE.isInitialized(portfolioValues[currentBatchId])) {
            portfolioValues[currentBatchId] = portfolioValues[currentBatchId].add(_encryptedValue);
        } else {
            portfolioValues[currentBatchId] = _encryptedValue;
        }
        
        emit PortfolioSubmitted(msg.sender, currentBatchId, _encryptedValue.toBytes32());
    }

    function requestBatchValueDecryption(uint256 _batchId) external whenNotPaused checkDecryptionCooldown(msg.sender) {
        if (_batchId == 0 || _batchId > currentBatchId || !FHE.isInitialized(portfolioValues[_batchId])) {
            revert InvalidBatch();
        }

        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        // 1. Prepare Ciphertexts
        euint32 encryptedTotalValue = portfolioValues[_batchId];
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = encryptedTotalValue.toBytes32();

        // 2. Compute State Hash
        bytes32 stateHash = keccak256(abi.encode(cts, address(this)));

        // 3. Request Decryption
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        // 4. Store Context
        decryptionContexts[requestId] = DecryptionContext({ batchId: _batchId, stateHash: stateHash, processed: false });

        emit DecryptionRequested(requestId, _batchId, msg.sender);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        // 5.a. Replay Guard
        if (decryptionContexts[requestId].processed) {
            revert ReplayAttempt();
        }

        // 5.b. State Verification
        // Rebuild cts array in the exact same order as in requestBatchValueDecryption
        euint32 encryptedTotalValue = portfolioValues[decryptionContexts[requestId].batchId];
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = encryptedTotalValue.toBytes32();
        bytes32 currentHash = keccak256(abi.encode(cts, address(this)));

        if (currentHash != decryptionContexts[requestId].stateHash) {
            revert InvalidStateHash();
        }

        // 5.c. Proof Verification
        if (!FHE.checkSignatures(requestId, cleartexts, proof)) {
            revert InvalidProof();
        }

        // 5.d. Decode & Finalize
        // cleartexts is abi.encodePacked(uint256 totalValue)
        // It's a single uint256, so we can directly cast the bytes.
        require(cleartexts.length == 32, "ArtPortfolioFhe: Invalid cleartext length");
        uint256 totalValue = uint256(bytes32(cleartexts));

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, decryptionContexts[requestId].batchId, totalValue);
    }

    function _hashCiphertexts(bytes32[] memory _cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(_cts, address(this)));
    }

    function _initIfNeeded(euint32 _val, uint32 _plain) internal {
        if (!_val.isInitialized()) {
            _val = FHE.asEuint32(_plain);
        } else {
            revert AlreadyInitialized();
        }
    }

    function _requireInitialized(euint32 _val) internal pure {
        if (!_val.isInitialized()) {
            revert NotInitialized();
        }
    }
}