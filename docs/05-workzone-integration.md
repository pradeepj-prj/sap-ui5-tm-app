# Part 5: Surfacing the App in SAP Build Work Zone

> **Series:** Building a Freestyle SAPUI5 App on SAP BTP for Work Zone
> - **Part 1** — Overview, Concepts & Architecture
> - **Part 2** — Project Setup, Configuration & Deployment
> - **Part 3** — XSUAA Authorization
> - **Part 4** — Migrating Python Backend Apps (FastAPI + FastMCP) from API Key Auth to XSUAA
> - **Part 5** — Surfacing the App in SAP Build Work Zone *(this file)*

---

## What This Guide Covers

After running `cf deploy`, your app is sitting in the HTML5 Application Repository — but it won't appear in Work Zone automatically. This guide walks through the two sides of making it visible:

1. **App-side** — manifest.json entries that make the app discoverable (already done)
2. **Admin-side** — Work Zone Site Manager steps to add the tile to your launchpad

---

## Prerequisites

- The MTA has been deployed successfully (`cf deploy mta_archives/tm-dashboard_1.0.0.mtar`)
- SAP Build Work Zone (Standard or Advanced Edition) is subscribed in the same subaccount
- You have the **Launchpad_Admin** role collection assigned to your user

To verify the deploy worked:

```bash
# Check services were created
cf services | grep tm-dashboard

# Check the app is in the HTML5 repo
cf html5-list -di tm-dashboard-destination-service -u
```

You should see `com.sap.tm.dashboard` listed in the HTML5 repo output.

---

## What Was Added to manifest.json (Already Done)

Two sections are required for Work Zone to discover and tile the app. These have already been added to `manifest.json`:

### 1. `sap.app.crossNavigation` — Defines the Tile

```json
"crossNavigation": {
  "inbounds": {
    "tm-dashboard-display": {
      "semanticObject": "TMDashboard",
      "action": "display",
      "title": "TM Skills Dashboard",
      "subtitle": "Talent Management & MCP Monitoring",
      "icon": "sap-icon://dashboard",
      "signature": {
        "parameters": {},
        "additionalParameters": "allowed"
      }
    }
  }
}
```

This tells Work Zone:
- **semanticObject + action** = the navigation intent (`#TMDashboard-display`). Work Zone uses this to wire the tile to the app.
- **title / subtitle / icon** = what appears on the tile in the launchpad.
- **signature** = no mandatory parameters; the app launches directly.

### 2. `sap.cloud` — Binds the App to the Managed AppRouter

```json
"sap.cloud": {
  "public": true,
  "service": "com.sap.tm.dashboard"
}
```

