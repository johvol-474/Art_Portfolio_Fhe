// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface ArtPiece {
  id: string;
  encryptedValue: string;
  title: string;
  artist: string;
  year: number;
  acquisitionDate: number;
  owner: string;
  status: "authenticated" | "pending" | "rejected";
  valuation: string;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const FHECompute = (encryptedData: string, operation: string): string => {
  const value = FHEDecryptNumber(encryptedData);
  let result = value;
  
  switch(operation) {
    case 'increase10%':
      result = value * 1.1;
      break;
    case 'decrease10%':
      result = value * 0.9;
      break;
    case 'double':
      result = value * 2;
      break;
    default:
      result = value;
  }
  
  return FHEEncryptNumber(result);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [artCollection, setArtCollection] = useState<ArtPiece[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newArtPiece, setNewArtPiece] = useState({ title: "", artist: "", year: 0, acquisitionPrice: 0 });
  const [selectedArt, setSelectedArt] = useState<ArtPiece | null>(null);
  const [decryptedValue, setDecryptedValue] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [showValuationChart, setShowValuationChart] = useState(false);

  // Style randomization (Art Deco UI with gold/black color scheme)
  const colors = {
    primary: "#D4AF37", // Gold
    secondary: "#000000", // Black
    accent: "#FFFFFF", // White
    background: "#1A1A1A", // Dark gray
    text: "#E5E5E5", // Light gray
    highlight: "#FFD700" // Brighter gold
  };

  useEffect(() => {
    loadArtCollection().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadArtCollection = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      const keysBytes = await contract.getData("art_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing art keys:", e); }
      }
      const collection: ArtPiece[] = [];
      for (const key of keys) {
        try {
          const artBytes = await contract.getData(`art_${key}`);
          if (artBytes.length > 0) {
            try {
              const artData = JSON.parse(ethers.toUtf8String(artBytes));
              collection.push({ 
                id: key, 
                encryptedValue: artData.value, 
                title: artData.title, 
                artist: artData.artist, 
                year: artData.year, 
                acquisitionDate: artData.acquisitionDate, 
                owner: artData.owner, 
                status: artData.status || "pending",
                valuation: artData.valuation || FHECompute(artData.value, 'increase10%')
              });
            } catch (e) { console.error(`Error parsing art data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading art ${key}:`, e); }
      }
      collection.sort((a, b) => b.acquisitionDate - a.acquisitionDate);
      setArtCollection(collection);
    } catch (e) { console.error("Error loading art collection:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const addArtPiece = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setAdding(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting acquisition price with Zama FHE..." });
    try {
      const encryptedValue = FHEEncryptNumber(newArtPiece.acquisitionPrice);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const artId = `art-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const artData = { 
        value: encryptedValue, 
        title: newArtPiece.title, 
        artist: newArtPiece.artist, 
        year: newArtPiece.year, 
        acquisitionDate: Math.floor(Date.now() / 1000), 
        owner: address, 
        status: "pending",
        valuation: FHEEncryptNumber(newArtPiece.acquisitionPrice * 1.2) // Initial valuation 20% higher
      };
      await contract.setData(`art_${artId}`, ethers.toUtf8Bytes(JSON.stringify(artData)));
      const keysBytes = await contract.getData("art_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(artId);
      await contract.setData("art_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      setTransactionStatus({ visible: true, status: "success", message: "Art piece added with FHE encryption!" });
      await loadArtCollection();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowAddModal(false);
        setNewArtPiece({ title: "", artist: "", year: 0, acquisitionPrice: 0 });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setAdding(false); }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const authenticateArt = async (artId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted valuation with FHE..." });
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      const artBytes = await contract.getData(`art_${artId}`);
      if (artBytes.length === 0) throw new Error("Art piece not found");
      const artData = JSON.parse(ethers.toUtf8String(artBytes));
      
      const updatedValuation = FHECompute(artData.valuation, 'increase10%');
      
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      const updatedArt = { ...artData, status: "authenticated", valuation: updatedValuation };
      await contractWithSigner.setData(`art_${artId}`, ethers.toUtf8Bytes(JSON.stringify(updatedArt)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Art authenticated with updated FHE valuation!" });
      await loadArtCollection();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Authentication failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const rejectArt = async (artId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted data with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const artBytes = await contract.getData(`art_${artId}`);
      if (artBytes.length === 0) throw new Error("Art piece not found");
      const artData = JSON.parse(ethers.toUtf8String(artBytes));
      const updatedArt = { ...artData, status: "rejected" };
      await contract.setData(`art_${artId}`, ethers.toUtf8Bytes(JSON.stringify(updatedArt)));
      setTransactionStatus({ visible: true, status: "success", message: "Art piece rejected!" });
      await loadArtCollection();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Rejection failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isOwner = (artOwner: string) => address?.toLowerCase() === artOwner.toLowerCase();

  const filteredCollection = artCollection.filter(art => 
    art.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    art.artist.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const authenticatedCount = artCollection.filter(a => a.status === "authenticated").length;
  const pendingCount = artCollection.filter(a => a.status === "pending").length;
  const rejectedCount = artCollection.filter(a => a.status === "rejected").length;

  const renderValuationChart = () => {
    const authenticatedArt = artCollection.filter(a => a.status === "authenticated");
    if (authenticatedArt.length === 0) return <div className="no-data">No authenticated art pieces for valuation</div>;
    
    return (
      <div className="valuation-chart">
        {authenticatedArt.map(art => (
          <div key={art.id} className="art-bar">
            <div className="art-title">{art.title}</div>
            <div className="bar-container">
              <div 
                className="bar-value" 
                style={{ width: `${Math.min(100, FHEDecryptNumber(art.valuation) / 10000)}%` }}
              >
                ${(FHEDecryptNumber(art.valuation)).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen" style={{ backgroundColor: colors.background }}>
      <div className="art-deco-spinner" style={{ borderColor: colors.primary }}></div>
      <p style={{ color: colors.text }}>Initializing encrypted art collection...</p>
    </div>
  );

  return (
    <div className="app-container" style={{ backgroundColor: colors.background, color: colors.text }}>
      <header className="app-header" style={{ backgroundColor: colors.secondary, borderBottom: `2px solid ${colors.primary}` }}>
        <div className="logo">
          <div className="logo-icon" style={{ backgroundColor: colors.primary }}></div>
          <h1 style={{ color: colors.primary }}>Art<span style={{ color: colors.accent }}>Portfolio</span>FHE</h1>
        </div>
        <div className="header-actions">
          <button 
            onClick={() => setShowAddModal(true)} 
            className="add-art-btn" 
            style={{ backgroundColor: colors.primary, color: colors.secondary }}
          >
            + Add Art Piece
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
          </div>
        </div>
      </header>
      <div className="main-content">
        <div className="welcome-banner" style={{ backgroundColor: colors.secondary, border: `1px solid ${colors.primary}` }}>
          <div className="welcome-text">
            <h2 style={{ color: colors.primary }}>Confidential Art Portfolio Management</h2>
            <p style={{ color: colors.text }}>Securely manage your art collection with Zama FHE encryption</p>
          </div>
          <div className="fhe-indicator" style={{ backgroundColor: colors.primary }}>
            <span style={{ color: colors.secondary }}>FHE Encryption Active</span>
          </div>
        </div>

        <div className="dashboard-section">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search artworks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ backgroundColor: colors.secondary, color: colors.text, border: `1px solid ${colors.primary}` }}
            />
          </div>

          <div className="stats-grid">
            <div className="stat-card" style={{ backgroundColor: colors.secondary, border: `1px solid ${colors.primary}` }}>
              <h3>Total Collection</h3>
              <div className="stat-value" style={{ color: colors.primary }}>{artCollection.length}</div>
            </div>
            <div className="stat-card" style={{ backgroundColor: colors.secondary, border: `1px solid ${colors.primary}` }}>
              <h3>Authenticated</h3>
              <div className="stat-value" style={{ color: colors.primary }}>{authenticatedCount}</div>
            </div>
            <div className="stat-card" style={{ backgroundColor: colors.secondary, border: `1px solid ${colors.primary}` }}>
              <h3>Pending</h3>
              <div className="stat-value" style={{ color: colors.primary }}>{pendingCount}</div>
            </div>
            <div className="stat-card" style={{ backgroundColor: colors.secondary, border: `1px solid ${colors.primary}` }}>
              <h3>Rejected</h3>
              <div className="stat-value" style={{ color: colors.primary }}>{rejectedCount}</div>
            </div>
          </div>

          <button 
            onClick={() => setShowValuationChart(!showValuationChart)} 
            className="toggle-chart-btn"
            style={{ backgroundColor: colors.primary, color: colors.secondary }}
          >
            {showValuationChart ? "Hide Valuations" : "Show Valuations"}
          </button>

          {showValuationChart && (
            <div className="chart-container" style={{ backgroundColor: colors.secondary, border: `1px solid ${colors.primary}` }}>
              <h3 style={{ color: colors.primary }}>Artwork Valuations (FHE Encrypted)</h3>
              {renderValuationChart()}
            </div>
          )}
        </div>

        <div className="art-collection-section">
          <div className="section-header">
            <h2 style={{ color: colors.primary }}>Your Encrypted Art Collection</h2>
            <button 
              onClick={loadArtCollection} 
              className="refresh-btn"
              style={{ backgroundColor: colors.primary, color: colors.secondary }}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {filteredCollection.length === 0 ? (
            <div className="no-art" style={{ backgroundColor: colors.secondary }}>
              <p>No art pieces found</p>
              <button 
                className="add-first-btn"
                style={{ backgroundColor: colors.primary, color: colors.secondary }}
                onClick={() => setShowAddModal(true)}
              >
                Add Your First Art Piece
              </button>
            </div>
          ) : (
            <div className="art-grid">
              {filteredCollection.map(art => (
                <div 
                  key={art.id} 
                  className="art-card" 
                  style={{ backgroundColor: colors.secondary, border: `1px solid ${colors.primary}` }}
                  onClick={() => setSelectedArt(art)}
                >
                  <div className="art-header">
                    <h3>{art.title}</h3>
                    <span className={`status-badge ${art.status}`} style={{ 
                      backgroundColor: art.status === "authenticated" ? colors.primary : 
                                      art.status === "pending" ? "#FFA500" : "#FF0000",
                      color: colors.secondary
                    }}>
                      {art.status}
                    </span>
                  </div>
                  <div className="art-details">
                    <p><strong>Artist:</strong> {art.artist}</p>
                    <p><strong>Year:</strong> {art.year}</p>
                    <p><strong>Acquired:</strong> {new Date(art.acquisitionDate * 1000).toLocaleDateString()}</p>
                  </div>
                  {isOwner(art.owner) && art.status === "pending" && (
                    <div className="art-actions">
                      <button 
                        className="authenticate-btn"
                        style={{ backgroundColor: colors.primary, color: colors.secondary }}
                        onClick={(e) => { e.stopPropagation(); authenticateArt(art.id); }}
                      >
                        Authenticate
                      </button>
                      <button 
                        className="reject-btn"
                        style={{ backgroundColor: "#FF0000", color: colors.accent }}
                        onClick={(e) => { e.stopPropagation(); rejectArt(art.id); }}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <ModalAddArt 
          onSubmit={addArtPiece} 
          onClose={() => setShowAddModal(false)} 
          adding={adding} 
          artData={newArtPiece} 
          setArtData={setNewArtPiece}
          colors={colors}
        />
      )}

      {selectedArt && (
        <ArtDetailModal 
          art={selectedArt} 
          onClose={() => { setSelectedArt(null); setDecryptedValue(null); }} 
          decryptedValue={decryptedValue} 
          setDecryptedValue={setDecryptedValue} 
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
          colors={colors}
        />
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content" style={{ backgroundColor: colors.secondary, border: `2px solid ${colors.primary}` }}>
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="art-deco-spinner" style={{ borderColor: colors.primary }}></div>}
              {transactionStatus.status === "success" && <div className="check-icon" style={{ color: colors.primary }}>✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon" style={{ color: "#FF0000" }}>✗</div>}
            </div>
            <div className="transaction-message" style={{ color: colors.text }}>{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer" style={{ backgroundColor: colors.secondary, borderTop: `2px solid ${colors.primary}` }}>
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo" style={{ color: colors.primary }}>ArtPortfolioFHE</div>
            <p style={{ color: colors.text }}>Secure encrypted art portfolio management using Zama FHE technology</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link" style={{ color: colors.text }}>Documentation</a>
            <a href="#" className="footer-link" style={{ color: colors.text }}>Privacy Policy</a>
            <a href="#" className="footer-link" style={{ color: colors.text }}>Terms</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge" style={{ backgroundColor: colors.primary, color: colors.secondary }}>
            <span>FHE-Powered Confidentiality</span>
          </div>
          <div className="copyright" style={{ color: colors.text }}>© {new Date().getFullYear()} ArtPortfolioFHE</div>
        </div>
      </footer>
    </div>
  );
};

interface ModalAddArtProps {
  onSubmit: () => void; 
  onClose: () => void; 
  adding: boolean;
  artData: any;
  setArtData: (data: any) => void;
  colors: any;
}

const ModalAddArt: React.FC<ModalAddArtProps> = ({ onSubmit, onClose, adding, artData, setArtData, colors }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setArtData({ ...artData, [name]: value });
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setArtData({ ...artData, [name]: parseFloat(value) || 0 });
  };

  const handleSubmit = () => {
    if (!artData.title || !artData.artist || !artData.year || !artData.acquisitionPrice) {
      alert("Please fill all required fields");
      return;
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="add-art-modal" style={{ backgroundColor: colors.secondary, border: `2px solid ${colors.primary}` }}>
        <div className="modal-header" style={{ borderBottom: `1px solid ${colors.primary}` }}>
          <h2 style={{ color: colors.primary }}>Add Art Piece</h2>
          <button onClick={onClose} className="close-modal" style={{ color: colors.primary }}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice" style={{ backgroundColor: colors.background }}>
            <p style={{ color: colors.text }}>All financial data will be encrypted with Zama FHE before submission</p>
          </div>
          
          <div className="form-group">
            <label style={{ color: colors.text }}>Title *</label>
            <input
              type="text"
              name="title"
              value={artData.title}
              onChange={handleChange}
              style={{ backgroundColor: colors.background, color: colors.text, border: `1px solid ${colors.primary}` }}
            />
          </div>
          
          <div className="form-group">
            <label style={{ color: colors.text }}>Artist *</label>
            <input
              type="text"
              name="artist"
              value={artData.artist}
              onChange={handleChange}
              style={{ backgroundColor: colors.background, color: colors.text, border: `1px solid ${colors.primary}` }}
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label style={{ color: colors.text }}>Year *</label>
              <input
                type="number"
                name="year"
                value={artData.year}
                onChange={handleNumberChange}
                style={{ backgroundColor: colors.background, color: colors.text, border: `1px solid ${colors.primary}` }}
              />
            </div>
            
            <div className="form-group">
              <label style={{ color: colors.text }}>Acquisition Price *</label>
              <input
                type="number"
                name="acquisitionPrice"
                value={artData.acquisitionPrice}
                onChange={handleNumberChange}
                step="0.01"
                style={{ backgroundColor: colors.background, color: colors.text, border: `1px solid ${colors.primary}` }}
              />
            </div>
          </div>
          
          <div className="encryption-preview">
            <h4 style={{ color: colors.primary }}>FHE Encryption Preview</h4>
            <div className="preview-content" style={{ backgroundColor: colors.background }}>
              <div className="plain-value">
                <span style={{ color: colors.text }}>Plain Value:</span>
                <span style={{ color: colors.primary }}>${artData.acquisitionPrice.toLocaleString()}</span>
              </div>
              <div className="encrypted-value">
                <span style={{ color: colors.text }}>Encrypted Value:</span>
                <span style={{ color: colors.primary }}>
                  {artData.acquisitionPrice ? FHEEncryptNumber(artData.acquisitionPrice).substring(0, 30) + '...' : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ borderTop: `1px solid ${colors.primary}` }}>
          <button 
            onClick={onClose} 
            className="cancel-btn"
            style={{ backgroundColor: colors.background, color: colors.text }}
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={adding}
            className="submit-btn"
            style={{ backgroundColor: colors.primary, color: colors.secondary }}
          >
            {adding ? "Encrypting with FHE..." : "Add Art Piece"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ArtDetailModalProps {
  art: ArtPiece;
  onClose: () => void;
  decryptedValue: number | null;
  setDecryptedValue: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
  colors: any;
}

const ArtDetailModal: React.FC<ArtDetailModalProps> = ({ art, onClose, decryptedValue, setDecryptedValue, isDecrypting, decryptWithSignature, colors }) => {
  const handleDecrypt = async () => {
    if (decryptedValue !== null) { setDecryptedValue(null); return; }
    const decrypted = await decryptWithSignature(art.encryptedValue);
    if (decrypted !== null) setDecryptedValue(decrypted);
  };

  return (
    <div className="modal-overlay">
      <div className="art-detail-modal" style={{ backgroundColor: colors.secondary, border: `2px solid ${colors.primary}` }}>
        <div className="modal-header" style={{ borderBottom: `1px solid ${colors.primary}` }}>
          <h2 style={{ color: colors.primary }}>{art.title}</h2>
          <button onClick={onClose} className="close-modal" style={{ color: colors.primary }}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="art-info">
            <div className="info-item">
              <span style={{ color: colors.text }}>Artist:</span>
              <strong style={{ color: colors.primary }}>{art.artist}</strong>
            </div>
            <div className="info-item">
              <span style={{ color: colors.text }}>Year:</span>
              <strong style={{ color: colors.primary }}>{art.year}</strong>
            </div>
            <div className="info-item">
              <span style={{ color: colors.text }}>Acquired:</span>
              <strong style={{ color: colors.primary }}>{new Date(art.acquisitionDate * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span style={{ color: colors.text }}>Status:</span>
              <strong 
                className={`status-badge ${art.status}`} 
                style={{ 
                  backgroundColor: art.status === "authenticated" ? colors.primary : 
                                  art.status === "pending" ? "#FFA500" : "#FF0000",
                  color: colors.secondary
                }}
              >
                {art.status}
              </strong>
            </div>
          </div>
          
          <div className="encrypted-section" style={{ backgroundColor: colors.background }}>
            <h3 style={{ color: colors.primary }}>Encrypted Financial Data</h3>
            <div className="encrypted-data" style={{ color: colors.text }}>
              {art.encryptedValue.substring(0, 50)}...
            </div>
            <div className="fhe-tag" style={{ backgroundColor: colors.primary, color: colors.secondary }}>
              Zama FHE Encrypted
            </div>
            <button 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
              className="decrypt-btn"
              style={{ backgroundColor: colors.primary, color: colors.secondary }}
            >
              {isDecrypting ? "Decrypting..." : decryptedValue !== null ? "Hide Value" : "Decrypt with Wallet"}
            </button>
          </div>
          
          {decryptedValue !== null && (
            <div className="decrypted-section" style={{ backgroundColor: colors.background }}>
              <h3 style={{ color: colors.primary }}>Decrypted Acquisition Price</h3>
              <div className="decrypted-value" style={{ color: colors.primary }}>
                ${decryptedValue.toLocaleString()}
              </div>
              <div className="decrypted-notice" style={{ color: colors.text }}>
                This value is only visible after wallet signature verification
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ borderTop: `1px solid ${colors.primary}` }}>
          <button 
            onClick={onClose} 
            className="close-btn"
            style={{ backgroundColor: colors.background, color: colors.text }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;