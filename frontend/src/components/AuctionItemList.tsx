import styled from "styled-components";
import { AuctionItem } from "../types/auction"; // Import type definition for AuctionItem

// Styled component for the container holding the list of auction items
const ListContainer = styled.div`
  width: 30%;
  min-width: 280px;
  background-color: #f8f9fa;
  border-radius: 5px;
  padding: 15px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

// Styled component for the title of the auction item list
const ListTitle = styled.h2`
  color: #2c3e50;
  margin-top: 0;
  padding-bottom: 10px;
  border-bottom: 1px solid #ddd;
`;

// Styled component for the unordered list that holds the item cards
const ItemsList = styled.ul`
  list-style-type: none;
  padding: 0;
  margin: 0;
`;

// Styled component for an individual auction item card within the list
// It accepts a 'selected' prop to change appearance when the item is selected
const ItemCard = styled.li<{ selected: boolean }>`
  padding: 15px;
  margin-bottom: 10px;
  border-radius: 5px;
  cursor: pointer;
  // Conditional styling based on the 'selected' prop
  background-color: ${(props) =>
    props.selected
      ? "#3498db"
      : "white"}; // Blue background if selected, white otherwise
  color: ${(props) =>
    props.selected
      ? "white"
      : "inherit"}; // White text if selected, default otherwise
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); // Subtle shadow
  transition: all 0.2s ease; // Smooth transition for hover effects

  // Hover effect: slightly lift the card and increase shadow
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }
`;

// Styled component for the name of the auction item within the card
const ItemName = styled.h3`
  margin: 0 0 5px 0;
  font-size: 18px;
`;

// Styled component for displaying the current bid price within the card
const ItemPrice = styled.div`
  font-weight: bold;
  color: inherit;
`;

// Styled component for displaying a loading message or spinner
const LoadingSpinner = styled.div`
  text-align: center;
  padding: 20px;
  color: #7f8c8d;
`;

// Props interface for the AuctionItemList component
interface AuctionItemListProps {
  items: AuctionItem[]; // Array of auction items to display
  isLoading: boolean; // Flag indicating if items are currently being loaded
  selectedItemId?: number; // Optional ID of the currently selected item (for highlighting)
  onSelectItem: (item: AuctionItem) => void; // Callback function when an item is clicked/selected
}

// AuctionItemList functional component
const AuctionItemList: React.FC<AuctionItemListProps> = ({
  items,
  isLoading,
  selectedItemId,
  onSelectItem,
}) => {
  // If data is loading, display the loading spinner
  if (isLoading) {
    return (
      <ListContainer>
        <ListTitle>Auction Items</ListTitle>
        <LoadingSpinner>Loading items...</LoadingSpinner>
      </ListContainer>
    );
  }

  // If loading is finished, render the list of items
  return (
    <ListContainer>
      <ListTitle>Auction Items</ListTitle>
      {/* Check if there are any items to display */}
      {items.length === 0 ? (
        <p>No auction items available.</p> // Message shown when the list is empty
      ) : (
        <ItemsList>
          {/* Map through the items array and render an ItemCard for each */}
          {items.map((item) => (
            <ItemCard
              key={item.id} // Unique key for each item card
              // Determine if this card should be styled as 'selected'
              selected={item.id === selectedItemId}
              // Attach the click handler, passing the clicked item to the callback
              onClick={() => onSelectItem(item)}
            >
              <ItemName>{item.name}</ItemName>
              {/* Display item description */}
              <p>{item.description}</p>
              <ItemPrice>Current Bid: ${item.currentBid}</ItemPrice>
            </ItemCard>
          ))}
        </ItemsList>
      )}
    </ListContainer>
  );
};

export default AuctionItemList;
