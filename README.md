# Phonic Conversation Demo

## Install dependencies

```
npm i
```

## Run locally

Use [ngrok](https://ngrok.com) to expose `localhost:3000` to the internet and allow Twilio to call it.
Once you create `YOUR_NGROK_HOST`, use it below.

In the project root, create `.env.local` with the following environment variables:

```
PHONIC_API_KEY="ph_..."
PHONIC_API_BASE_URL="..."
```

In Twilio console, open the phone number you want to call and add the following configuration:

* __A call comes in__: Webhook
* __URL__: https://YOUR_NGROK_HOST/incoming-call
* __HTTP__: HTTP POST

Run the Hono server with hot reloading:

```
npm run dev
```

In another terminal, start `ngrok`:

```
ngrok http --domain=YOUR_NGROK_HOST 3000
```

> [!NOTE]
> `YOUR_NGROK_HOST` should not contain the protocol, e.g. it should be `red-baloon.ngrok-free.app`, not `https://red-baloon.ngrok-free.app`.


Now, go ahead and call the phone number you configured in Twilio!
