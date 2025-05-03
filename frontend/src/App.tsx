import { useEffect, useState } from "react";
import styled from "styled-components";
import { AuctionItem } from "./types/auction";
import { fetchAllItems } from "./services/api";
import websocketService from "./services/websocket";
import AuctionItemList from "./components/AuctionItemList";
import AuctionDetail from "./components/AuctionDetail";

// Styled component for the main application container
const AppContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
`;

// Styled component for the application header
const Header = styled.header`
  background-color: #2c3e50;
  color: white;
  padding: 20px;
  border-radius: 5px;
  margin-bottom: 20px;
  text-align: center;
`;

// Styled component to display WebSocket connection status
const ConnectionStatus = styled.div<{ $connected: boolean }>`
  display: inline-block;
  padding: 5px 10px;
  border-radius: 20px;
  font-size: 14px;
  margin-top: 10px;
  background-color: ${(props) => (props.$connected ? "#27ae60" : "#e74c3c")};
  color: white;
`;

// Styled component for the main content area, arranging children in a row (or column on small screens)
const MainContent = styled.div`
  display: flex;
  gap: 20px;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

// Styled component for the application footer
const Footer = styled.footer`
  text-align: center;
  margin-top: 20px;
  padding: 10px;
  color: #7f8c8d;
  font-size: 14px;
`;

// Main application component
function App() {
  // State for storing the list of auction items
  const [items, setItems] = useState<AuctionItem[]>([]);
  // State for the currently selected auction item
  const [selectedItem, setSelectedItem] = useState<AuctionItem | null>(null);
  // State to track if items are being loaded from the API
  const [isLoadingItems, setIsLoadingItems] = useState<boolean>(true);
  // State to track WebSocket connection status
  const [isConnected, setIsConnected] = useState<boolean>(false);
  // State for the user's bidding name
  const [bidderName, setBidderName] = useState<string>("Anonymous");
  // State for displaying error messages
  const [error, setError] = useState<string | null>(null);

  // Effect hook to load auction items via REST API on initial component mount
  useEffect(() => {
    const loadItems = async () => {
      try {
        setIsLoadingItems(true);
        const data = await fetchAllItems(); // Fetch items from the API service
        setItems(data);
        setIsLoadingItems(false);
      } catch (error) {
        console.error("Error fetching items:", error);
        setError("Failed to load auction items. Please try again later.");
        setIsLoadingItems(false);
      }
    };

    loadItems();
  }, []); // Empty dependency array ensures this runs only once on mount

  // Effect hook to set up and manage the WebSocket connection
  useEffect(() => {
    // Register callback for WebSocket connection status changes
    websocketService.onConnect((connected) => {
      setIsConnected(connected);

      // Display an error message if the connection is lost
      if (!connected) {
        setError("WebSocket connection lost. Attempting to reconnect...");
      } else {
        setError(null); // Clear error on successful connection
      }
    });

    // Register callback for receiving initial data when WebSocket connects
    websocketService.onInitialData((initialItems) => {
      setItems(initialItems);
      // Automatically select the first item if none is selected
      if (!selectedItem && initialItems.length > 0) {
        setSelectedItem(initialItems[0]);
      }
    });

    // Register callback for handling real-time item updates from WebSocket
    websocketService.onItemUpdate((updatedItem) => {
      // Update the item in the local state list
      setItems((prevItems) =>
        prevItems.map((item) =>
          item.id === updatedItem.id ? updatedItem : item
        )
      );

      // If the updated item is the currently selected one, update the selectedItem state
      if (selectedItem && selectedItem.id === updatedItem.id) {
        setSelectedItem(updatedItem);
      }
    });

    // Register callback for handling errors received via WebSocket
    websocketService.onError((message) => {
      setError(message);
      // Automatically clear the error message after 5 seconds
      setTimeout(() => setError(null), 5000);
    });

    // Initiate the WebSocket connection
    websocketService.connect();

    // Cleanup function: Disconnect WebSocket when the component unmounts
    return () => {
      websocketService.disconnect();
    };
  }, []); // Empty dependency array for single initialization

  // Effect hook to ensure the selected item details are up-to-date
  // This runs whenever the `items` list or `selectedItem` changes
  useEffect(() => {
    // If an item is selected, find its latest version in the `items` list
    if (selectedItem) {
      const updatedSelectedItem = items.find(
        (item) => item.id === selectedItem.id
      );
      // If found, update the `selectedItem` state to reflect the latest data
      if (updatedSelectedItem) {
        setSelectedItem(updatedSelectedItem);
      }
    }
    // Dependencies: re-run this effect if `items` or `selectedItem` reference changes
  }, [items, selectedItem]);

  // Handler function to update the selected item when a user clicks on an item in the list
  const handleSelectItem = (item: AuctionItem) => {
    setSelectedItem(item);
  };

  // Handler function to update the bidder name state when the input field changes
  const handleBidderNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBidderName(e.target.value);
  };

  // Render the main application UI
  return (
    <AppContainer>
      <Header>
        <h1>Live Auction Platform</h1>
        {/* Display connection status */}
        <ConnectionStatus $connected={isConnected}>
          {isConnected
            ? "Connected to Live Updates"
            : "Disconnected - Trying to reconnect..."}
        </ConnectionStatus>
      </Header>

      {/* Display error messages if any */}
      {error && (
        <div
          style={{
            padding: "10px",
            backgroundColor: "#f8d7da",
            color: "#721c24",
            borderRadius: "5px",
            marginBottom: "20px",
          }}
        >
          {error}
        </div>
      )}

      {/* Input field for the user to enter their name */}
      <div style={{ marginBottom: "20px" }}>
        <label htmlFor="bidderName" style={{ marginRight: "10px" }}>
          Your Name:{" "}
        </label>
        <input
          type="text"
          id="bidderName"
          value={bidderName}
          onChange={handleBidderNameChange}
          placeholder="Enter your name"
          style={{ padding: "5px", width: "200px" }}
        />
      </div>

      {/* Main content area with item list and details */}
      <MainContent>
        {/* Component to display the list of auction items */}
        <AuctionItemList
          items={items}
          isLoading={isLoadingItems}
          selectedItemId={selectedItem?.id} // Pass the ID of the selected item
          onSelectItem={handleSelectItem} // Pass the handler function for item selection
        />

        {/* Component to display details of the selected item (only if an item is selected) */}
        {selectedItem && (
          <AuctionDetail
            item={selectedItem}
            bidderName={bidderName} // Pass the current bidder name
            websocketConnected={isConnected} // Pass WebSocket connection status
          />
        )}
      </MainContent>

      {/* Application footer */}
      <Footer>
        <p>Live Auction Platform - Demo for WebSocket Seminar</p>
      </Footer>
    </AppContainer>
  );
}

export default App;
