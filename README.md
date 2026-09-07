# ChildControl — Website

The remote control side of [ChildControl](https://github.com/ShaharAk1/ChildControl):
a parent logs in here, links a paired PC with a one-time code generated from
the console's Setup tab, then can push a temporary override or a full weekly
schedule to it. No backend of its own — plain HTML/CSS/JS talking directly to
Firebase (Auth + Firestore) via the SDK loaded from a CDN. No build step.

## How it works

- **Login** — Firebase Auth, email/password.
- **Link a device** — you enter an 8-character code shown on the PC's
  Setup tab. The site looks up which device that code belongs to and claims
  it for your account. Codes are single-use and expire after 15 minutes,
  enforced by the Firestore Security Rules themselves (not just client-side).
- **Dashboard** — one card per linked PC: live status (pulled from the
  device's own heartbeat, sent roughly once a minute), the same four
  temporary-override buttons as the console's Now tab, and a paintable
  weekly schedule grid that mirrors the console's Weekly Schedule tab.

Every write here lands in the same Firestore document the Python agent reads
from — see `childcontrol/cloud.py` in the main repo for the other side of
this.

## Testing locally

Firebase Auth does **not** work correctly when the page is opened directly
as a `file://` URL — it needs a real HTTP origin. From this folder:

```
python -m http.server 8000
```

then open `http://localhost:8000`. `localhost` is pre-authorized by Firebase
by default, so login works out of the box for local testing.

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. Repo Settings → Pages → Source: **Deploy from a branch** → branch `main`,
   folder `/ (root)`.
3. **Firebase Console → Authentication → Settings → Authorized domains →
   Add domain** — add the `github.io` URL Pages gives you (or your custom
   domain, if you set one up). Without this step, login will fail on the
   deployed site with an `auth/unauthorized-domain` error even though it
   worked fine on `localhost`.

## Firebase project

Project: `childcontrol-fae4f`. The `apiKey` embedded in `app.js` is a public
Web API key by Firebase's own design — it identifies the project, it doesn't
grant access. What actually protects the data is the Firestore Security
Rules deployed on that project (see the main repo's project plan for the
exact rules text and the reasoning behind them).
