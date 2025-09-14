// content.js

console.log("TinyVault content script loaded");

// Try to detect login form
const usernameField = document.querySelector("input[type='text'], input[type='email']");
const passwordField = document.querySelector("input[type='password']");

if (usernameField && passwordField) {
  console.log("Login form detected!");

  // Example auto-fill (hardcoded for now, later fetch from vault)
  chrome.storage.local.get(["autofillData"], (result) => {
    if (result.autofillData) {
      const { username, password } = result.autofillData;
      if (usernameField) usernameField.value = username;
      if (passwordField) passwordField.value = password;
      console.log("Auto-filled from TinyVault!");
    }
  });
}
