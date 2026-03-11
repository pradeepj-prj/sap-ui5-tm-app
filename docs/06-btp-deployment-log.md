# Part 6: BTP Deployment — What We Tried and What We Learned

> **Series:** Building a Freestyle SAPUI5 App on SAP BTP for Work Zone
>
> This is a deployment log documenting the real-world issues encountered deploying the TM Skills Dashboard to SAP BTP. It covers every problem hit, every fix attempted, and what still needs resolution.

---

## Environment

- **Subaccount region**: ap10 (Singapore)
- **CF org**: `SEAIO_dial-3-0-zme762l7`
- **CF space**: `dev`
- **User permissions**: CF SpaceDeveloper (can deploy MTAs, create service instances). No Destination Administrator role (cannot create subaccount destinations via cockpit). Read-only access to Connectivity → Destinations.
- **Tools**: `mbt` 1.2.43, `cf` CLI 8.17.1, `multiapps` plugin 3.10.0 (ARM64)

---

## What Succeeded

### App deployed to HTML5 Application Repository

The SAPUI5 app is built, zipped, and uploaded to the HTML5 repo. It loads and renders correctly when accessed via the raw HTML5 app URL. All 7 tabs, ShellBar, and UI elements display properly.

### Three BTP service instances created

| Service | Plan | Status |
|---------|------|--------|
| `tm-dashboard-html5-repo-host` | html5-apps-repo / app-host | Created |
| `tm-dashboard-uaa` | xsuaa / application | Created |
| `tm-dashboard-destination-service` | destination / lite | Created |

### Subaccount destinations for HTML5 repo + UAA created

The MTA content deployer successfully creates these two subaccount-level destinations:
- `tm-dashboard-html5-repo-host` (ServiceInstanceName-based)
- `tm-dashboard-uaa` (OAuth2UserTokenExchange, ServiceInstanceName-based)

### Backend destinations created at subaccount level via REST API

Using the destination service credentials + OAuth token, we successfully created `tm-api-layer` and `tm-mcp-server` as subaccount-level destinations.

---

## What Failed and Why

### Issue 1: MTA content deployer cannot create plain HTTP destinations

**Error:**
```
[ERROR] Missing destination property [ServiceInstanceName] in destination tm-api-layer
```

**Cause:** The `com.sap.application.content` module targeting the destination service requires `ServiceInstanceName` for every destination defined under `subaccount.destinations`. Plain HTTP destinations (like our API backends) are not backed by a service instance, so they can't satisfy this requirement.

**Attempted fixes:**
1. Put backends under `subaccount.destinations` → Fails: `ServiceInstanceName` required
2. Put backends under `instance.destinations` → Fails: same error
3. Move backends to `init_data` on the destination service resource → Creates instance-level destinations, not subaccount-level (see Issue 3)

**Conclusion:** The MTA content deployer is designed for service-instance-backed destinations (XSUAA, connectivity, etc.). Plain HTTP destinations must be created through other means.

### Issue 2: HTML5 repo requires zip-of-zips format

**Error:**
```
Upload application content failed { CODE: '1001' } validation error: Could not find applications in the request.
```

**Cause:** The HTML5 Application Repository expects the uploaded content to be a zip file containing one inner zip per HTML5 application. The `ui5 build` command produces loose files in a `dist/` directory, not a zip.

**Fix that worked:** Added an explicit zip step to the MTA build:
```yaml
commands:
  - npm install
  - npx ui5 build --clean-dest --dest dist
  - bash -c "cd dist && zip -r com.sap.tm.dashboard.zip ."
```

**Important details:**
- Must use `bash -c "..."` to wrap the command — `mbt` escapes `&&` in raw commands, turning `cd dist && zip ...` into a literal string
- The artifact path in the deployer module must be relative to `build-result` (use `com.sap.tm.dashboard.zip`, not `dist/com.sap.tm.dashboard.zip`)
- The zip must contain `manifest.json` and `xs-app.json` at its root level

### Issue 3: `init_data` creates instance-level destinations, not subaccount-level

**What happened:** Added backend destinations to the destination service resource's `config.init_data.instance.destinations`. Deploy succeeded, but destinations were not visible in BTP Cockpit → Connectivity → Destinations.

**Cause:** `init_data` with `instance` scope creates destinations on the **destination service instance**, not at the subaccount level. The BTP Cockpit Destinations page only shows subaccount-level destinations. More importantly, the managed AppRouter (Work Zone) resolves destinations from the **subaccount level**, not from service instance level.

**Additional caveat:** `init_data` only runs when the service instance is **first created**. If the service already exists (from a prior deploy), updating it does not re-run `init_data`. To force it, you must delete and recreate the service instance.

### Issue 4: Multiple subaccount destinations with same `sap.cloud.service` not allowed

**Error (from HTML5 Applications page in BTP):**
```
sap.cloud.service com.sap.tm.dashboard is also configured in destinations:
tm-api-layer, tm-dashboard-uaa, multiple subaccount level destinations
with same sap.cloud.service property not allowed.
```

