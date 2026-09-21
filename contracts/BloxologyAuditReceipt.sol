// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Bloxology Audit Receipt
/// @notice An issuer-minted receipt for a specific AI-assisted audit report.
/// @dev This contract deliberately does not assess security or certify a contract.
contract BloxologyAuditReceipt is ERC721URIStorage, Ownable {
    struct Receipt {
        bytes32 reportHash;
        address reviewedContract;
        uint64 issuedAt;
        string reviewedNetwork;
    }

    uint256 private _nextTokenId = 1;
    mapping(uint256 => Receipt) public receipts;
    mapping(bytes32 => bool) public reportHashIssued;

    event AuditReceiptMinted(
        uint256 indexed tokenId,
        address indexed recipient,
        bytes32 indexed reportHash,
        address reviewedContract,
        string reviewedNetwork
    );

    constructor(address initialOwner) ERC721("Bloxology Audit Receipt", "BLOXAUDIT") Ownable(initialOwner) {}

    /// @notice Mints one receipt for one immutable report hash.
    /// @param recipient Wallet receiving the receipt.
    /// @param reportHash SHA-256 hash of the canonical downloadable audit report.
    /// @param reviewedContract The contract address reviewed in the report.
    /// @param reviewedNetwork Human-readable reviewed network identifier.
    /// @param receiptMetadataUri Immutable NFT metadata URI, typically an IPFS URI.
    function mintReceipt(
        address recipient,
        bytes32 reportHash,
        address reviewedContract,
        string calldata reviewedNetwork,
        string calldata receiptMetadataUri
    ) external onlyOwner returns (uint256 tokenId) {
        require(recipient != address(0), "recipient is required");
        require(reviewedContract != address(0), "reviewed contract is required");
        require(reportHash != bytes32(0), "report hash is required");
        require(!reportHashIssued[reportHash], "receipt already issued");

        tokenId = _nextTokenId++;
        reportHashIssued[reportHash] = true;
        receipts[tokenId] = Receipt({
            reportHash: reportHash,
            reviewedContract: reviewedContract,
            issuedAt: uint64(block.timestamp),
            reviewedNetwork: reviewedNetwork
        });

        _safeMint(recipient, tokenId);
        _setTokenURI(tokenId, receiptMetadataUri);

        emit AuditReceiptMinted(tokenId, recipient, reportHash, reviewedContract, reviewedNetwork);
    }
}
