import { DbConnection } from "./module_bindings/index.ts";
import { initApp } from "./app.js";

const HOST = "wss://maincloud.spacetimedb.com";
const DB_NAME = "place-matcher";

const statusEl = document.getElementById("connection-status");

const conn = DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DB_NAME)
  .onConnect((conn, identity, token) => {
    statusEl.textContent = "Connected";
    statusEl.classList.add("connected");
    statusEl.classList.remove("error");

    conn.subscriptionBuilder()
      .onApplied(() => {
        console.log("Subscription applied");
      })
      .subscribeToAllTables();
  })
  .onConnectError((err) => {
    statusEl.textContent = "Connection Error";
    statusEl.classList.add("error");
    console.error("Connection error:", err);
  })
  .onDisconnect(() => {
    statusEl.textContent = "Disconnected";
    statusEl.classList.remove("connected");
  })
  .build();

// Initialize app after connection setup
// We wait a brief moment for the initial connection handshake
setTimeout(() => {
  initApp(conn);
}, 500);