This tells the managed AppRouter:
- **service** must match the `sap.cloud.service` value on your destinations in `mta.yaml`. This is how the AppRouter knows which destinations belong to this app.
- **public: true** makes the app accessible via Work Zone (without this, the managed AppRouter won't serve it).

> **If either section is missing**, the app will exist in the HTML5 repo but won't appear in Work Zone's Content Explorer.

---

## Work Zone Site Manager Steps

### Step 1: Open the Site Manager

Navigate to your subaccount in BTP Cockpit:

**Subaccount** → **Instances and Subscriptions** → click **SAP Build Work Zone** (or go to the subscription URL directly)

This opens the Site Manager admin UI.

### Step 2: Fetch the App from the HTML5 Repository

1. Go to **Content Manager** (left nav)
2. Click the **Content Explorer** tab
3. Click the **HTML5 Apps** content provider tile

You should see **TM Skills Dashboard** listed here (identified by the `crossNavigation` inbound in the manifest). If you don't see it:
- Wait 1–2 minutes after deploy and refresh
- Verify `cf html5-list` shows the app
- Check that `sap.cloud` and `crossNavigation` are in the deployed manifest

4. Select **TM Skills Dashboard** (check the checkbox)
5. Click **Add to My Content**

### Step 3: Assign the App to a Group

Tiles in Work Zone are organized into Groups (the visual rows on the launchpad).

1. Go back to **Content Manager** → **My Content** tab
2. Click **+ New** → **Group**
3. Enter a title, e.g. `TM Tools`
4. In the **Assignments** section, search for `TM Skills Dashboard`
5. Toggle the switch to assign it to this group
6. Click **Save**

### Step 4: Assign the App to a Role

Work Zone uses Roles to control which users see which content. At minimum, assign to the `Everyone` role (all authenticated users) or create a dedicated role.

**Option A — Assign to Everyone (simplest):**

1. In **My Content**, find the **Everyone** role and click to open it
2. Click **Edit**
3. In **Assignments**, search for `TM Skills Dashboard`
4. Toggle the switch to assign it
5. Also assign the **Group** you created in Step 3 (e.g. `TM Tools`)
6. Click **Save**

**Option B — Create a dedicated role:**

1. Click **+ New** → **Role**
2. Enter a title, e.g. `TM Dashboard Users`
3. Assign both the app and the group
4. Click **Save**
5. Then go to **BTP Cockpit** → **Role Collections** and map this Work Zone role to a BTP role collection, then assign it to users

### Step 5: Open the Site

1. Go to **Site Directory** (left nav)
2. If you don't have a site yet, click **+ Create Site** and give it a name
3. Click the site tile to open its settings, then click the **open site** icon (🔗) at the top right

The launchpad should show your **TM Skills Dashboard** tile under the group you created.

---

## Verifying It Works

When you click the tile, the managed AppRouter handles the flow:

```
Tile click
  → Work Zone resolves intent #TMDashboard-display
  → Managed AppRouter loads app from HTML5 repo
  → xs-app.json routes kick in:
      /tm/*  → tm-api-layer destination → FastAPI backend
      /mcp/* → tm-mcp-server destination → FastMCP backend
  → App renders in Work Zone shell (with Work Zone's ShellBar wrapping yours)
```

### Quick Health Check

| What to Check | How |
|---------------|-----|
| Tile appears | Open the Work Zone site — tile should be in your group |
| App loads | Click the tile — the SAPUI5 app should render with all 7 tabs |
| API data flows | Check the Overview tab — KPIs should populate (if backends are reachable) |
| Browser console | Open DevTools (F12) — no 404s on `/tm/` or `/mcp/` routes |

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| App not in Content Explorer | Missing `sap.cloud` or `crossNavigation` in manifest | Add both sections, rebuild, redeploy |
| App in Content Explorer but tile not visible | Not assigned to a Group + Role | Complete Steps 3 and 4 |
| Tile visible but app shows blank page | `sap.cloud.service` mismatch between manifest and destinations | Ensure `com.sap.tm.dashboard` matches everywhere |
| App loads but API calls fail (404) | Destinations not created or `sap.cloud.service` not set on them | Check `cf destinations` or BTP Cockpit → Destinations |
| App loads but API calls fail (401/403) | Backend requires auth but `authenticationType` is `none` | Expected for now; will be resolved in XSUAA migration (Part 3 & 4) |
| Two ShellBars visible (yours + Work Zone's) | Work Zone wraps apps in its own shell | See "ShellBar Behavior" note below |

### ShellBar Behavior

When running inside Work Zone, your app's `sap.f.ShellBar` will appear *below* Work Zone's own shell bar. This is normal. Options:
- **Keep both** — your ShellBar provides tab context and settings, Work Zone's provides back navigation and Joule
- **Hide yours** — detect the Work Zone environment and hide your ShellBar (check `sap.ushell` availability)
- Most apps keep their own ShellBar since it provides app-specific controls

---

## Updating the App After Changes

After code changes, just rebuild and redeploy:

```bash
mbt build
cf deploy mta_archives/tm-dashboard_1.0.0.mtar
```

You do **not** need to repeat the Work Zone Site Manager steps — the tile and assignments persist. The managed AppRouter will serve the updated app immediately (HTML5 repo content is replaced, no caching issues).

> **Tip:** If you only changed UI code (not mta.yaml or destinations), you can do a faster deploy with just the HTML5 content:
> ```bash
> cd app/webapp
> npx ui5 build --clean-dest --dest dist
> cf html5-push -p dist
> ```

---

## Summary

| Step | Where | What |
|------|-------|------|
| Deploy | Terminal | `mbt build && cf deploy` |
| Fetch app | Site Manager → Content Explorer | Add HTML5 app to My Content |
| Create group | Site Manager → My Content | New Group, assign app |
| Assign role | Site Manager → My Content | Add app + group to Everyone role |
| Open site | Site Manager → Site Directory | Verify tile and app load |
