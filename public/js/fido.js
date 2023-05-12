let webAuthnSupport = "not supported";
if (window.PublicKeyCredential) {
  PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(function (available) {
    if (available) {
      webAuthnSupport = "supported, with platform authenticator";
    } else {
      webAuthnSupport = "supported, without platform authenticator";
    }
    console.log("WebAuthn support: " + webAuthnSupport);
  });
}

// Registration involves two steps:
// 1. Get the options from the RP server to select the authenticator
// 2. Create the credential and send it back to the server
function register() {
  const username = document.getElementById("username").value;
  fetch("/register-options", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({username: username})
  }).then(function (response) {
    if (response.status === 200) {
      response.json().then(function (data) {
        // Change the base64url (RFC-4648) back to ArrayBuffer
        const publicKey = data.publicKeyCredentialOptions;
        publicKey.challenge = Uint8Array.from(atob(publicKey.challenge.replace(/_/g, '/').replace(/-/g, '+')), (c) => c.charCodeAt(0));
        publicKey.user.id = Uint8Array.from(atob(publicKey.user.id.replace(/_/g, '/').replace(/-/g, '+')), (c) => c.charCodeAt(0));
        navigator.credentials.create({publicKey}).then(function (publicKeyCredential) {
          const credential = {
            type: publicKeyCredential.type,
            id: publicKeyCredential.id ? publicKeyCredential.id : null,
            rawId: arrayBufferToBase64url(publicKeyCredential.rawId),
            response: {
              clientDataJSON: arrayBufferToBase64url(publicKeyCredential.response.clientDataJSON),
              attestationObject: arrayBufferToBase64url(publicKeyCredential.response.attestationObject)
            }
          }
          console.log(credential);
          fetch("/register", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({credential: credential})
          }).then(function (response) {
            if (response.status === 200) {
              window.alert("Registration successful!");
            } else {
              console.log(response.statusText);
            }
          });
        });
      });
    } else {
      console.log(response.statusText);
    }
  }
)}

// Authentication involves two steps:
// 1. Get the options from the RP server to select the authenticator
// 2. Create the assertion and send it back to the server
function authenticate() {
  const username = document.getElementById("username").value;
  fetch("/authenticate-options", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({username: username})
  }).then(function (response) {
    if (response.status === 200) {
      response.json().then(function (data) {
        console.log(data);
        const publicKey = data;
        publicKey.challenge = Uint8Array.from(atob(publicKey.challenge.replace(/_/g, '/').replace(/-/g, '+')), (c) => c.charCodeAt(0));
        publicKey.allowCredentials.forEach(function (cred) {
          cred.id = Uint8Array.from(atob(cred.id.replace(/_/g, '/').replace(/-/g, '+')), (c) => c.charCodeAt(0));
        });
        navigator.credentials.get({publicKey}).then(function (publicKeyCredential) {
          console.log(publicKeyCredential);
          const credential = {
            type: publicKeyCredential.type,
            id: publicKeyCredential.id ? publicKeyCredential.id : null,
            rawId: arrayBufferToBase64url(publicKeyCredential.rawId),
            response: {
              clientDataJSON: arrayBufferToBase64url(publicKeyCredential.response.clientDataJSON),
              authenticatorData: arrayBufferToBase64url(publicKeyCredential.response.authenticatorData),
              signature: arrayBufferToBase64url(publicKeyCredential.response.signature),
              userHandle: arrayBufferToBase64url(publicKeyCredential.response.userHandle),
            }
          }
          fetch("/authenticate", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({credential: credential})
          }).then(function (response) {
            if (response.status === 200) {
              response.json().then(function (data) {
                console.log(data);
                window.alert("Authentication successful!");
              });
            } else {
              console.log(response.statusText);
            }
          });

        });

      });
    } else {
      console.log(response.statusText);
    }}
  )
}

// Convert ArrayBuffer to base64url encoded string
function arrayBufferToBase64url(buffer) {
  let binary = '';
  let bytes = new Uint8Array(buffer);
  let len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
      binary += String.fromCharCode( bytes[ i ] );
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}