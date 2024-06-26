# HID User Journey Example

This is a boilerplate implementation for using HID User Journey in a web applications. Currently it shows only how to go passwordless using FIDO2/WebAuthn.

## Getting Started

You will need to set the following environment variables to run locally:

- `SESSION_SECRET` - A secret used to sign the session cookie
- `HID_AUTH_URL` - The URL of the HID OpenID API service including your tenant
- `HID_SCIM_URL` - The URL of the HID SCIM API service including your tenant
- `HID_CLIENT_ID` - The client ID of your application
- `HID_CLIENT_SECRET` - The client secret of your application
- `HID_REDIRECT_URI` - The address where the user is sent after authentication

## More Information

You can find more details on the API calls used in the [User Authentication with FIDO](https://docs.hidglobal.com/dev/auth-service/integration/user-authentication-with-fido.htm) documentation for the HID Authentication Service.