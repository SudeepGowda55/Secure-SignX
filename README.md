# Secure SignX

<h4 align="center">
  <a href="https://secure-sign-x.vercel.app/">Click here to visit Secure SignX Website</a>
</h4>

<br />
![SecureSignX](https://ibb.co/YBSgQnG7)

![SecureSignX](https://github.com/user-attachments/assets/2dbd2c6f-e090-473e-b572-3cf3a8df31e4)

<br />

🧪 Secure SignX is a decentralized compliance and audit trail system for managing document Attestations via Sign Protocol, with Secure communication through XMTP and streamlined interactions using a MessageKit Bot

## Overview

Secure SignX leverages blockchain technology to create an immutable, transparent, and decentralized system for document compliance management. Built using modern web development frameworks including Next.js and React, the platform ensures secure document attestation through distributed ledger technology.

### Technology Stack

- **Frontend**: Next.js, React.js, TailwindCSS, JavaScript/JSX
- **Backend**: Node.js, Express
- **Blockchain**: EVM-compatible chains (Base Sepolia Testnet)  
- **Protocols**: 
  - Sign Protocol (for on-chain attestations)
  - XMTP (Extensible Message Transport Protocol) for secure communications
  - IPFS (InterPlanetary File System) for decentralized document storage
- **Authentication**: Web3 wallet-based authentication (MetaMask, WalletConnect)
- **Bot Infrastructure**: MessageKit for automated compliance notifications

Secure SignX involves two major components

## Sign Protocol Integration

Sign Protocol serves as the backbone for our attestation system, providing an immutable, on-chain verification layer. Our implementation uses EIP-712 typed data signatures to create cryptographically secure attestations.
![Screenshot 2025-05-26 014903](https://github.com/user-attachments/assets/2506737b-01c0-4414-9d95-d6a69939a17b)

### Schema Architecture

Currently, the Secure SignX Attestation Schema is deployed on **Base Sepolia Testnet** (Chain ID: 84532)

[SecureSignx Sign Protocol Schema](https://testnet-scan.sign.global/schema/onchain_evm_84532_0x22c)

### Technical Implementation

- **Smart Contract Address**: `0x22c` on Base Sepolia
- **Document Hashing**: SHA-256 algorithm for document integrity verification
- **Attestation Structure**: Contains document metadata, IPFS CID, timestamp, attestor signature, and compliance status flags

### Attestation Workflow:

1. The employee connects their Web3 wallet and uploads the legal document to IPFS, generating a unique Content Identifier (CID).
   
2. The attestation to any legal document can be created only by the Compliance Officer/Auditor using Sign Protocol's on-chain attestation mechanism.

3. The manager can review the attested documents through a cryptographically verified interface, ensuring data integrity.


You can view the **Attestations created on Sign Protocol** from here (https://testnet-scan.sign.global/schema/onchain_evm_84532_0x22c)
![Screenshot 2025-05-26 014938](https://github.com/user-attachments/assets/210cd664-d063-43f1-b1b3-d62e018ded96)

<br />

![sign protocol schema](https://github.com/user-attachments/assets/0845be75-e2a0-48d1-9e8a-1ccd03973d94)

<br />

<br />

## Secure Communications via XMTP Protocol

The second major component is the **XMTP Protocol** (Extensible Message Transport Protocol), which provides end-to-end encrypted communications within the platform.

### Technical Architecture

- **Protocol Version**: XMTP v1.0
- **Encryption**: End-to-end encryption using X25519-XSalsa20-Poly1305
- **Message Signing**: ECDSA with secp256k1 curve (compatible with Ethereum wallets)
- **Network**: XMTP Production Network
- **Message Format**: Protobuf-encoded payloads

### Notification System

XMTP is implemented to send real-time notifications to relevant users about document submissions, attestations, and status updates. The system automatically routes encrypted messages to the Manager, Compliance Officer, and Submitter based on the following events:

1. *Document Submission*: When a document is submitted, the bot sends the submission details, including the document name and IPFS CID, to the assigned Compliance Officer for review.
   
2. *Attestation Completion*: Once an attestation is made, real-time updates are sent: <br />
       - Submitter receives a message confirming their document's attestation and status. <br />
       - Manager receives a detailed attestation report containing the document name, IPFS CID, submitter, attestor, and compliance status. <br />
       - Compliance Officer is updated on any changes in document status or approval. <br />

### MessageKit Compliance Bot

A **Compliance Bot** built using **MessageKit** assists users based on their roles: **Manager**, **Compliance Officer**, and **User**. The bot utilizes advanced message routing and role-based access controls.

**Technical Details:**
- **Bot Address**: `0x9223a195cbaC6D5411367e7f316F900670a11d77`
- **Implementation**: Node.js with XMTP SDK
- **Event Listeners**: WebSocket-based event monitoring for real-time notifications
- **Command Parser**: NLP-based command recognition with role-specific permissions

To see available commands and functionality, simply type **"help"** in the conversation with the bot through **XMTP**.

<br />

1. **Compliance Officer**
   
![Compliance Bot](https://github.com/user-attachments/assets/477d95f5-53a4-4609-b2d5-c77e7b84dac9)

2. **Manager**

![Manager Report](https://github.com/user-attachments/assets/48b07db1-b548-463c-8d2d-323a4d8bab2c)

<br />

## For Testing the app 

1. Visit [https://secure-sign-x.vercel.app/](https://secure-sign-x.vercel.app/) and click on the connect wallet button, then visit the Dashboard.
   
2. If you are an employee upload your legal document like NDA.
   
3. You will get the notification regarding the attestation through the xmtp chat app, Access the chat app from here https://xmtp-chat-app.vercel.app/.

4. If you are the compliance officer, after you visit the dashboard click on **Attestation creation page**.

5. After attestation is created, a notification will be sent to the respective employer and the manager
