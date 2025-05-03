/**
 * Live Auction Platform - Backend Server
 *
 * This server provides both REST API and WebSocket functionality for a live auction platform.
 * It demonstrates the difference between traditional REST API calls and real-time WebSocket communication.
 */
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

require("dotenv").config();

// Create a .env file in the root directory with the following content:
// ADMIN_USERNAME=admin
// ADMIN_PASSWORD=admin123
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Database setup
const DB_PATH = path.join(__dirname, "../data/auction.db");

/**
 * Default auction items to use if database is empty
 */
const defaultAuctionItems = [
  {
    id: 1,
    name: "Vintage Watch",
    description: "Classic timepiece from 1950s",
    startingBid: 100,
    currentBid: 100,
  },
  {
    id: 2,
    name: "Art Painting",
    description: "Original artwork by local artist",
    startingBid: 200,
    currentBid: 200,
  },
  {
    id: 3,
    name: "Antique Furniture",
    description: "Victorian era cabinet",
    startingBid: 300,
    currentBid: 300,
  },
];

// Global variables to store in-memory data
let auctionItems = [];
let db;

// Track active bidders and their WebSocket connections
const connectedBidders = new Map(); // username -> ws connection

// Countdown timer state
let countdownEndTime = null;
let countdownInterval = null;
let biddingActive = false;

/**
 * Initialize the database
 * Creates tables if they don't exist and loads initial data
 */
async function initializeDatabase() {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Open the database connection
    db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database,
    });

    console.log("Connected to SQLite database");

    // Create tables if they don't exist
    await db.exec(`
      CREATE TABLE IF NOT EXISTS auction_items (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        startingBid REAL NOT NULL,
        currentBid REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bids (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        itemId INTEGER NOT NULL,
        bidder TEXT NOT NULL,
        amount REAL NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (itemId) REFERENCES auction_items (id)
      );
    `);

    // Check if we need to populate with default items
    const count = await db.get("SELECT COUNT(*) as count FROM auction_items");
    if (count.count === 0) {
      console.log("Populating database with default items");

      // Insert default items
      for (const item of defaultAuctionItems) {
        await db.run(
          "INSERT INTO auction_items (id, name, description, startingBid, currentBid) VALUES (?, ?, ?, ?, ?)",
          [
            item.id,
            item.name,
            item.description,
            item.startingBid,
            item.currentBid,
          ]
        );
      }
    }

    // Load all items with their bids
    await loadAuctionItems();
  } catch (error) {
    console.error("Database initialization error:", error);
    process.exit(1);
  }
}

/**
 * Load all auction items from the database into memory
 * This includes fetching all bids for each item
 */
async function loadAuctionItems() {
  try {
    // Get all auction items
    const items = await db.all("SELECT * FROM auction_items");

    // For each item, get all its bids
    for (const item of items) {
      const bids = await db.all(
        "SELECT * FROM bids WHERE itemId = ? ORDER BY timestamp DESC",
        [item.id]
      );

      // Add bids array to each item
      item.bids = bids;
    }

    // Update the in-memory items
    auctionItems = items;
    console.log(`Loaded ${auctionItems.length} auction items from database`);
  } catch (error) {
    console.error("Error loading auction items:", error);
  }
}

/**
 * Save a new bid to the database
 */
async function saveBid(itemId, bidder, amount) {
  try {
    const timestamp = new Date().toISOString();

    // Insert the bid into the database
    const result = await db.run(
      "INSERT INTO bids (itemId, bidder, amount, timestamp) VALUES (?, ?, ?, ?)",
      [itemId, bidder, amount, timestamp]
    );

    // Update the current bid for the item
    await db.run("UPDATE auction_items SET currentBid = ? WHERE id = ?", [
      amount,
      itemId,
    ]);

    // Create new bid object with the generated ID
    const newBid = {
      id: result.lastID,
      itemId,
      bidder,
      amount,
      timestamp,
    };

    // Update in-memory item
    const item = auctionItems.find((item) => item.id === parseInt(itemId));
    if (item) {
      item.currentBid = amount;
      item.bids.unshift(newBid); // Add to the beginning for most recent first
    }

    return newBid;
  } catch (error) {
    console.error("Error saving bid:", error);
    throw error;
  }
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000; // Default port, can be overridden by .env

// Middleware
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server by attaching it to the HTTP server
const wss = new WebSocket.Server({ server });

/**
 * ==================== REST API ROUTES ====================
 * These routes demonstrate traditional HTTP request/response communication
 */

/**
 * GET /api/items - Retrieve all auction items
 * Used for initial data loading in the frontend
 */
app.get("/api/items", (req, res) => {
  res.json(auctionItems);
});

/**
 * GET /api/items/:id - Retrieve a specific auction item by ID
 * Used when a user selects an individual item
 */
app.get("/api/items/:id", (req, res) => {
  const item = auctionItems.find((item) => item.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: "Item not found" });
  res.json(item);
});

/**
 * POST /api/bids - Place a bid via REST API
 * Used to demonstrate traditional HTTP bidding before introducing WebSockets
 */
