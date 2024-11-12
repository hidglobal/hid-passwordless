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
  if (username === "") {
    document.getElementById("username").classList.add("error");
    document.getElementById("username").focus();
    return;
  }
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
        publicKey.hints = ["security-key"];
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
              notify("Success! You can now login without passwords 🔑");
            } else {
              notify("Something went wrong during registration", "error");
              console.log(response.statusText);
            }
          });
        }).catch(function (error) {
          notify("Unable to create a new key, maybe try again?", "warning");
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
  if (username === "") {
    document.getElementById("username").classList.add("error");
    document.getElementById("username").focus();
    return;
  }
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
        publicKey.hints = ["security-key"];
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
                window.location.href = "/account.html";
                //notify("Authentication successful!");
              });
            } else {
              notify("Something went wrong.", "error");
              console.log(response.statusText);
            }
          });
        }).catch(function (error) {
          notify("Unable to create assertion, maybe try again?", "warning");
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

function notify(message, type) {

  document.getElementById("status-message").classList.remove("message--error");
  document.getElementById("status-message").classList.remove("message--warning");
  document.getElementById("status-message").classList.remove("message--status");
  switch (type) {
    case "error":
      document.getElementById("status-message").classList.add("message--error");
      break;
    case "warning":
      document.getElementById("status-message").classList.add("message--warning");
      break;
    default:
      document.getElementById("status-message").classList.add("message--statusS");
  }
  if (type === undefined) {
    document.getElementById("status-message").classList.add("message--status");
  }

  document.getElementById("status-message").children[0].innerHTML = message;
  document.getElementById("status-message").classList.remove("message--hidden");
  document.getElementById("status-message").classList.add("message--visible");
  setTimeout(function () {
    document.getElementById("status-message").classList.remove("message--visible")
    document.getElementById("status-message").classList.add("message--hidden");
  }, 3000);
}

function unassignAndDeleteDevice(id) {
  console.log(id)
  fetch('/unassign-device', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id })
  })
  .then((response) => {
    notify(response.statusText, "success")
    listCredentials()
    window.location.href = "/account.html"
  })
}

function editFriendlyName(id) {
  let editNameBlock = document.createElement("div");
  const currentValue = document.getElementById(id).innerHTML;
  let confirmButton = `<button class="button button--primary" type="button" onclick="updateFriendlyName('${id}')">confirm</button>`
  editNameBlock.innerHTML = `<input type="text" id="new-name" value="${currentValue}">${confirmButton}`
  document.getElementById(id).parentElement.appendChild(editNameBlock);
}

function updateFriendlyName(id) {
  const newName = document.getElementById('new-name').value;
  fetch("/rename-device", {
    method: "PUT",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id, friendlyName: newName })
  })
  .then((response) => {
    notify(response.statusText, "success")
    window.location.href = "/account.html"
  })
}

// Utility function to list authenticators
function listCredentials() {
  fetch("/passkeys").then(function (response) {
    if (response.status === 200) {
      response.json().then(function (user) {
        console.log(user);
        // devices is an array, iterate through it and add a li element for each item to the credentials ul element in the page
        document.getElementById("title").innerHTML = `Welcome ${user.userName}`;
        user.devices.forEach(function (device) {
          let li = document.createElement("li");
          let date = new Date(device.meta.created);
          let editButton = `<button class="button button--secondary" type="button" onclick="editFriendlyName('${device.id}')">Rename</button>`
          let deleteButton = `<button class="button button--delete" type="button" onclick="unassignAndDeleteDevice('${device.id}')">Delete</button>`
          li.innerHTML = `<strong id="${device.id}">${device.friendlyName}</strong><div>Registered on ${date.toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'})}${editButton}${deleteButton}</div>`;
          document.getElementById("credentials").appendChild(li);
        });
      });
    }
  });
}
