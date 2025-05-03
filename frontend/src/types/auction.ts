/**
 * Represents a single bid placed on an auction item.
 */
export interface Bid {
  id: number; // Unique identifier for this specific bid.
  itemId: number; // The ID of the AuctionItem this bid belongs to.
  bidder: string; // Identifier for the user who placed the bid (e.g., name, username).
  amount: number; // The monetary value of the bid.
  timestamp: string; // Formatted date string indicating when the bid was placed.
}

/**
 * Represents an item being auctioned.
 */
export interface AuctionItem {
  id: number; // Unique identifier for this auction item.
  name: string; // The display name of the item.
  description: string; // A detailed description of the item.
  startingBid: number; // The initial price required to start bidding.
  currentBid: number; // The highest bid amount currently placed on the item.
  // This might be equal to startingBid if no bids have been placed yet.
  bids: Bid[]; // An array containing all the Bid objects placed on this item.
  // Typically sorted by timestamp or amount.
}

/**
 * Represents the structure of messages exchanged over the WebSocket connection.
 * The 'type' property determines the purpose and content of the message.
 */
export interface WebSocketMessage {
  /**
   * The type of the message, indicating its purpose.
   * - 'INITIAL_DATA': Sent by the server upon client connection, contains all current auction items.
   * - 'BID_UPDATE': Sent by the server when a new bid is successfully placed on an item. Contains the updated item and the new bid.
   * - 'NEW_BID': Sent by the client to the server when attempting to place a bid.
   * - 'ERROR': Sent by the server to the client to report an issue (e.g., invalid bid, server error).
   * - 'HEARTBEAT': Sent by the client (ping) and server (pong) to keep the connection alive and detect disconnections.
   */
  type: "INITIAL_DATA" | "BID_UPDATE" | "NEW_BID" | "ERROR" | "HEARTBEAT";

  // Optional fields, present depending on the message 'type':

  /** Included in 'INITIAL_DATA' messages. Contains the full list of current auction items. */
  items?: AuctionItem[];

  /** Included in 'BID_UPDATE' messages. Contains the complete state of the item after the new bid. */
  item?: AuctionItem;

  /** Included in 'BID_UPDATE' messages. Contains details of the newly placed bid. */
  bid?: Bid;

  /** Included in 'NEW_BID' messages sent from the client. */
  itemId?: number;
  /** Included in 'NEW_BID' messages sent from the client. */
  bidAmount?: number;
  /** Included in 'NEW_BID' messages sent from the client. */
  bidder?: string;

  /** Included in 'ERROR' messages. Contains a description of the error. */
  message?: string;
}
