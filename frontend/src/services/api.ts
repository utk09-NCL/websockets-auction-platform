import axios from "axios";
import { AuctionItem, Bid } from "../types/auction";

// Define the base URL for the backend API. Assumes the backend runs on localhost:3000.
const API_BASE_URL = "http://localhost:3000/api";

// Create an axios instance with predefined configuration.
// This instance can be reused for all API calls.
const api = axios.create({
  baseURL: API_BASE_URL, // Set the base URL for all requests made with this instance
  headers: {
    "Content-Type": "application/json", // Set the default Content-Type header for requests
  },
});

/**
 * Fetches all auction items from the backend API.
 * @returns A promise that resolves to an array of AuctionItem objects.
 */
export const fetchAllItems = async (): Promise<AuctionItem[]> => {
  // Make a GET request to the '/items' endpoint.
  const response = await api.get<AuctionItem[]>("/items");
  // Return the data part of the response (the array of items).
  return response.data;
};

/**
 * Fetches a single auction item by its ID from the backend API.
 * @param id - The unique identifier of the auction item to fetch.
 * @returns A promise that resolves to a single AuctionItem object.
 */
export const fetchItemById = async (id: number): Promise<AuctionItem> => {
  // Make a GET request to the '/items/:id' endpoint, substituting :id with the provided id.
  const response = await api.get<AuctionItem>(`/items/${id}`);
  // Return the data part of the response (the single item).
  return response.data;
};

/**
 * Places a new bid on a specific auction item via the backend API.
 * @param itemId - The ID of the item to bid on.
 * @param bidAmount - The amount of the bid.
 * @param bidder - The name or identifier of the person placing the bid.
 * @returns A promise that resolves to the newly created Bid object.
 */
export const placeBid = async (
  itemId: number,
  bidAmount: number,
  bidder: string
): Promise<Bid> => {
  // Make a POST request to the '/bids' endpoint.
  // The request body contains the itemId, bidAmount, and bidder.
  const response = await api.post<Bid>("/bids", {
    itemId,
    bidAmount,
    bidder,
  });
  // Return the data part of the response (the newly created bid details).
  return response.data;
};
