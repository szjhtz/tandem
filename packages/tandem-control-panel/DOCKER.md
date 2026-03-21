# Tandem Control Panel in Docker

The easiest container path is to run the control panel and the Tandem engine as separate services on the same Docker network.

## What gets installed

- `@frumu/tandem-panel` from the checked-in package source in the control-panel container
- `@frumu/tandem` in the engine container

The engine is installed directly from npm when the image is built. The panel image installs from the local package source so it does not depend on registry lag or a stale published artifact.

## Run

From `packages/tandem-control-panel`:

```bash
npm run docker:up
```

Then open:

```bash
http://localhost:39734
```

The default ports are:

- Control panel: `39734`
- Engine: `39731` inside the Docker network

The engine is not published to the host by default. The control panel is the public entry point.

## Login token

The engine container creates `./secrets/tandem_api_token` on first boot if it does not already exist.

You can use that token to sign in to the control panel.

To read it from the host:

```bash
cat secrets/tandem_api_token
```

If you want the token to stay stable across restarts, keep the `secrets/` directory around.

Useful follow-up commands:

```bash
npm run docker:logs
npm run docker:ps
npm run docker:down
npm run docker:token
```

`npm run docker:token` prints the current engine token from `secrets/tandem_api_token`.

## Environment overrides

Useful variables:

- `TANDEM_ENGINE_VERSION`
- `TANDEM_DOCKER_PANEL_PORT`
- `TANDEM_ENGINE_PORT`

If you already have an engine running elsewhere, you can point the panel at it by changing `TANDEM_ENGINE_URL` and disabling the local engine service.

## Why this layout works

- The browser only talks to the control panel.
- The control panel talks to the engine over the Docker network.
- The engine token stays in a file instead of being hard-coded into the browser.
- The panel does not auto-start a second engine when the engine URL is a Docker service name.
