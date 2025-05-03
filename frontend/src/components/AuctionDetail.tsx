import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { AuctionItem } from "../types/auction"; // Import type definition for AuctionItem
import { placeBid } from "../services/api"; // Import function to place bids via REST API
import websocketService from "../services/websocket"; // Import WebSocket service instance

// Styled component for the main container of the auction detail view
const DetailContainer = styled.div`
  flex: 1;
  background-color: #f8f9fa;
  border-radius: 5px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

// Styled component for the header section displaying item name and description
const ItemHeader = styled.div`
  border-bottom: 1px solid #ddd;
  padding-bottom: 15px;
  margin-bottom: 15px;
`;

// Styled component for the item name (h2)
const ItemName = styled.h2`
  color: #2c3e50;
  margin-top: 0;
  margin-bottom: 10px;
`;

// Styled component for the item description (paragraph)
const ItemDescription = styled.p`
  color: #7f8c8d;
  margin-bottom: 20px;
`;

// Styled component for the section displaying bid information
const BidInfo = styled.div`
  margin-bottom: 20px;
`;

// Styled component for displaying the current highest bid
const CurrentBid = styled.div`
  font-size: 24px;
  font-weight: bold;
  color: #27ae60;
  margin-bottom: 10px;
`;

// Styled component for displaying the starting bid
const StartingBid = styled.div`
  color: #7f8c8d;
  font-size: 14px;
`;

// Styled component for the bid submission form
const BidForm = styled.form`
  margin-top: 20px;
  display: flex;
  flex-direction: column;
`;

// Styled component for the bid amount input field
const BidInput = styled.input`
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 5px;
  margin-bottom: 10px;
  font-size: 16px;
`;

// Styled component for the bid submission buttons (REST and WebSocket)
// Uses a prop '$isRest' to conditionally style the button
const BidButton = styled.button<{ $isRest: boolean }>`
  padding: 10px 15px;
  border: none;
  border-radius: 5px;
  background-color: ${(props) =>
    props.$isRest ? "#3498db" : "#e74c3c"}; // Blue for REST, Red for WebSocket
  color: white;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.3s;
  margin-bottom: 10px;

  &:hover {
    background-color: ${(props) =>
      props.$isRest ? "#2980b9" : "#c0392b"}; // Darker shade on hover
  }

  &:disabled {
    background-color: #95a5a6; // Grey out when disabled
    cursor: not-allowed;
  }
`;

// Styled component for the bid history section
const BidHistory = styled.div`
  margin-top: 30px;
`;

// Styled component for the title of the bid history section
const BidHistoryTitle = styled.h3`
  color: #2c3e50;
  border-bottom: 1px solid #ddd;
  padding-bottom: 10px;
`;

// Styled component for the unordered list containing bid history items
const BidList = styled.ul`
  list-style-type: none;
  padding: 0;
  max-height: 200px; // Limit height and enable scrolling
  overflow-y: auto;
`;

// Styled component for an individual bid item in the history list
const BidItem = styled.li`
  padding: 10px;
  border-bottom: 1px solid #eee;

  &:last-child {
    border-bottom: none; // Remove border from the last item
  }
`;

// Styled component for displaying the bid amount within a bid item
const BidAmount = styled.span`
  font-weight: bold;
  color: #16a085;
`;

// Styled component for displaying the bidder's name within a bid item
const BidderName = styled.span`
  color: #2c3e50;
`;

// Styled component for displaying the bid timestamp within a bid item
const BidTime = styled.span`
  color: #7f8c8d;
  font-size: 12px;
  float: right; // Align timestamp to the right
`;

// Styled component for displaying error messages related to bidding
const ErrorMessage = styled.div`
  padding: 10px;
  background-color: #f8d7da; // Light red background for errors
  color: #721c24; // Dark red text color
  border-radius: 5px;
  margin-bottom: 10px;
