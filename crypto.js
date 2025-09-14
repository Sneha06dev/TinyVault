// crypto.js

// --- Utility: Encode/Decode ---
function strToUint8(str) {
  return new TextEncoder().encode(str);
}

function uint8ToStr(uint8) {
  return new TextDecoder().decode(uint8);
}

function bufferToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// --- Key Derivation ---
async function deriveKeyPBKDF2(password, salt) {
  console.log("🔑 Deriving key from master password...");
  console.log("Salt:", salt);
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const derivedKey= await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  console.log("✅ Key derived:", derivedKey);
  return derivedKey;

}

// --- Encrypt text with derived key ---
async function encryptText(key, text) {
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(text)
  );

 return {
    iv: bufferToBase64(iv),
    data: bufferToBase64(ciphertext)
  };
}

async function decryptText(encrypted, key) {
  try {
    console.log("Encrypted object:", encrypted);

    // Convert Base64 to Uint8Array
    const iv = Uint8Array.from(atob(encrypted.iv), c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(encrypted.data), c => c.charCodeAt(0));
    console.log("IV bytes:", iv);
    console.log("Ciphertext bytes:", data);

    // Decrypt
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );

    const decoded = new TextDecoder().decode(decrypted);
    console.log("Decrypted text:", decoded);
    return decoded;

  } catch (err) {
    console.error("Decryption failed:", err);
    throw new Error("Wrong Master Password or corrupted vault.");
  }
}



// --- Encrypt/Decrypt whole vault with password ---
async function deriveKey(password, salt) {
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    strToUint8(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptData(password, data) {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = strToUint8(JSON.stringify(data));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );

  return {
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertext),
  };
}

async function decryptData(password, encrypted) {
  try {
    const salt = new Uint8Array(base64ToBuffer(encrypted.salt));
    const iv = new Uint8Array(base64ToBuffer(encrypted.iv));
    const ciphertext = base64ToBuffer(encrypted.ciphertext);
    const key = await deriveKey(password, salt);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    return JSON.parse(uint8ToStr(new Uint8Array(decrypted)));
  } catch (err) {
    throw new Error("Wrong Master Password or corrupted vault.");
  }
}

// --- Save/Load Vault ---
// async function saveVault(password, vaultData) {
//   const encrypted = await encryptData(password, vaultData);
//   await chrome.storage.local.set({ vault: encrypted });
// }

// --- Save vault to IndexedDB ---
async function saveVault(vaultData) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("TinyVaultDB", 1);

    request.onerror = () => reject("IndexedDB open error");

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("vault")) {
        db.createObjectStore("vault", { keyPath: "id", autoIncrement: true });
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction("vault", "readwrite");
      const store = tx.objectStore("vault");

      // First, clear old entries
      const clearRequest = store.clear();
      clearRequest.onsuccess = () => {
        // Add all new entries
        const addPromises = vaultData.map(
          (entry) =>
            new Promise((res, rej) => {
              const addReq = store.add(entry);
              addReq.onsuccess = () => res();
              addReq.onerror = () => rej("Failed to add entry");
            })
        );

        Promise.all(addPromises)
          .then(() => resolve())
          .catch((err) => reject(err));
      };

      clearRequest.onerror = () => reject("Failed to clear vault");
    };
  });
}

// --- Load vault from IndexedDB ---
async function loadVault() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("TinyVaultDB", 1);

    request.onerror = () => reject("IndexedDB open error");

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("vault")) {
        db.createObjectStore("vault", { keyPath: "id", autoIncrement: true });
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;

      // Always double-check store exists
      if (!db.objectStoreNames.contains("vault")) {
        reject("Vault store not found");
        return;
      }

      const tx = db.transaction("vault", "readonly");
      const store = tx.objectStore("vault");
      const getAllReq = store.getAll();

      getAllReq.onsuccess = () => resolve(getAllReq.result || []);
      getAllReq.onerror = () => reject("Failed to load vault");
    };
  });
}

// async function loadVault() {
//   return new Promise((resolve, reject) => {
//     const request = indexedDB.open("TinyVaultDB", 1);

//     request.onerror = () => reject("IndexedDB open error");

//     request.onsuccess = (event) => {
//       const db = event.target.result;
//       const tx = db.transaction("vault", "readonly");
//       const store = tx.objectStore("vault");

//       const getAllReq = store.getAll();
//       getAllReq.onsuccess = () => resolve(getAllReq.result || []);
//       getAllReq.onerror = () => reject("Failed to load vault");
//     };
//   });
// }


// async function saveVault(vaultData) {
//   return new Promise((resolve, reject) => {
//     const request = indexedDB.open("TinyVaultDB", 1);

//     request.onerror = () => reject("IndexedDB error");
//     request.onupgradeneeded = (event) => {
//       const db = event.target.result;
//       if (!db.objectStoreNames.contains("vault")) {
//         db.createObjectStore("vault", { keyPath: "id", autoIncrement: true });
//       }
//     };

//     request.onsuccess = (event) => {
//       const db = event.target.result;
//       const transaction = db.transaction("vault", "readwrite");
//       const store = transaction.objectStore("vault");

//       // Clear previous entries before adding new ones
//       store.clear().onsuccess = () => {
//         vaultData.forEach((entry) => store.add(entry));
//       };

//       transaction.oncomplete = () => resolve();
//       transaction.onerror = () => reject("Failed to save vault");
//     };
//   });
// }

// async function loadVault() {
//   return new Promise((resolve, reject) => {
//     const request = indexedDB.open("TinyVaultDB", 1);

//     request.onerror = () => reject("IndexedDB error");

//     request.onsuccess = (event) => {
//       const db = event.target.result;
//       const transaction = db.transaction("vault", "readonly");
//       const store = transaction.objectStore("vault");
//       const getAllReq = store.getAll();

//       getAllReq.onsuccess = () => resolve(getAllReq.result || []);
//       getAllReq.onerror = () => reject("Failed to load vault");
//     };
//   });
// }


// async function loadVault(password) {
//   return new Promise((resolve, reject) => {
//     chrome.storage.local.get(["vault"], async (result) => {
//       if (!result.vault) {
//         resolve(null);
//         return;
//       }
//       try {
//         const decrypted = await decryptData(password, result.vault);
//         resolve(decrypted);
//       } catch (err) {
//         reject(err);
//       }
//     });
//   });


// --- Expose all functions globally for popup.js ---
window.deriveKeyPBKDF2 = deriveKeyPBKDF2;
window.encryptText = encryptText;
window.decryptText = decryptText;
window.encryptData = encryptData;
window.decryptData = decryptData;
window.saveVault = saveVault;
window.loadVault = loadVault;