app.post("/api/bids", async (req, res) => {
  const { itemId, bidAmount, bidder } = req.body;

  // Validate input
  if (!itemId || !bidAmount || !bidder) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Find the item
  const item = auctionItems.find((item) => item.id === parseInt(itemId));
  if (!item) return res.status(404).json({ error: "Item not found" });

  // Validate bid amount
  if (bidAmount <= item.currentBid) {
    return res
      .status(400)
      .json({ error: "Bid must be higher than current bid" });
  }

  try {
    // Save the bid to the database
    const newBid = await saveBid(itemId, bidder, bidAmount);

    // Broadcast to all WebSocket clients (real-time update)
    broadcastBidUpdate(item, newBid);

    // Return the created bid
    res.status(201).json(newBid);
  } catch (error) {
    console.error("Error processing bid:", error);
    res.status(500).json({ error: "Failed to save bid" });
  }
});

/**
 * GET /api/history - Retrieve entire bid history
 * Allows downloading or viewing the complete bid history
 */
app.get("/api/history", async (req, res) => {
  try {
    const bids = await db.all("SELECT * FROM bids ORDER BY timestamp DESC");
    res.json(bids);
  } catch (error) {
    console.error("Error fetching bid history:", error);
    res.status(500).json({ error: "Failed to fetch bid history" });
  }
});

/**
 * ==================== ADMIN API ROUTES ====================
 * These routes handle admin functionality for the auction
 */

// Middleware to check admin authentication
const authenticateAdmin = (req, res, next) => {
  const { username, password } = req.body;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized: Invalid credentials" });
  }
};

/**
 * POST /api/admin/login - Admin authentication
 */
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: "Username and password are required",
    });
  }

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    res.json({
      success: true,
      message: "Authenticated successfully",
    });
  } else {
    res.status(401).json({
      success: false,
      error: "Invalid credentials",
    });
  }
});

/**
 * POST /api/admin/accept-bid - Accept a specific bid
 */
app.post("/api/admin/accept-bid", authenticateAdmin, async (req, res) => {
  const { bidId } = req.body;

  try {
    // Find the bid in the database
    const bid = await db.get("SELECT * FROM bids WHERE id = ?", [bidId]);

    if (!bid) {
      return res.status(404).json({ error: "Bid not found" });
    }

    // Find the item
    const item = auctionItems.find((item) => item.id === bid.itemId);
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Mark the bid as accepted (we could add a status field to the bids table)
    // For this demo, we'll just broadcast a message
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: "BID_ACCEPTED",
            bid,
            item,
          })
        );
      }
    });

    res.json({ success: true, message: "Bid accepted", bid });
  } catch (error) {
    console.error("Error accepting bid:", error);
    res.status(500).json({ error: "Failed to accept bid" });
  }
});

/**
 * POST /api/admin/timer/start - Start a countdown timer
 */
app.post("/api/admin/timer/start", authenticateAdmin, (req, res) => {
  const { durationSeconds } = req.body;

  if (!durationSeconds || isNaN(durationSeconds) || durationSeconds <= 0) {
    return res.status(400).json({ error: "Invalid duration" });
  }

  // Calculate end time
  const now = new Date();
  countdownEndTime = new Date(now.getTime() + durationSeconds * 1000);
  biddingActive = true;

  // Clear any existing interval
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  // Broadcast initial timer state
  broadcastTimerUpdate();

  // Set up interval to update timer (every second)
  countdownInterval = setInterval(() => {
    const now = new Date();

    // Check if countdown has ended
    if (now >= countdownEndTime) {
      biddingActive = false;
      clearInterval(countdownInterval);
      countdownInterval = null;
      countdownEndTime = null;

      // Broadcast timer ended
      broadcastTimerUpdate();
    } else {
      // Broadcast updated time remaining
      broadcastTimerUpdate();
    }
  }, 1000);

  res.json({
    success: true,
    message: "Timer started",
    endTime: countdownEndTime,
    durationSeconds,
  });
});

/**
 * POST /api/admin/timer/stop - Stop the countdown timer
 */
app.post("/api/admin/timer/stop", authenticateAdmin, (req, res) => {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  biddingActive = false;
  countdownEndTime = null;

  // Broadcast timer stopped
  broadcastTimerUpdate();

  res.json({ success: true, message: "Timer stopped" });
});

/**
 * GET /api/admin/bidders - Get list of all connected bidders
 */
app.get("/api/admin/bidders", authenticateAdmin, (req, res) => {
  const bidders = Array.from(connectedBidders.keys());
  res.json(bidders);
});

/**
 * POST /api/admin/remove-bidder - Remove a bidder
 */
