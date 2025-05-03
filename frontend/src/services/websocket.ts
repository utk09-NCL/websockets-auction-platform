/**
 * WebSocket Service
 *
 * This service manages the WebSocket connection between the client (frontend)
 * and the server (backend) for real-time communication in the auction platform.
 *
 * Responsibilities:
 * - Establishing and maintaining the WebSocket connection.
 * - Automatically attempting to reconnect if the connection is lost unexpectedly.
 * - Implementing a heartbeat mechanism to keep the connection alive
 *   and detect silent disconnections.
 * - Sending messages (like new bids) from the client to the server.
 * - Receiving messages (like item updates, initial data, errors) from the server.
 * - Providing a way for UI components to register callback functions to react
 *   to specific WebSocket events (e.g., connection status changes, new data).
 */

import { AuctionItem, Bid, WebSocketMessage } from "../types/auction";

// Define the URL for the WebSocket server. Assumes it runs on localhost:3000.
const WS_URL = "ws://localhost:3000";

// Configuration constants for timing intervals (in milliseconds)
const HEARTBEAT_INTERVAL = 30000; // Send a heartbeat ping every 30 seconds
const RECONNECT_INTERVAL = 3000; // Wait 3 seconds before attempting to reconnect

class WebSocketService {
  // Holds the WebSocket instance. Null if not connected or attempting to connect.
  private socket: WebSocket | null = null;

  // Arrays to store callback functions registered by UI components
  private connectionCallbacks: ((connected: boolean) => void)[] = []; // For connection status changes
  private itemUpdateCallbacks: ((item: AuctionItem) => void)[] = []; // For auction item updates
  private bidUpdateCallbacks: ((bid: Bid) => void)[] = []; // For new bid notifications (optional, often covered by itemUpdate)
  private initialDataCallbacks: ((items: AuctionItem[]) => void)[] = []; // For receiving the initial list of items
  private errorCallbacks: ((message: string) => void)[] = []; // For server-sent error messages

  // Timer IDs used for managing intervals and timeouts. Need to be cleared on disconnect.
  private heartbeatInterval: number | null = null; // Stores the ID of the heartbeat interval timer
  private reconnectTimeout: number | null = null; // Stores the ID of the reconnect timeout timer

  // Flag to indicate if the disconnection was initiated by the client (e.g., user navigating away)
  // Prevents automatic reconnection attempts after an intentional disconnect.
  private intentionalClosure = false;

  /**
   * Establishes a WebSocket connection to the server defined by WS_URL.
   * Sets up event listeners for open, message, error, and close events.
   */
  connect() {
    // If a reconnect attempt is scheduled, cancel it as we are now explicitly connecting.
    if (this.reconnectTimeout) {
      window.clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Prevent multiple connections: If already connected or connecting, do nothing.
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      console.log(
        "WebSocket connection attempt ignored: Already connected or connecting."
      );
      return;
    }

    console.log(`Attempting to connect WebSocket to ${WS_URL}...`);
    this.intentionalClosure = false; // Reset flag as this is a new connection attempt
    this.socket = new WebSocket(WS_URL); // Create the WebSocket object

    /**
     * Called when the WebSocket connection is successfully opened.
     */
    this.socket.onopen = () => {
      console.log("WebSocket connected successfully.");
      this.notifyConnectionChange(true); // Inform listeners that connection is up
      this.setupHeartbeat(); // Start sending heartbeats to keep connection alive
    };

    /**
     * Called when a message is received from the WebSocket server.
     * Parses the message and routes it based on its 'type'.
     */
    this.socket.onmessage = (event) => {
      try {
        // Parse the incoming message (expected to be JSON)
        const data: WebSocketMessage = JSON.parse(event.data as string);

        // Log received message for debugging
        // console.log('WebSocket message received:', data);

        // Handle heartbeat  messages from the server (part of keep-alive)
        if (data.type === "HEARTBEAT") {
          console.log("Heartbeat received.");
          return; // No action needed, just confirms connection is alive
        }

        // Route the message to the appropriate callback arrays based on its type
        switch (data.type) {
          // Initial data payload sent upon successful connection
          case "INITIAL_DATA":
            if (data.items) {
              console.log("Received initial auction items.");
              this.initialDataCallbacks.forEach((callback) =>
                callback(data.items!)
              );
            }
            break;

          // Update triggered by a new bid on an item
          case "BID_UPDATE":
            // Notify listeners about the updated item
            if (data.item) {
              console.log(`Received update for item ID: ${data.item.id}`);
              this.itemUpdateCallbacks.forEach((callback) =>
                callback(data.item!)
              );
            }
            // Optionally, notify listeners specifically about the new bid itself
            if (data.bid) {
              this.bidUpdateCallbacks.forEach((callback) =>
                callback(data.bid!)
              );
            }
            break;

          // Error message sent from the server (e.g., invalid bid)
          case "ERROR":
            if (data.message) {
              console.warn("Received error message from server:", data.message);
              this.errorCallbacks.forEach((callback) =>
                callback(data.message!)
              );
            }
            break;

          // Handle unknown message types gracefully
          default: {
            // Use unknown and type assertion for safer access
            const unknownData = data as unknown as { type?: string };
            console.warn(
              "Received unknown WebSocket message type:",
              unknownData.type ?? "undefined"
            );
            break;
          }
        }
      } catch (error) {
        console.error(
          "Failed to parse WebSocket message or invalid message format:",
          event.data,
          error
        );
      }
    };

    /**
     * Called when a WebSocket error occurs (e.g., connection cannot be established).
     */
    this.socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      // Assume connection is lost on error
      this.notifyConnectionChange(false);
    };

