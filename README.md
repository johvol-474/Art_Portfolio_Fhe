# Art portfolio management system powered by Zama's FHE technology 🎨🔒

This project is an innovative platform for high-end art collectors, designed to manage and trade confidential art collection portfolios. It harnesses **Zama's Fully Homomorphic Encryption (FHE) technology** to ensure that the entire collection, including details such as ownership and cost basis, is encrypted, providing an unparalleled level of privacy and security for wealth proofing, loans, or bundled transactions.

## Addressing the Need for Confidentiality in Art Investments 🖼️

In the contemporary world of art investment, confidentiality and security have become paramount concerns. High-value artworks require a secure method for collectors to prove ownership and manage their portfolios without exposing sensitive information to third parties. The existing systems often lack adequate privacy measures, leaving collectors vulnerable to potential threats and market manipulation.

## The FHE-Powered Solution: Privacy Meets Art 💡

By implementing **Zama's open-source libraries**, such as **Concrete**, **TFHE-rs**, and the **zama-fhe SDK**, this project allows art collectors to manage and trade their portfolios while keeping their collection details confidential. FHE enables computations on encrypted data, meaning that collectors can verify ownership and make transactions without ever revealing sensitive information. This revolutionary approach not only protects collectors’ privacy but also empowers them with secure financial tools tailored for the art market.

## Core Features 🌟

- **FHE Encryption of Art Collections:** All collection details, including artworks and their cost basis, are encrypted to protect the owner's privacy.
- **Asset Bundling for DeFi:** Art collections can be aggregated and used as collateral in decentralized finance platforms, thus unlocking the value of these assets securely.
- **Secure Wealth Proofing:** Collectors can provide proof of ownership and asset value without revealing sensitive information.
- **Professional Financial Tools:** The platform offers bespoke financial instruments designed specifically for the art market, providing collectors with better investment strategies.

## Technology Stack 🛠️

- **Zama FHE SDK (zama-fhe SDK)**: The core component for confidential computing.
- **Node.js**: For backend server implementation.
- **Hardhat/Foundry**: For Ethereum smart contract development and deployment.
- **PostgreSQL**: For secure data storage of encrypted collections.
- **React.js**: For the front-end user interface, providing a responsive dashboard for art collection management.

## Directory Structure 📁

```plaintext
Art_Portfolio_Fhe/
├── contracts/
│   ├── Art_Portfolio_Fhe.sol
├── src/
│   ├── index.js
│   ├── components/
│   │   ├── Dashboard.js
│   │   ├── Collection.js
├── tests/
│   ├── ArtPortfolio.test.js
├── package.json
├── README.md
```

## Installation Guide 🚀

To set up the project, follow these steps:

1. Ensure you have **Node.js** installed.
2. Ensure you have **Hardhat** or **Foundry** set up in your development environment for smart contract compilation.
3. Download the project files (do **not** use `git clone`).
4. Navigate to the project directory via your terminal.
5. Run the following command to install necessary dependencies:

   ```bash
   npm install
   ```

This will fetch the required Zama FHE libraries and other dependencies to get the project up and running.

## Build & Run Guide ⚙️

After installing the dependencies, compile the smart contracts and start the application:

1. Compile the smart contracts:

   ```bash
   npx hardhat compile
   ```

2. Run tests to ensure everything is functioning as expected:

   ```bash
   npx hardhat test
   ```

3. Start the backend server:

   ```bash
   node src/index.js
   ```

4. Open your browser and navigate to `http://localhost:3000` to access the dashboard and manage your art portfolio.

### Example Code Snippet 📜

Here's a quick example of how you might interact with the smart contract to add a new piece of art to your collection:

```javascript
import { ethers } from 'ethers';
import { ArtPortfolioFhe } from './contracts/Art_Portfolio_Fhe.sol';

const provider = new ethers.providers.Web3Provider(window.ethereum);
const signer = provider.getSigner();
const contract = new ethers.Contract(artPortfolioAddress, ArtPortfolioFhe.abi, signer);

async function addArtPiece(title, cost) {
    const tx = await contract.addArtPiece(title, cost);
    await tx.wait();
    console.log(`Successfully added ${title} to your collection!`);
}
```

Replace `artPortfolioAddress` with the actual deployed contract address before running the function.

## Acknowledgements 🙏

This project is made possible by the pioneering efforts of the Zama team. Their innovative work and open-source tools enable the creation of confidential blockchain applications, making it feasible for platforms like this to thrive and provide exceptional value to users in the art investment space. Thank you, Zama, for empowering developers and collectors alike with powerful privacy tools!