**Cause:** The managed AppRouter enforces that only a limited set of subaccount destinations can share the same `sap.cloud.service` value. Having 4 destinations (`tm-dashboard-html5-repo-host`, `tm-dashboard-uaa`, `tm-api-layer`, `tm-mcp-server`) all with `sap.cloud.service: com.sap.tm.dashboard` violates this constraint.

**Fix:** Recreated `tm-api-layer` and `tm-mcp-server` **without** `sap.cloud.service`. Backend destinations are resolved by name from `xs-app.json`, not by `sap.cloud.service`. Only the HTML5 repo host and UAA destinations need it.

### Issue 5: App returns 404 on API calls — destination resolution failure (RESOLVED via standalone AppRouter)

**Current state:** The app loads and renders correctly in Work Zone (all 7 tabs, ShellBar, KPIs visible). All API calls to `/mcp/...` and `/tm/...` return HTTP 404.

**What we confirmed via DevTools:**

The app runs inside a Work Zone iframe at `/cp.portal/ui5appruntime.html`. All fetch calls resolve to `/cp.portal/mcp/audit/summary`, `/cp.portal/mcp/audit/recent`, etc. This is **correct behavior** — the SaaS AppRouter proxies all requests through `/cp.portal/` and should match them against the app's `xs-app.json`.

**URL approaches tried (none changed the outcome):**
1. Absolute paths (`/tm`, `/mcp`) → resolves to `/cp.portal/mcp/...` → 404
2. Relative paths (`./tm`, `./mcp`) → resolves to `/cp.portal/mcp/...` → 404
3. `sap.ui.require.toUrl("com/sap/tm/dashboard")` → also resolves within `/cp.portal/` context → 404
4. `this.getMetadata().getManifestUrl()` base extraction → same `/cp.portal/` → 404

**Conclusion: The URL is correct. The problem is destination resolution.** The SaaS AppRouter receives the request, matches `^/mcp/(.*)$` in xs-app.json, but cannot resolve the `tm-mcp-server` destination — so it falls through to the HTML5 repo catch-all route, which returns 404 (no such file).

**Also tried:**
- `authenticationType: "none"` on API routes → 404
- `authenticationType: "xsuaa"` on API routes → 404
- Backend destinations with `sap.cloud.service` → triggers "multiple destinations with same sap.cloud.service" warning
- Backend destinations without `sap.cloud.service` → 404
- `init_data` instance-level destinations → managed AppRouter ignores instance-level destinations

**Root cause:** The managed AppRouter / SaaS AppRouter cannot resolve the backend destinations (`tm-api-layer`, `tm-mcp-server`). This is likely because:
1. **Instance-level vs subaccount-level**: `init_data` creates instance-level destinations, but the managed AppRouter only reads subaccount-level destinations
2. **Subaccount destinations may be missing**: They were created via REST API on a previous destination service instance, which was deleted and recreated (clearing instance-level destinations but subaccount destinations should persist)
3. **`sap.cloud.service` scoping conflict**: The managed AppRouter may require `sap.cloud.service` on backend destinations to scope them to the app, but having 4+ destinations with the same value triggers the "multiple destinations not allowed" constraint
4. **Permissions gap**: We don't have Destination Administrator role, so we can't verify or edit subaccount destination properties in the cockpit (read-only access only)

---

## Working `mta.yaml` (Final State)

```yaml
_schema-version: "3.1"
ID: tm-dashboard
description: Unified SAPUI5 Talent Management Dashboard
version: 1.0.0
parameters:
  deploy_mode: html5-repo
  enable-parallel-deployments: true

build-parameters:
  before-all:
    - builder: custom
      commands:
        - npm install

modules:
  - name: tm-dashboard-content
    type: html5
    path: app/webapp
    build-parameters:
      build-result: dist
      builder: custom
      commands:
        - npm install
        - npx ui5 build --clean-dest --dest dist
        - bash -c "cd dist && zip -r com.sap.tm.dashboard.zip ."
      supported-platforms: []

  - name: tm-dashboard-deployer
    type: com.sap.application.content
    path: .
    requires:
      - name: tm-dashboard-html5-repo-host
        parameters:
          content-target: true
    build-parameters:
      build-result: resources
      requires:
        - name: tm-dashboard-content
          artifacts:
            - com.sap.tm.dashboard.zip
          target-path: resources/

  - name: tm-dashboard-destination-content
    type: com.sap.application.content
    requires:
      - name: tm-dashboard-destination-service
        parameters:
          content-target: true
      - name: tm-dashboard-html5-repo-host
        parameters:
          service-key:
            name: tm-dashboard-html5-repo-host-key
      - name: tm-dashboard-uaa
        parameters:
          service-key:
            name: tm-dashboard-uaa-key
    parameters:
      content:
        subaccount:
          destinations:
            - Name: tm-dashboard-html5-repo-host
              ServiceInstanceName: tm-dashboard-html5-repo-host
              ServiceKeyName: tm-dashboard-html5-repo-host-key
              sap.cloud.service: com.sap.tm.dashboard
            - Name: tm-dashboard-uaa
              Authentication: OAuth2UserTokenExchange
              ServiceInstanceName: tm-dashboard-uaa
              ServiceKeyName: tm-dashboard-uaa-key
              sap.cloud.service: com.sap.tm.dashboard
          existing_destinations_policy: update
    build-parameters:
      no-source: true

resources:
  - name: tm-dashboard-html5-repo-host
    type: org.cloudfoundry.managed-service
    parameters:
      service: html5-apps-repo
      service-plan: app-host

  - name: tm-dashboard-uaa
    type: org.cloudfoundry.managed-service
    parameters:
      path: ./xs-security.json
      service: xsuaa
      service-plan: application

  - name: tm-dashboard-destination-service
    type: org.cloudfoundry.managed-service
    parameters:
      service: destination
      service-plan: lite
      config:
        init_data:
          instance:
            destinations:
              - Name: tm-api-layer
                URL: https://tm-skills-api.cfapps.ap10.hana.ondemand.com
                Authentication: NoAuthentication
                ProxyType: Internet
                Type: HTTP
                HTML5.DynamicDestination: true
              - Name: tm-mcp-server
                URL: https://tm-skills-mcp-v2.cfapps.ap10.hana.ondemand.com
                Authentication: NoAuthentication
                ProxyType: Internet
                Type: HTTP
                HTML5.DynamicDestination: true
            existing_destinations_policy: update
```

