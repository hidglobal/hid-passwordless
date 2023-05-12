const express = require('express');
const path = require('path');
const session = require('express-session');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

app.use(session({
  secret: process.env.SESSION_SECRET,
  cookie: { maxAge: 60000 },
  resave: false,
  saveUninitialized: false
}));
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/register-options', (req, res) => {
  const authBasic = Buffer.from(`${process.env.HID_CLIENT_ID}:${process.env.HID_CLIENT_SECRET}`, 'utf8').toString('base64');

  // 1. Get application access token
  fetch(`${process.env.HID_AUTH_URL}/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authBasic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials'
  })
  .then((response) => {
    if (response.ok) {
      response.json().then((data) => {
        req.session.access_token = data.access_token;
        // 2. Create the user, fails 409 if already exists
        const createUser = {
          userName: req.body.username,
          externalId: req.body.username,
          groups: [
            {value: "UG_ROOT"}
          ]
        }
        fetch(`${process.env.HID_SCIM_URL}/Users`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${req.session.access_token}`,
            'Content-Type': 'application/scim+json'
          },
          body: JSON.stringify(createUser)
        })
        .then((response) => {
          console.log('Create user: ' + response.status + ' ' + response.statusText);
          // 3. Create the PAR request
          const params = new URLSearchParams();
          params.append('response_type', 'code');
          params.append('client_id', process.env.HID_CLIENT_ID);
          params.append('redirect_uri', process.env.HID_REDIRECT_URI);
          params.append('scope', 'openid profile');

          fetch(`${process.env.HID_AUTH_URL}/par`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${req.session.access_token}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
          })
          .then((response) => {
            delete req.session.access_token; // We don't need it anymore now that we have a PAR
            if (response.ok) {
              response.json().then((data) => {
                req.session.username = req.body.username;
                req.session.request_uri = data.request_uri;
                // 4. Get FIDO registration options
                const request = {
                  enroll_step: 'getcredentialoptions',
                  username: req.body.username,
                  request_uri: data.request_uri,
                  authType: 'AT_FIDO'
                };
                fetch(`${process.env.HID_AUTH_URL}/enroll/fido`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(request)
                })
                .then((response) => {
                  if (response.ok) {
                    req.session.csrf = response.headers.get('server-csrf-token');
                    response.json().then((data) => {
                      res.json(data);
                    });
                  } else {
                    res.status(response.status).send(response.statusText);
                  }
                })
                .catch((err) => {
                  console.log(err);
                });
              });
            } else {
              res.status(response.status).send(response.statusText);
            }
          })
          .catch((err) => {
            console.log(err);
          });

        })
      });
    } else {
      // Client authentication error
      console.log(response.status + ' ' + response.statusText);
    }
  })
  .catch((err) => {
    console.log(err);
  });
});

app.post('/register', (req, res) => {
  // Straightforward, just register the credential generated by the browser
  const request = {
    enroll_step: 'registercredential',
    username: req.session.username,
    request_uri: req.session.request_uri,
    authType: 'AT_FIDO',
    credential: req.body.credential
  };
  fetch(`${process.env.HID_AUTH_URL}/enroll/fido`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'server-csrf-token': req.session.csrf
    },
    body: JSON.stringify(request)
  })
  .then((response) => {
    if (response.ok) {
      res.status(200).send('OK');
    } else {
      res.status(response.status).send(response.statusText);
    }
  })
  .catch((err) => {
    console.log(err);
  });
});

app.post('/authenticate-options', (req, res) => {
  const authBasic = Buffer.from(`${process.env.HID_CLIENT_ID}:${process.env.HID_CLIENT_SECRET}`, 'utf8').toString('base64');

  // 1. Get application access token
  fetch(`${process.env.HID_AUTH_URL}/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authBasic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials'
  })
  .then((response) => {
    if (response.ok) {
      response.json().then((data) => {
        req.session.access_token = data.access_token;
        // 2. Create a PAR request
        const params = new URLSearchParams();
        params.append('response_type', 'code');
        params.append('client_id', process.env.HID_CLIENT_ID);
        params.append('redirect_uri', process.env.HID_REDIRECT_URI);
        params.append('scope', 'openid profile');

        fetch(`${process.env.HID_AUTH_URL}/par`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${req.session.access_token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params
        })
        .then((response) => {
          if (response.ok) {
            response.json().then((data) => {
              req.session.username = req.body.username;
              req.session.request_uri = data.request_uri;
              const request = {
                grant_type: 'fido_challenge',
                username: req.body.username,
                request_uri: data.request_uri,
                authType: 'AT_FIDO'
              };
              fetch(`${process.env.HID_AUTH_URL}/code`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(request)
              })
              .then((response) => {
                if (response.ok) {
                  req.session.csrf = response.headers.get('server-csrf-token');
                  response.json().then((data) => {
                    res.json(data);
                  });
                } else {
                  res.status(response.status).send(response.statusText);
                }
              })
              .catch((err) => {
                console.log(err);
              });
            });
          } else {
            res.status(response.status).send(response.statusText);
          }
        })
        .catch((err) => {
          console.log(err);
        });
      });

    } else {
      // Client authentication error
      console.log(response.status + ' ' + response.statusText);
    }
  })
  .catch((err) => {
    console.log(err);
  });  
});

app.post('/authenticate', (req, res) => {
  const request = {
    grant_type: 'password',
    username: req.session.username,
    request_uri: req.session.request_uri,
    authType: 'AT_FIDO',
    password: req.body.credential.response
  };
  fetch(`${process.env.HID_AUTH_URL}/code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'server-csrf-token': req.session.csrf
    },
    body: JSON.stringify(request)
  })
  .then((response) => {
    req.session.csrf = response.headers.get('server-csrf-token');
    if (response.ok) {
      console.log('Authentication successful, now get the token');

      const finalize = new URLSearchParams();
      finalize.append('grant_type', 'code_request');
      finalize.append('username', req.session.username);
      finalize.append('authType', 'AT_FIDO');
      finalize.append('request_uri', req.session.request_uri);
      
      fetch(`${process.env.HID_AUTH_URL}/code`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${req.session.access_token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'server-csrf-token': req.session.csrf
        },
        body: finalize
      })
      .then((response) => {
        if (response) {
          response.json().then((data) => {
            res.json(data);
          });
        } else {
          console.log(`response: ${response.status}: ${response.statusText}`);
          res.status(response.status).send(response.statusText);
        }
      })
    } else if (response.status === 400) {
      response.json().then((data) => {
        console.log(data);

        const consent = new URLSearchParams();
        consent.append('request_uri', req.session.request_uri);
        consent.append('username', req.session.username);
        consent.append('sharings', JSON.stringify([
            {scope: 'openid', status: 'accepted', exp: -1},
            {scope: 'profile', status: 'accepted', exp: -1},
        ]));
        
        fetch(`${process.env.HID_AUTH_URL}/consent`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'server-csrf-token': req.session.csrf
          },
          body: consent
        }).then((response) => {
          if (response) {
            response.json().then((data) => {
              console.log(data);
              //res.json(data);
            });
          } else {
            res.status(response.status).send(response.statusText);
          }
        })
      });
    }
  })
  .catch((err) => {
    console.log(err);
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/public/index.html'));
});

app.listen(port, () => console.log(`Customer Journey listening on port ${port}!`));