app.post("/api/admin/remove-bidder", authenticateAdmin, (req, res) => {
  const { bidder } = req.body;

  if (!bidder) {
    return res.status(400).json({ error: "Bidder name is required" });
  }

  // Find the bidder's connection
  if (connectedBidders.has(bidder)) {
    const connection = connectedBidders.get(bidder);

    // Close their WebSocket connection
    if (connection && connection.readyState === WebSocket.OPEN) {
      connection.send(
        JSON.stringify({
          type: "REMOVED_BY_ADMIN",
          message: "You have been removed from the auction by an administrator",
        })
      );

      // Close the connection
      connection.close();
    }

    // Remove from our tracking map
    connectedBidders.delete(bidder);

    // Broadcast updated bidder list
    broadcastBidderListUpdate();

    res.json({ success: true, message: `Bidder ${bidder} removed` });
  } else {
    res.status(404).json({ error: "Bidder not found" });
  }
});

/**
 * GET /api/timer - Get current timer state
 */
app.get("/api/timer", (req, res) => {
  res.json({
    biddingActive,
    countdownEndTime,
    remainingSeconds: countdownEndTime
      ? Math.max(0, Math.floor((countdownEndTime - new Date()) / 1000))
      : null,
  });
});

/**
 * ==================== WEBSOCKET HANDLING ====================
 * This section handles real-time bidirectional communication
 */

// WebSocket connection handler
wss.on("connection", (ws) => {
  console.log("Client connected");
  let bidderName = null;

  // Send current auction items to the client when they connect
  ws.send(
    JSON.stringify({
      type: "INITIAL_DATA",
      items: auctionItems,
      timerData: {
        biddingActive,
        countdownEndTime,
        remainingSeconds: countdownEndTime
          ? Math.max(0, Math.floor((countdownEndTime - new Date()) / 1000))
          : null,
      },
    })
  );

  // Handle incoming messages from clients
  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);

      // Handle heartbeat messages (keep-alive mechanism)
      if (data.type === "HEARTBEAT") {
        ws.send(JSON.stringify({ type: "HEARTBEAT" }));
        return;
      }

      // Handle bidder registration
      if (data.type === "REGISTER_BIDDER") {
        const newBidderName = data.bidder;

        if (!newBidderName) {
          ws.send(
            JSON.stringify({
              type: "ERROR",
              message: "Bidder name is required",
            })
          );
          return;
        }

        // Store the bidder name with this connection
        bidderName = newBidderName;
        connectedBidders.set(bidderName, ws);

        // Broadcast updated bidder list
        broadcastBidderListUpdate();

        ws.send(
          JSON.stringify({
            type: "REGISTRATION_SUCCESSFUL",
            bidder: bidderName,
          })
        );

        return;
      }

      // Handle real-time bids
      if (data.type === "NEW_BID") {
        // Check if bidding is active (if timer is being used)
        if (countdownEndTime !== null && !biddingActive) {
          ws.send(
            JSON.stringify({
              type: "ERROR",
              message: "Bidding is currently closed",
            })
          );
          return;
        }

        const { itemId, bidAmount, bidder } = data;

        // Find the item
        const item = auctionItems.find((item) => item.id === parseInt(itemId));
        if (!item) {
          ws.send(JSON.stringify({ type: "ERROR", message: "Item not found" }));
          return;
        }

        // Validate bid amount
        if (bidAmount <= item.currentBid) {
          ws.send(
            JSON.stringify({
              type: "ERROR",
              message: "Bid must be higher than current bid",
            })
          );
          return;
        }

        try {
          // Save the bid to the database
          const newBid = await saveBid(itemId, bidder, bidAmount);

          // Broadcast to all clients
          broadcastBidUpdate(item, newBid);
        } catch (error) {
          console.error("Error processing WebSocket bid:", error);
          ws.send(
            JSON.stringify({
              type: "ERROR",
              message: "Failed to save bid",
            })
          );
        }
      }
    } catch (error) {
      console.error("Error processing message:", error);
      ws.send(
        JSON.stringify({
          type: "ERROR",
          message: "Invalid message format",
        })
      );
    }
  });

  // Handle client disconnection
  ws.on("close", () => {
    console.log("Client disconnected");

    // Remove from connected bidders if registered
    if (bidderName) {
      connectedBidders.delete(bidderName);

      // Broadcast updated bidder list
      broadcastBidderListUpdate();
    }
  });
});

/**
 * Utility function to broadcast updates to all connected clients
 * This is used both by REST API and WebSocket handlers to ensure
 * all clients stay in sync regardless of how the bid was placed
 */
function broadcastBidUpdate(item, bid) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "BID_UPDATE",
          item,
          bid,
        })
      );
    }
  });
}

/**
 * Utility function to broadcast timer updates to all connected clients
 */
function broadcastTimerUpdate() {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "TIMER_UPDATE",
          biddingActive,
          countdownEndTime,
          remainingSeconds: countdownEndTime
            ? Math.max(0, Math.floor((countdownEndTime - new Date()) / 1000))
            : null,
        })
      );
    }
  });
}

/**
 * Utility function to broadcast updated bidder list to all connected clients
 */
function broadcastBidderListUpdate() {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "BIDDER_LIST_UPDATE",
          bidders: Array.from(connectedBidders.keys()),
        })
      );
    }
  });
}

// Initialize the database and then start the server
initializeDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`REST API: http://localhost:${PORT}/api/items`);
    console.log(`WebSocket: ws://localhost:${PORT}`);
  });
});