---

## Tooling Issues

### ARM64 (Apple Silicon) plugin compatibility

The CF CLI plugin repository serves x86 binaries by default. On Apple Silicon Macs, `cf install-plugin <name>` fails with `bad CPU type in executable`.

**Workaround:** Download the ARM64 binary directly:
```bash
# multiapps plugin
cf install-plugin https://github.com/cloudfoundry/multiapps-cli-plugin/releases/download/v3.10.0/multiapps-plugin.osxarm64 -f

# html5-plugin — ARM64 binary not tested (may have same issue)
```

### Creating subaccount destinations via REST API

When you don't have Destination Administrator role in the cockpit, you can create subaccount destinations programmatically using the destination service credentials:

```bash
# 1. Get service key credentials
cf service-key <dest-service> <key-name>

# 2. Get OAuth token
curl -X POST "${UAA_URL}/oauth/token" \
  --data-urlencode "grant_type=client_credentials" \
  --data-urlencode "client_id=${CLIENT_ID}" \
  --data-urlencode "client_secret=${CLIENT_SECRET}"

# 3. Create destination
curl -X POST "https://destination-configuration.cfapps.ap10.hana.ondemand.com/destination-configuration/v1/subaccountDestinations" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{ "Name": "...", "Type": "HTTP", "URL": "...", ... }'

# 4. Delete destination
curl -X DELETE ".../v1/subaccountDestinations/<name>" \
  -H "Authorization: Bearer ${TOKEN}"
```

**Security note:** Rotate the service key after using it for API calls (`cf delete-service-key ... -f` then redeploy to recreate).

---

## Deploy Commands (Quick Reference)

```bash
# Full build + deploy
mbt build && cf deploy mta_archives/tm-dashboard_1.0.0.mtar

# Abort a failed deploy
cf deploy -i <operation-id> -a abort

# Check MTA status
cf mta tm-dashboard

# Check deployed services
cf services | grep tm-dashboard

# Download deploy logs for debugging
cf dmol -i <operation-id>
```

---

## Resolution: Standalone AppRouter

The managed AppRouter / SaaS AppRouter could not be made to resolve backend destinations despite extensive attempts. The fix was deploying a **standalone AppRouter** (`@sap/approuter`) as a CF app that:

1. Serves the built UI5 files from a local `resources/` directory (copied from `dist/` during MTA build)
2. Routes `/tm/*` and `/mcp/*` to backend destinations via the bound destination service
3. Handles XSUAA authentication (automatic redirect to SAP IDP login)

**Key details:**
- The standalone AppRouter resolves destinations from the **instance-level** destinations on its bound destination service — no subaccount-level destination scoping issues
- UI5 files are served with `"localDir": "resources"` instead of fetching from HTML5 repo runtime (which had its own `Service Tag index is unknown` issue)
- Uses 256MB CF runtime memory (trade-off for reliable routing)
- App URL: `https://seaio-dial-3-0-zme762l7-dev-tm-dashboard-approuter.cfapps.ap10.hana.ondemand.com`
- The Work Zone tile still exists and can be configured as a URL tile pointing to the standalone AppRouter

**Files added:**
- `approuter/package.json` — `@sap/approuter` dependency
- `approuter/xs-app.json` — routes for `/tm/*`, `/mcp/*`, and catch-all to `localDir`

**MTA changes:**
- Added `tm-dashboard-approuter` module (type `approuter.nodejs`)
- Build copies `dist/**` into `approuter/resources/`
- Binds to `tm-dashboard-uaa` and `tm-dashboard-destination-service`

The HTML5 repo deploy (managed AppRouter path) is still in the MTA for Work Zone tile visibility, but API routing only works through the standalone AppRouter.