    /**
     * Called when the WebSocket connection is closed, either intentionally or due to an error/network issue.
     */
    this.socket.onclose = (event) => {
      console.log(
        `WebSocket closed. Code: ${event.code}, Reason: "${event.reason}", Intentional: ${this.intentionalClosure}`
      );
      this.clearHeartbeat(); // Stop sending heartbeats
      this.notifyConnectionChange(false); // Inform listeners that connection is down
      this.socket = null; // Clear the socket instance

      // If the closure was not intentional (e.g., network drop), attempt to reconnect.
      if (!this.intentionalClosure) {
        this.scheduleReconnect();
      }
    };
  }

  /**
   * Sets up a periodic heartbeat (ping) message to be sent to the server.
   * This helps keep the connection alive through intermediaries (like proxies)
   * and allows the client/server to detect if the connection has dropped silently.
   */
  setupHeartbeat() {
    this.clearHeartbeat(); // Clear any existing heartbeat timer

    this.heartbeatInterval = window.setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try {
          // Send a simple heartbeat message
          // console.log("Sending heartbeat.");
          this.socket.send(JSON.stringify({ type: "HEARTBEAT" }));
        } catch (e) {
          console.error("Failed to send heartbeat ping:", e);
          // If sending fails, assume connection is broken
          this.notifyConnectionChange(false);
          this.scheduleReconnect(); // Attempt to reconnect
          this.clearHeartbeat(); // Stop trying to send heartbeats on a broken socket
        }
      } else {
        // If the socket is not open when the interval fires, connection is likely down.
        console.warn("Heartbeat check failed: WebSocket is not open.");
        this.notifyConnectionChange(false);
        this.scheduleReconnect(); // Attempt to reconnect
        this.clearHeartbeat(); // Stop the timer
      }
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Clears the interval timer responsible for sending heartbeats.
   * Should be called on disconnect or before setting up a new heartbeat.
   */
  clearHeartbeat() {
    if (this.heartbeatInterval !== null) {
      // console.log('Clearing heartbeat interval.');
      window.clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Schedules an attempt to reconnect to the WebSocket server after a delay.
   * Avoids scheduling multiple reconnect attempts simultaneously.
   */
  scheduleReconnect() {
    // Only schedule if a reconnect isn't already scheduled and the closure wasn't intentional
    if (!this.reconnectTimeout && !this.intentionalClosure) {
      console.log(
        `Scheduling WebSocket reconnect attempt in ${
          RECONNECT_INTERVAL / 1000
        } seconds...`
      );
      this.reconnectTimeout = window.setTimeout(() => {
        console.log("Attempting WebSocket reconnect now...");
        this.reconnectTimeout = null; // Clear the timeout ID before attempting connection
        this.connect(); // Try to establish a new connection
      }, RECONNECT_INTERVAL);
    }
  }

  /**
   * Intentionally disconnects the WebSocket connection.
   * Cleans up timers and prevents automatic reconnection attempts.
   * Should be called when the service is no longer needed (e.g., component unmount).
   */
  disconnect() {
    console.log("Disconnecting WebSocket intentionally.");
    this.intentionalClosure = true; // Mark closure as intentional
    this.clearHeartbeat(); // Stop heartbeats

    // Cancel any pending reconnect attempt
    if (this.reconnectTimeout) {
      window.clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // If the socket exists and is open or connecting, close it.
    if (this.socket) {
      if (
        this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING
      ) {
        this.socket.close(1000, "Client disconnecting"); // 1000 is standard code for normal closure
      }
      this.socket = null; // Clear the reference
    }

    // Ensure listeners are notified of the disconnection
    this.notifyConnectionChange(false);
  }

  /**
   * Sends a new bid message to the server via the WebSocket connection.
   * @param itemId - The ID of the item being bid on.
   * @param bidAmount - The amount of the bid.
   * @param bidder - The name of the bidder.
   */
  sendBid(itemId: number, bidAmount: number, bidder: string) {
    // Check if the socket exists and is open before sending
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        console.log(
          `Sending new bid via WebSocket: Item ${itemId}, Amount ${bidAmount}, Bidder ${bidder}`
        );
        this.socket.send(
          JSON.stringify({
            type: "NEW_BID", // Message type indicating a new bid
            itemId,
            bidAmount,
            bidder,
          })
        );
      } catch (e) {
        console.error("Failed to send bid via WebSocket:", e);
        // Optionally notify user via error callback
        this.errorCallbacks.forEach((callback) =>
          callback("Failed to send bid. Please check your connection.")
        );
      }
    } else {
      // If not connected, notify the user and attempt to reconnect
      console.error("Cannot send bid: WebSocket is not connected.");
      this.notifyConnectionChange(false); // Ensure UI reflects disconnected state
      this.errorCallbacks.forEach((callback) =>
        callback("WebSocket is not connected. Unable to send bid.")
      );
    }
  }

  // --- Callback Registration Methods ---

  /**
   * Registers a callback function to be executed whenever the WebSocket
   * connection status changes (connects or disconnects).
   * @param callback - The function to call, receives a boolean (true for connected, false for disconnected).
   */
  onConnect(callback: (connected: boolean) => void) {
    this.connectionCallbacks.push(callback);

    // Immediately invoke the callback with the current status if known
    const isConnected = this.socket?.readyState === WebSocket.OPEN;
    callback(isConnected);
  }

  /**
   * Helper method to invoke all registered connection status callbacks.
   * @param connected - The current connection status (true/false).
   */
  private notifyConnectionChange(connected: boolean) {
    // console.log(`Notifying connection change: ${connected}`);
    this.connectionCallbacks.forEach((callback) => {
      try {
        callback(connected);
      } catch (e) {
        console.error("Error in onConnect callback:", e);
      }
    });
  }

  /**
   * Registers a callback function to be executed when an auction item's
   * details are updated (typically due to a new bid).
   * @param callback - The function to call, receives the updated AuctionItem object.
   */
  onItemUpdate(callback: (item: AuctionItem) => void) {
    this.itemUpdateCallbacks.push(callback);
  }

  /**
   * Registers a callback function to be executed when a new bid is placed.
   * Note: Often, onItemUpdate is sufficient as it includes the latest bid info.
   * @param callback - The function to call, receives the new Bid object.
   */
  onBidUpdate(callback: (bid: Bid) => void) {
    this.bidUpdateCallbacks.push(callback);
  }

  /**
   * Registers a callback function to be executed when the initial list of
   * auction items is received from the server upon connection.
   * @param callback - The function to call, receives an array of AuctionItem objects.
   */
  onInitialData(callback: (items: AuctionItem[]) => void) {
    this.initialDataCallbacks.push(callback);
  }

  /**
   * Registers a callback function to be executed when an error message
   * is received from the WebSocket server.
   * @param callback - The function to call, receives the error message string.
   */
  onError(callback: (message: string) => void) {
    this.errorCallbacks.push(callback);
  }

  // --- Utility Method ---

  /**
   * Checks if the WebSocket is currently connected (state is OPEN).
   * @returns boolean - True if connected, false otherwise.
   */
  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }
}

// Create and export a single instance (Singleton pattern) of the WebSocketService.
// This ensures all parts of the application use the same WebSocket connection and state.
const websocketService = new WebSocketService();
export default websocketService;
