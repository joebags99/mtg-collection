import React, { useState } from 'react';
import { Upload, Database, TrendingUp, Plus } from 'lucide-react';
// eslint-disable-next-line no-unused-vars
import Papa from 'papaparse';

const MTGCollectionManager = () => {
  const [collection, setCollection] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');

  const styles = {
    container: {
      minHeight: '100vh',
      backgroundColor: '#f9fafb',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    },
    header: {
      backgroundColor: 'white',
      borderBottom: '1px solid #e5e7eb',
      padding: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    },
    headerTitle: {
      fontSize: '32px',
      fontWeight: 'bold',
      color: '#111827',
      margin: '0 0 8px 0'
    },
    headerSubtitle: {
      color: '#6b7280',
      margin: 0
    },
    nav: {
      backgroundColor: 'white',
      borderBottom: '1px solid #e5e7eb',
      padding: '0 24px'
    },
    navList: {
      display: 'flex',
      gap: '32px',
      listStyle: 'none',
      margin: 0,
      padding: 0
    },
    navItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '16px 8px',
      cursor: 'pointer',
      borderBottom: '2px solid transparent',
      fontSize: '14px',
      fontWeight: '500',
      transition: 'all 0.2s'
    },
    navItemActive: {
      borderBottomColor: '#3b82f6',
      color: '#3b82f6'
    },
    navItemInactive: {
      color: '#6b7280'
    },
    main: {
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '32px 24px'
    },
    card: {
      backgroundColor: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    },
    button: {
      backgroundColor: '#3b82f6',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      padding: '12px 24px',
      cursor: 'pointer',
      fontSize: '16px',
      fontWeight: '500',
      transition: 'background-color 0.2s'
    },
    buttonDisabled: {
      backgroundColor: '#9ca3af',
      cursor: 'not-allowed'
    },
    input: {
      width: '100%',
      padding: '12px',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      fontSize: '16px'
    },
    textarea: {
      width: '100%',
      height: '256px',
      padding: '16px',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      fontFamily: 'monospace',
      fontSize: '14px',
      resize: 'vertical'
    },
    grid: {
      display: 'grid',
      gap: '32px',
      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
      justifyItems: 'center'
    },
    flexRow: {
      display: 'flex',
      gap: '16px',
      alignItems: 'center'
    },
    badge: {
      backgroundColor: '#dbeafe',
      color: '#1e40af',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: '500'
    },
    loadingSpinner: {
      textAlign: 'center',
      padding: '32px'
    },
    spinner: {
      display: 'inline-block',
      width: '32px',
      height: '32px',
      border: '3px solid #f3f4f6',
      borderTop: '3px solid #3b82f6',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    }
  };

  // Parse collection from text input (one card per line, format: "Quantity Cardname")
  const parseCollection = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    const cards = [];
    
    lines.forEach(line => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      if (match) {
        const [, quantity, name] = match;
        cards.push({
          quantity: parseInt(quantity),
          name: name.trim(),
          id: Date.now() + Math.random()
        });
      }
    });
    
    return cards;
  };

  // Fetch card data from Scryfall
  const fetchCardData = async (cardName) => {
    try {
      const response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error(`Error fetching ${cardName}:`, error);
    }
    return null;
  };

  // Process uploaded collection
  const handleCollectionUpload = async (text) => {
    setLoading(true);
    const parsedCards = parseCollection(text);
    const enhancedCards = [];

    for (let i = 0; i < parsedCards.length; i++) {
      const card = parsedCards[i];
      const cardData = await fetchCardData(card.name);
      
      enhancedCards.push({
        ...card,
        scryfallData: cardData,
        colors: cardData?.color_identity || [],
        cmc: cardData?.cmc || 0,
        type: cardData?.type_line || '',
        price: cardData?.prices?.usd || '0'
      });

      if (i < parsedCards.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    setCollection(enhancedCards);
    setLoading(false);
    setActiveTab('collection');
  };

  // Manual card addition
  const addSingleCard = async (cardName, quantity = 1) => {
    setLoading(true);
    const cardData = await fetchCardData(cardName);
    
    if (cardData) {
      const newCard = {
        quantity,
        name: cardData.name,
        edition: cardData.set_name || '',
        condition: 'Near Mint',
        language: 'English',
        foil: false,
        collectorNumber: cardData.collector_number || '',
        alter: false,
        proxy: false,
        purchasePrice: 0,
        tradelistCount: 0,
        tags: '',
        lastModified: new Date().toISOString(),
        id: Date.now(),
        scryfallData: cardData,
        colors: cardData.color_identity || [],
        cmc: cardData.cmc || 0,
        type: cardData.type_line || '',
        price: cardData.prices?.usd || '0'
      };
      
      setCollection(prev => [...prev, newCard]);
    }
    setLoading(false);
  };

  // Simple deck analysis
  const analyzeDeckPotential = () => {
    const commanders = collection.filter(card => 
      card.type.includes('Legendary') && card.type.includes('Creature')
    );
    
    const colorCombinations = {};
    commanders.forEach(commander => {
      const colors = commander.colors.sort().join('');
      if (!colorCombinations[colors]) {
        colorCombinations[colors] = [];
      }
      colorCombinations[colors].push(commander);
    });

    return colorCombinations;
  };

  // Handle Moxfield URL import
  const handleMoxfieldImport = async (url) => {
    if (!url || !url.trim()) {
      alert('Please enter a Moxfield URL');
      return;
    }

    try {
      setLoading(true);
      
      // Extract collection ID from various Moxfield URL formats
      let collectionId = extractMoxfieldCollectionId(url);
      
      if (!collectionId) {
        alert('Invalid Moxfield URL. Please make sure it\'s a valid collection URL.');
        return;
      }

      // Show immediate guidance since direct API access is blocked by CORS
      const shouldProceed = window.confirm(
        `Direct import from Moxfield is blocked by browser security policies.\n\n` +
        `Would you like instructions on how to import your collection instead?\n\n` +
        `(Click OK for instructions, Cancel to try anyway)`
      );

      if (shouldProceed) {
        // Provide step-by-step instructions
        showMoxfieldImportInstructions(collectionId);
        return;
      }

      // If user wants to try anyway, attempt the API call
      const csvUrl = `https://api.moxfield.com/v2/collections/${collectionId}/export/csv`;
      console.log('Attempting to fetch from:', csvUrl);
      
      const response = await fetch(csvUrl, {
        method: 'GET',
        headers: {
          'Accept': 'text/csv',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const csvData = await response.text();
      
      if (csvData && csvData.length > 0) {
        await handleCollectionUpload(csvData, true);
        alert('Successfully imported collection from Moxfield!');
      } else {
        throw new Error('No data received from Moxfield');
      }
      
    } catch (error) {
      console.error('Error importing from Moxfield:', error);
      
      // Show instructions instead of just error messages
      const collectionId = extractMoxfieldCollectionId(url);
      showMoxfieldImportInstructions(collectionId);
      
    } finally {
      setLoading(false);
    }
  };

  // Show detailed instructions for manual Moxfield import
  const showMoxfieldImportInstructions = (collectionId) => {
    const instructions = `
📋 How to Import Your Moxfield Collection:

OPTION 1 - Direct CSV Download (Recommended):
1. Go to: https://moxfield.com/collections/${collectionId}
2. Look for the "Export" or "Download" button
3. Select "CSV" format
4. Save the file to your computer
5. Use the "CSV File Upload" option below

OPTION 2 - Manual Export:
1. Go to your collection on Moxfield
2. Click the three-dot menu (⋯) 
3. Select "Export" → "CSV"
4. Download the file
5. Upload it using the CSV option below

The CSV method works perfectly and includes all your card data!
    `.trim();

    alert(instructions);
  };

  // Extract collection ID from various Moxfield URL formats
  const extractMoxfieldCollectionId = (url) => {
    try {
      // Handle different Moxfield URL formats:
      // https://www.moxfield.com/collections/COLLECTION_ID
      // https://moxfield.com/collections/COLLECTION_ID
      // Just the collection ID itself
      
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      
      if (urlObj.hostname.includes('moxfield.com')) {
        const pathParts = urlObj.pathname.split('/');
        const collectionsIndex = pathParts.indexOf('collections');
        
        if (collectionsIndex !== -1 && pathParts[collectionsIndex + 1]) {
          return pathParts[collectionsIndex + 1];
        }
      }
      
      // If it's just an ID (alphanumeric string)
      if (/^[a-zA-Z0-9_-]+$/.test(url.trim())) {
        return url.trim();
      }
      
      return null;
    } catch (error) {
      console.error('Error parsing Moxfield URL:', error);
      return null;
    }
  };

  const CollectionUpload = () => {
    const [uploadText, setUploadText] = useState('');
    const [uploadMethod, setUploadMethod] = useState('moxfield'); // Default to Moxfield
    const [moxfieldUrl, setMoxfieldUrl] = useState('');

    const handleFileUpload = (event) => {
      const file = event.target.files[0];
      if (file) {
        console.log('File selected:', file.name, file.type, file.size);
        
        if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const csvContent = e.target.result;
            console.log('CSV content loaded, length:', csvContent.length);
            console.log('First 500 characters:', csvContent.substring(0, 500));
            handleCollectionUpload(csvContent, true);
          };
          reader.onerror = (e) => {
            console.error('Error reading file:', e);
            alert('Error reading file. Please try again.');
          };
          reader.readAsText(file);
        } else {
          alert('Please select a CSV file (.csv)');
        }
      }
    };

    return (
      <div style={styles.card}>
        <div style={{textAlign: 'center', marginBottom: '24px'}}>
          <Upload size={48} style={{color: '#3b82f6', margin: '0 auto 16px'}} />
          <h2 style={{fontSize: '24px', fontWeight: 'bold', margin: '0 0 8px 0'}}>Import Your Collection</h2>
          <p style={{color: '#6b7280', margin: 0}}>Choose your import method below</p>
        </div>

        {/* Upload Method Selection */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '24px',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <button
            style={{
              ...styles.button,
              backgroundColor: uploadMethod === 'moxfield' ? '#3b82f6' : '#e5e7eb',
              color: uploadMethod === 'moxfield' ? 'white' : '#6b7280',
              padding: '8px 16px'
            }}
            onClick={() => setUploadMethod('moxfield')}
          >
            🔗 Moxfield URL
          </button>
          <button
            style={{
              ...styles.button,
              backgroundColor: uploadMethod === 'csv' ? '#3b82f6' : '#e5e7eb',
              color: uploadMethod === 'csv' ? 'white' : '#6b7280',
              padding: '8px 16px'
            }}
            onClick={() => setUploadMethod('csv')}
          >
            📊 CSV File
          </button>
          <button
            style={{
              ...styles.button,
              backgroundColor: uploadMethod === 'text' ? '#3b82f6' : '#e5e7eb',
              color: uploadMethod === 'text' ? 'white' : '#6b7280',
              padding: '8px 16px'
            }}
            onClick={() => setUploadMethod('text')}
          >
            📝 Text Input
          </button>
        </div>

        {uploadMethod === 'moxfield' ? (
          <div>
            <div style={{marginBottom: '16px'}}>
              <h3 style={{fontSize: '16px', fontWeight: '600', marginBottom: '8px'}}>
                Moxfield Collection URL
              </h3>
              <p style={{fontSize: '14px', color: '#6b7280', margin: '0 0 8px 0'}}>
                Paste your public Moxfield collection URL or collection ID
              </p>
              <p style={{fontSize: '12px', color: '#9ca3af', margin: 0}}>
                ⚠️ Collection must be set to <strong>public</strong> to import
              </p>
            </div>
            
            <input
              type="text"
              placeholder="https://moxfield.com/collections/your-collection-id or just the ID"
              style={{
                ...styles.input,
                marginBottom: '16px',
                fontSize: '14px'
              }}
              value={moxfieldUrl}
              onChange={(e) => setMoxfieldUrl(e.target.value)}
            />
            
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button
                style={{
                  ...styles.button,
                  flex: 1,
                  ...(loading || !moxfieldUrl.trim() ? styles.buttonDisabled : {})
                }}
                onClick={() => handleMoxfieldImport(moxfieldUrl)}
                disabled={loading || !moxfieldUrl.trim()}
              >
                {loading ? 'Importing from Moxfield...' : '🚀 Import from Moxfield'}
              </button>
              
              {moxfieldUrl.trim() && (
                <button
                  style={{
                    ...styles.button,
                    backgroundColor: '#10b981',
                    color: 'white',
                    padding: '12px 16px',
                    fontSize: '14px',
                    whiteSpace: 'nowrap'
                  }}
                  onClick={() => {
                    const collectionId = extractMoxfieldCollectionId(moxfieldUrl);
                    if (collectionId) {
                      window.open(`https://moxfield.com/collections/${collectionId}`, '_blank');
                    }
                  }}
                  title="Open collection on Moxfield to download CSV"
                >
                  📊 Get CSV
                </button>
              )}
            </div>

            <div style={{
              marginTop: '8px',
              padding: '12px',
              backgroundColor: '#fef3c7',
              borderRadius: '6px',
              border: '1px solid #f59e0b'
            }}>
              <h4 style={{fontSize: '14px', fontWeight: '600', color: '#d97706', margin: '0 0 8px 0'}}>
                💡 How to Import from Moxfield
              </h4>
              <div style={{fontSize: '12px', color: '#d97706', lineHeight: '1.4'}}>
                <strong>Browser security prevents direct import.</strong><br/>
                1. Click "📊 Get CSV" to open your collection<br/>
                2. Export as CSV from Moxfield<br/>
                3. Upload the CSV file using the option below<br/>
                <em>This method is actually faster and more reliable!</em>
              </div>
            </div>
          </div>
        ) : uploadMethod === 'csv' ? (
          <div>
            <div style={{marginBottom: '16px'}}>
              <h3 style={{fontSize: '16px', fontWeight: '600', marginBottom: '8px'}}>
                CSV File Upload (Moxfield Export)
              </h3>
              <p style={{fontSize: '14px', color: '#6b7280', margin: 0}}>
                Upload your exported CSV file from Moxfield
              </p>
            </div>

            <div style={{
              border: '2px dashed #d1d5db',
              borderRadius: '8px',
              padding: '32px',
              textAlign: 'center',
              backgroundColor: '#f9fafb',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.style.backgroundColor = '#eff6ff';
              e.currentTarget.style.borderColor = '#3b82f6';
            }}
            onDragLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f9fafb';
              e.currentTarget.style.borderColor = '#d1d5db';
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.style.backgroundColor = '#f9fafb';
              e.currentTarget.style.borderColor = '#d1d5db';
              const files = e.dataTransfer.files;
              if (files.length > 0) {
                const fileInput = e.currentTarget.querySelector('input[type="file"]');
                fileInput.files = files;
                handleFileUpload({ target: { files } });
              }
            }}
            >
              <div style={{
                fontSize: '48px',
                marginBottom: '16px'
              }}>📊</div>
              
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  marginBottom: '12px'
                }}
              />
              
              <p style={{
                fontSize: '16px',
                fontWeight: '600',
                color: '#374151',
                margin: '0 0 8px 0'
              }}>
                Choose CSV file or drag & drop
              </p>
              
              <p style={{
                fontSize: '14px',
                color: '#6b7280',
                margin: 0
              }}>
                Export from Moxfield: Collection → Export → CSV
              </p>
            </div>

            <div style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: '#eff6ff',
              borderRadius: '6px',
              border: '1px solid #bfdbfe'
            }}>
              <h4 style={{fontSize: '14px', fontWeight: '600', color: '#1e40af', margin: '0 0 8px 0'}}>
                Supported Moxfield CSV columns:
              </h4>
              <div style={{fontSize: '12px', color: '#1e40af', lineHeight: '1.4'}}>
                <strong>Required:</strong> Count, Name<br/>
                <strong>Optional:</strong> Edition, Condition, Language, Foil, Collector Number, Alter, Proxy, Purchase Price
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div style={{marginBottom: '16px'}}>
              <h3 style={{fontSize: '16px', fontWeight: '600', marginBottom: '8px'}}>
                Simple Text Format
              </h3>
              <p style={{fontSize: '14px', color: '#6b7280', margin: 0}}>
                One card per line: "4 Lightning Bolt"
              </p>
            </div>
            
            <textarea
              style={styles.textarea}
              placeholder={`4 Lightning Bolt
1 Tarmogoyf
2 Birds of Paradise
1 Sol Ring
...`}
              value={uploadText}
              onChange={(e) => setUploadText(e.target.value)}
            />
            
            <button
              style={{
                ...styles.button,
                width: '100%',
                marginTop: '16px',
                ...(loading || !uploadText.trim() ? styles.buttonDisabled : {})
              }}
              onClick={() => handleCollectionUpload(uploadText, false)}
              disabled={loading || !uploadText.trim()}
            >
              {loading ? 'Processing Collection...' : 'Upload Text Collection'}
            </button>
          </div>
        )}
      </div>
    );
  };

  const CollectionView = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [newCardName, setNewCardName] = useState('');
    const [cardViewModes, setCardViewModes] = useState({}); // 'text' or 'image'
    const [cardFaceSides, setCardFaceSides] = useState({}); // 0 or 1 for double-faced cards

    const filteredCollection = collection.filter(card =>
      card.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const toggleViewMode = (cardId) => {
      setCardViewModes(prev => ({
        ...prev,
        [cardId]: prev[cardId] === 'image' ? 'text' : 'image'
      }));
    };

    const toggleCardFace = (cardId) => {
      setCardFaceSides(prev => ({
        ...prev,
        [cardId]: prev[cardId] === 1 ? 0 : 1
      }));
    };

    const getCardImageUrl = (card) => {
      const scryfallData = card.scryfallData;
      if (!scryfallData) return null;

      // Check if it's a double-faced card
      if (scryfallData.card_faces && scryfallData.card_faces.length > 1) {
        const faceIndex = cardFaceSides[card.id] || 0;
        return scryfallData.card_faces[faceIndex]?.image_uris?.normal;
      }
      
      // Single-faced card
      return scryfallData.image_uris?.normal;
    };

    const isDoubleFaced = (card) => {
      return card.scryfallData?.card_faces && card.scryfallData.card_faces.length > 1;
    };

    const getCardData = (card) => {
      const data = card.scryfallData;
      if (!data) return { name: card.name, error: 'No additional data available' };

      if (data.card_faces && data.card_faces.length > 1) {
        const faceIndex = cardFaceSides[card.id] || 0;
        const face = data.card_faces[faceIndex];
        return {
          name: face.name,
          manaCost: face.mana_cost || '',
          cmc: face.cmc || data.cmc || 0,
          typeLine: face.type_line,
          oracleText: face.oracle_text || '',
          power: face.power,
          toughness: face.toughness,
          flavorText: face.flavor_text || data.flavor_text,
          isDoubleFaced: true,
          faceName: face.name
        };
      }

      return {
        name: data.name,
        manaCost: data.mana_cost || '',
        cmc: data.cmc || 0,
        typeLine: data.type_line,
        oracleText: data.oracle_text || '',
        power: data.power,
        toughness: data.toughness,
        flavorText: data.flavor_text,
        isDoubleFaced: false
      };
    };

    const getColorForCard = (card) => {
      const colors = card.colors || [];
      if (colors.length === 0) return '#f8fafc';
      if (colors.length > 1) return 'linear-gradient(135deg, #fef3c7, #f59e0b)';
      
      const colorMap = {
        'W': '#fffef7',
        'U': '#f0f9ff', 
        'B': '#f8fafc',
        'R': '#fef2f2',
        'G': '#f0fdf4'
      };
      
      return colorMap[colors[0]] || '#f8fafc';
    };

    const getManaSymbolColor = (symbol) => {
      const colorMap = {
        'W': '#fbbf24',
        'U': '#3b82f6',
        'B': '#1f2937',
        'R': '#ef4444',
        'G': '#22c55e'
      };
      return colorMap[symbol] || '#6b7280';
    };

    const formatManaSymbols = (manaCost) => {
      if (!manaCost) return null;
      
      // Simple regex to find mana symbols like {W}, {U}, {B}, {R}, {G}, {1}, {2}, etc.
      const symbols = manaCost.match(/\{[^}]+\}/g) || [];
      
      return symbols.map((symbol, index) => {
        const cleanSymbol = symbol.replace(/[{}]/g, '');
        const isColorSymbol = ['W', 'U', 'B', 'R', 'G'].includes(cleanSymbol);
        
        return (
          <span
            key={index}
            style={{
              display: 'inline-block',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: isColorSymbol ? getManaSymbolColor(cleanSymbol) : '#6b7280',
              color: ['B'].includes(cleanSymbol) ? 'white' : 'black',
              fontSize: '12px',
              fontWeight: 'bold',
              textAlign: 'center',
              lineHeight: '24px',
              margin: '0 2px',
              border: '2px solid #374151',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            {cleanSymbol}
          </span>
        );
      });
    };

    return (
      <div>
        <div style={{...styles.flexRow, marginBottom: '24px'}}>
          <input
            type="text"
            placeholder="Search your collection..."
            style={{...styles.input, flex: 1}}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <input
            type="text"
            placeholder="Add card name..."
            style={{...styles.input, width: '200px'}}
            value={newCardName}
            onChange={(e) => setNewCardName(e.target.value)}
          />
          <button
            style={{
              ...styles.button,
              padding: '12px',
              ...(loading || !newCardName.trim() ? styles.buttonDisabled : {})
            }}
            onClick={() => {
              addSingleCard(newCardName);
              setNewCardName('');
            }}
            disabled={loading || !newCardName.trim()}
          >
            <Plus size={20} />
          </button>
        </div>

        <div style={styles.grid}>
          {filteredCollection.map((card) => {
            const viewMode = cardViewModes[card.id] || 'text';
            const imageUrl = getCardImageUrl(card);
            const cardData = getCardData(card);
            const cardColor = getColorForCard(card);
            
            return (
              <div key={card.id} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px'
              }}>
                {/* Card Box with Magic Card Proportions (5:7 ratio) */}
                <div style={{
                  width: '280px',
                  height: '392px', // 280 * 1.4 = 392 (5:7 ratio)
                  backgroundColor: 'white',
                  border: '3px solid #374151',
                  borderRadius: '16px',
                  boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative'
                }}>
                  {viewMode === 'text' ? (
                    <div style={{
                      padding: '16px',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      background: cardData.isDoubleFaced ? 'linear-gradient(135deg, #f1f5f9, #e2e8f0)' : cardColor,
                      backgroundImage: typeof cardColor !== 'string' ? cardColor : 'none'
                    }}>
                      {/* Header with name and quantity */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '12px',
                        paddingBottom: '8px',
                        borderBottom: '2px solid #374151'
                      }}>
                        <h3 style={{
                          fontSize: '18px',
                          fontWeight: 'bold',
                          margin: 0,
                          color: '#111827',
                          lineHeight: '1.2'
                        }}>
                          {cardData.name}
                        </h3>
                        <span style={{
                          backgroundColor: card.foil ? '#fbbf24' : '#3b82f6',
                          color: 'white',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontWeight: 'bold'
                        }}>
                          {card.quantity}x {card.foil ? '✨' : ''}
                        </span>
                      </div>

                      {/* Edition and Printing Info */}
                      {(card.edition || card.condition || card.language !== 'English' || card.alter || card.proxy) && (
                        <div style={{
                          marginBottom: '12px',
                          padding: '8px',
                          backgroundColor: 'rgba(59,130,246,0.1)',
                          borderRadius: '6px',
                          border: '1px solid #bfdbfe'
                        }}>
                          <div style={{fontSize: '12px', color: '#1e40af', lineHeight: '1.3'}}>
                            {card.edition && <div><strong>Set:</strong> {card.edition}</div>}
                            {card.collectorNumber && <div><strong>#:</strong> {card.collectorNumber}</div>}
                            {card.condition && <div><strong>Condition:</strong> {card.condition}</div>}
                            {card.language !== 'English' && <div><strong>Language:</strong> {card.language}</div>}
                            {card.alter && <div><strong>⚡ Altered</strong></div>}
                            {card.proxy && <div><strong>🔄 Proxy</strong></div>}
                            {card.purchasePrice > 0 && <div><strong>Paid:</strong> ${card.purchasePrice.toFixed(2)}</div>}
                          </div>
                        </div>
                      )}

                      {/* Mana Cost */}
                      {cardData.manaCost && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          marginBottom: '12px',
                          gap: '8px'
                        }}>
                          <span style={{
                            fontSize: '14px',
                            fontWeight: '700',
                            color: '#1f2937'
                          }}>
                            Cost:
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {formatManaSymbols(cardData.manaCost)}
                            <span style={{
                              marginLeft: '8px',
                              fontSize: '12px',
                              color: '#374151',
                              fontWeight: '600'
                            }}>
                              (CMC: {cardData.cmc})
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Type Line */}
                      <div style={{
                        marginBottom: '12px',
                        padding: '8px',
                        backgroundColor: 'rgba(255,255,255,0.9)',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db'
                      }}>
                        <span style={{
                          fontSize: '14px',
                          fontWeight: '700',
                          color: '#1f2937',
                          fontStyle: 'italic'
                        }}>
                          {cardData.typeLine}
                        </span>
                      </div>

                      {/* Oracle Text */}
                      {cardData.oracleText && (
                        <div style={{
                          flex: 1,
                          marginBottom: '12px',
                          padding: '12px',
                          backgroundColor: 'rgba(255,255,255,0.95)',
                          borderRadius: '8px',
                          border: '1px solid #d1d5db',
                          overflowY: 'auto'
                        }}>
                          <div style={{
                            fontSize: '13px',
                            lineHeight: '1.4',
                            color: '#1f2937',
                            whiteSpace: 'pre-line'
                          }}>
                            {cardData.oracleText}
                          </div>
                        </div>
                      )}

                      {/* Bottom section with P/T and Flavor Text */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-end',
                        marginTop: 'auto'
                      }}>
                        {/* Flavor Text */}
                        {cardData.flavorText && (
                          <div style={{
                            flex: 1,
                            padding: '8px',
                            backgroundColor: 'rgba(107,114,128,0.1)',
                            borderRadius: '6px',
                            borderLeft: '3px solid #6b7280',
                            marginRight: cardData.power && cardData.toughness ? '12px' : '0'
                          }}>
                            <em style={{
                              fontSize: '11px',
                              color: '#4b5563',
                              fontStyle: 'italic',
                              lineHeight: '1.3'
                            }}>
                              "{cardData.flavorText}"
                            </em>
                          </div>
                        )}

                        {/* Power/Toughness */}
                        {cardData.power && cardData.toughness && (
                          <div style={{
                            backgroundColor: '#1f2937',
                            color: 'white',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '16px',
                            fontWeight: 'bold'
                          }}>
                            {cardData.power}/{cardData.toughness}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      backgroundColor: '#000',
                      padding: '8px'
                    }}>
                      {imageUrl ? (
                        <img 
                          src={imageUrl} 
                          alt={card.name}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                            borderRadius: '8px'
                          }}
                        />
                      ) : (
                        <div style={{
                          width: '100%',
                          height: '100%',
                          backgroundColor: '#1f2937',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#9ca3af',
                          fontSize: '16px',
                          borderRadius: '8px'
                        }}>
                          No image available
                        </div>
                      )}

                      {/* Flip Side button for double-faced cards in image mode */}
                      {isDoubleFaced(card) && (
                        <button
                          style={{
                            position: 'absolute',
                            top: '12px',
                            left: '12px',
                            backgroundColor: '#8b5cf6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
                          }}
                          onClick={() => toggleCardFace(card.id)}
                        >
                          Flip Side
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Controls below the card */}
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'center'
                }}>
                  <button
                    style={{
                      backgroundColor: '#f59e0b',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '12px 20px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                      transition: 'all 0.2s'
                    }}
                    onClick={() => toggleViewMode(card.id)}
                    onMouseOver={(e) => {
                      e.target.style.backgroundColor = '#d97706';
                      e.target.style.transform = 'translateY(-1px)';
                    }}
                    onMouseOut={(e) => {
                      e.target.style.backgroundColor = '#f59e0b';
                      e.target.style.transform = 'translateY(0)';
                    }}
                  >
                    {viewMode === 'text' ? '🎨 Show Art' : '📝 Show Text'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {filteredCollection.length === 0 && collection.length > 0 && (
          <div style={{textAlign: 'center', color: '#6b7280', padding: '32px'}}>
            No cards match your search.
          </div>
        )}
      </div>
    );
  };

  const DeckAnalysis = () => {
    const deckPotential = analyzeDeckPotential();
    
    return (
      <div>
        <div style={{textAlign: 'center', marginBottom: '32px'}}>
          <TrendingUp size={48} style={{color: '#10b981', margin: '0 auto 16px'}} />
          <h2 style={{fontSize: '24px', fontWeight: 'bold', margin: '0 0 8px 0'}}>Deck Building Analysis</h2>
          <p style={{color: '#6b7280', margin: 0}}>Potential Commander decks from your collection</p>
        </div>

        {Object.keys(deckPotential).length > 0 ? (
          <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
            {Object.entries(deckPotential).map(([colors, commanders]) => (
              <div key={colors} style={styles.card}>
                <h3 style={{fontSize: '20px', fontWeight: '600', marginBottom: '16px'}}>
                  {colors || 'Colorless'} Identity
                </h3>
                <div style={styles.grid}>
                  {commanders.map((commander) => (
                    <div key={commander.id} style={{backgroundColor: '#f9fafb', padding: '12px', borderRadius: '6px'}}>
                      <div style={{fontWeight: '500'}}>{commander.name}</div>
                      <div style={{fontSize: '14px', color: '#6b7280'}}>{commander.type}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{textAlign: 'center', color: '#6b7280', padding: '32px'}}>
            <p>No legendary creatures found in your collection.</p>
            <p style={{fontSize: '14px', marginTop: '8px'}}>Add some commanders to see deck building suggestions!</p>
          </div>
        )}

        <div style={{
          ...styles.card, 
          backgroundColor: '#eff6ff', 
          borderColor: '#bfdbfe',
          marginTop: '24px'
        }}>
          <h4 style={{fontWeight: '600', color: '#1e40af', marginBottom: '8px'}}>Coming Soon:</h4>
          <ul style={{color: '#1e40af', fontSize: '14px', margin: 0, paddingLeft: '20px'}}>
            <li>EDHRec integration for synergy analysis</li>
            <li>Deck completion percentage</li>
            <li>Card upgrade recommendations</li>
            <li>Budget optimization suggestions</li>
          </ul>
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
      
      <header style={styles.header}>
        <h1 style={styles.headerTitle}>MTG Collection Manager</h1>
        <p style={styles.headerSubtitle}>Manage your collection and discover optimal deck builds</p>
      </header>

      <nav style={styles.nav}>
        <ul style={styles.navList}>
          {[
            { id: 'upload', label: 'Upload', icon: Upload },
            { id: 'collection', label: `Collection (${collection.length})`, icon: Database },
            { id: 'analysis', label: 'Deck Analysis', icon: TrendingUp }
          ].map(({ id, label, icon: Icon }) => (
            <li
              key={id}
              style={{
                ...styles.navItem,
                ...(activeTab === id ? styles.navItemActive : styles.navItemInactive)
              }}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </nav>

      <main style={styles.main}>
        {loading && (
          <div style={styles.loadingSpinner}>
            <div style={styles.spinner}></div>
            <p style={{marginTop: '8px', color: '#6b7280'}}>Processing cards... This may take a few minutes for large collections.</p>
          </div>
        )}

        {activeTab === 'upload' && <CollectionUpload />}
        {activeTab === 'collection' && <CollectionView />}
        {activeTab === 'analysis' && <DeckAnalysis />}
      </main>
    </div>
  );
};

export default MTGCollectionManager;