`;

// Props interface for the AuctionDetail component
interface AuctionDetailProps {
  item: AuctionItem; // The auction item to display details for
  bidderName: string; // The name of the current user placing bids
  websocketConnected: boolean; // Status of the WebSocket connection
}

// AuctionDetail functional component
const AuctionDetail: React.FC<AuctionDetailProps> = ({
  item,
  bidderName,
  websocketConnected,
}) => {
  // State for the bid amount input field, initialized slightly above current bid
  const [bidAmount, setBidAmount] = useState<string>("");
  // State to track if a bid is currently being placed (disables buttons)
  const [isPlacingBid, setIsPlacingBid] = useState<boolean>(false);
  // State to store and display bidding-related error messages
  const [error, setError] = useState<string | null>(null);

  // Effect to update the default bid amount when the item changes
  useEffect(() => {
    // Set default bid amount to current bid + 10 or starting bid if no bids yet
    const defaultBid =
      item.bids.length > 0 ? item.currentBid + 10 : item.startingBid;
    setBidAmount(defaultBid.toString());
  }, [item]); // Re-run when the item prop changes

  // Utility function to format a date string into a locale time string
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleTimeString(); // Example: "10:30:45 AM"
  };

  // Handler for changes in the bid amount input field
  const handleBidAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBidAmount(e.target.value);
    setError(null); // Clear previous errors when user types
  };

  // Common bid validation logic
  const validateBid = (bidValue: number): boolean => {
    if (isNaN(bidValue) || bidValue <= item.currentBid) {
      setError(
        `Bid must be higher than the current bid of $${item.currentBid}`
      );
      return false;
    }
    if (!bidderName || bidderName.trim() === "" || bidderName === "Anonymous") {
      setError("Please enter your name before placing a bid.");
      return false;
    }
    setError(null); // Clear error if validation passes
    return true;
  };

  // Handler for submitting a bid using the REST API
  const handleRestBid = async (e: React.FormEvent) => {
    e.preventDefault(); // Prevent default form submission behavior

    const bidValue = parseFloat(bidAmount);
    if (!validateBid(bidValue)) return; // Validate the bid amount

    try {
      setIsPlacingBid(true); // Disable buttons while processing

      // Call the API service function to place the bid
      await placeBid(item.id, bidValue, bidderName);

      // Bid placed successfully via REST. WebSocket update will refresh the UI.
      // No need to manually update bidAmount here as the useEffect handles it when `item` updates.
    } catch (err) {
      console.error("Error placing REST bid:", err);
      setError("Failed to place bid via REST. Please try again.");
    } finally {
      setIsPlacingBid(false); // Re-enable buttons
    }
  };

  // Handler for submitting a bid using WebSocket
  const handleWebSocketBid = (e: React.FormEvent) => {
    e.preventDefault(); // Prevent default form submission behavior

    const bidValue = parseFloat(bidAmount);
    if (!validateBid(bidValue)) return; // Validate the bid amount

    // Check if WebSocket is connected before attempting to send
    if (!websocketConnected) {
      setError("WebSocket is not connected. Cannot place bid via WebSocket.");
      return;
    }

    try {
      setIsPlacingBid(true); // Disable buttons temporarily

      // Send the bid details over the WebSocket connection
      websocketService.sendBid(item.id, bidValue, bidderName);

      // Bid sent via WebSocket. Server will broadcast update.
      // No need to manually update bidAmount here as the useEffect handles it when `item` updates.
    } catch (err) {
      // This catch block might be less likely to trigger for send errors,
      // as WebSocket send is often fire-and-forget. Errors might come via onError handler.
      console.error("Error placing WebSocket bid:", err);
      setError("Failed to send bid via WebSocket. Please try again.");
    } finally {
      // Re-enable button slightly faster for WebSocket as it's fire-and-forget
      setIsPlacingBid(false);
    }
  };

  // Render the auction item details UI
  return (
    <DetailContainer>
      {/* Item Header */}
      <ItemHeader>
        <ItemName>{item.name}</ItemName>
        <ItemDescription>{item.description}</ItemDescription>
      </ItemHeader>

      {/* Current Bid Information */}
      <BidInfo>
        <CurrentBid>Current Bid: ${item.currentBid}</CurrentBid>
        <StartingBid>Starting Bid: ${item.startingBid}</StartingBid>
      </BidInfo>

      {/* Display Bidding Errors */}
      {error && <ErrorMessage>{error}</ErrorMessage>}

      {/* Bid Form for REST API */}
      <BidForm onSubmit={handleRestBid}>
        <BidInput
          type="number"
          value={bidAmount}
          onChange={handleBidAmountChange}
          placeholder="Enter your bid amount"
          min={item.currentBid + 1} // Minimum allowed bid
          step="1" // Increment step
          required
        />
        <BidButton
          type="submit"
          // Disable if bid is being placed by 'Anonymous', or if no bidder name is entered
          disabled={isPlacingBid || !bidderName || bidderName === "Anonymous"}
          $isRest={true} // Style as REST button
        >
          Place Bid via REST API
        </BidButton>
      </BidForm>

      {/* Bid Form for WebSocket */}
      <BidForm onSubmit={handleWebSocketBid}>
        {/* Note: Input is shared, only button triggers WebSocket */}
        <BidButton
          type="submit"
          // Disable if bid is being placed by 'Anonymous', no bidder name, or WebSocket is disconnected
          disabled={
            isPlacingBid ||
            !bidderName ||
            bidderName === "Anonymous" ||
            !websocketConnected
          }
          $isRest={false} // Style as WebSocket button
        >
          Place Bid via WebSocket
        </BidButton>
      </BidForm>

      {/* Bid History Section */}
      <BidHistory>
        <BidHistoryTitle>Bid History ({item.bids.length})</BidHistoryTitle>
        {item.bids.length === 0 ? (
          <p>No bids yet. Be the first to bid!</p>
        ) : (
          <BidList>
            {/* Sort bids descending by timestamp and map to list items */}
            {[...item.bids] // Create a shallow copy before sorting
              .sort(
                (a, b) =>
                  new Date(b.timestamp).getTime() -
                  new Date(a.timestamp).getTime()
              )
              .map((bid) => (
                <BidItem key={bid.id}>
                  <BidAmount>${bid.amount}</BidAmount> by{" "}
                  <BidderName>{bid.bidder}</BidderName>
                  <BidTime>{formatDate(bid.timestamp)}</BidTime>
                </BidItem>
              ))}
          </BidList>
        )}
      </BidHistory>
    </DetailContainer>
  );
};

export default AuctionDetail;
