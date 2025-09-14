// sw.js - background service worker

// Listen for messages from popup.js or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ status: 'OK', msg: 'Service worker alive' });
  }

  // Add other message types in future (like autofill requests)
  return true; // keeps the message channel open for async responses
});

// Optional: keep vault state in memory (if needed)
let vaultLocked = true;

chrome.runtime.onInstalled.addListener(() => {
  console.log('TinyVault service worker installed.');
});
