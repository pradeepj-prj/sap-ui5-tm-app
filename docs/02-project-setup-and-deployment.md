# Part 2: Project Setup, Configuration & Deployment

> **Series:** Building a Freestyle SAPUI5 App on SAP BTP for Work Zone
> - **Part 1** — Overview, Concepts & Architecture
> - **Part 2** — Project Setup, Configuration & Deployment *(this file)*
> - **Part 3** — XSUAA Authorization
> - **Part 4** — Migrating Python Backend Apps (FastAPI + FastMCP) from API Key Auth to XSUAA

---

## Local Development Setup

### Tooling Required

Install the following on your local machine:

- **Node.js** (LTS version, 18 or 20+)
- **UI5 CLI**: `npm install -g @ui5/cli` — for local serving and building
- **MTA Build Tool**: `npm install -g mbt` — for building the deployment archive
- **Cloud Foundry CLI** (v8+): with the **multiapps plugin** (`cf install-plugin multiapps`) and the **html5-plugin** (`cf install-plugin html5-plugin`)
- **Yeoman + Easy UI5 Generator** (optional but recommended): `npm install -g yo generator-easy-ui5` — scaffolds a UI5 project with best-practice structure

If you prefer a cloud-based IDE, SAP Business Application Studio (BAS) comes pre-configured with all of these tools in a "Full Stack Cloud Application" dev space.

### Scaffold the Project

Using the Easy UI5 generator:

```bash
yo easy-ui5 project
```

Or manually create the project structure:

```
my-ui5-app/
├── app/
│   └── webapp/
│       ├── controller/
│       │   └── App.controller.js
│       ├── view/
│       │   └── App.view.xml
│       ├── i18n/
│       │   └── i18n.properties
│       ├── Component.js
│       ├── manifest.json
│       ├── index.html
│       └── xs-app.json           ← routing config for the managed AppRouter
├── mta.yaml                      ← MTA deployment descriptor
├── xs-security.json              ← XSUAA configuration
├── package.json
└── ui5.yaml                      ← UI5 tooling configuration
```

---

## Key Configuration Files

### `manifest.json` (App Descriptor)

This is the central configuration file for your UI5 app. It declares the app ID (which must be globally unique within your BTP subaccount), the data sources (pointing to your API layer via a destination), routing between views, and model bindings.

The `dataSources` section defines how your app reaches backend services. For a REST-based API (not OData), you'd configure a custom data source or use `sap.ui.model.json.JSONModel` with manual `fetch()` calls in your controllers, using a relative path that maps to a route in `xs-app.json`.

### `xs-app.json` (AppRouter Routing)

This file tells the managed AppRouter how to route requests from your UI5 app. Each route maps a URL pattern to either a destination (for API calls) or to the HTML5 app repository (for static content).

```json
{
  "welcomeFile": "/index.html",
  "authenticationMethod": "route",
  "routes": [
    {
      "source": "^/api/(.*)$",
      "target": "$1",
      "destination": "my-api-layer",
      "authenticationType": "xsuaa",
      "csrfProtection": false
    },
    {
      "source": "^(.*)$",
      "target": "$1",
      "service": "html5-apps-repo-rt",
      "authenticationType": "xsuaa"
    }
  ]
}
```

In this example, any request your UI5 app makes to `/api/...` gets forwarded to the `my-api-layer` BTP destination, which points to your CF-deployed API layer. All other requests serve static files from the HTML5 repo.

### `xs-security.json` (XSUAA Configuration)

Defines the OAuth client, scopes, and role templates for your app. Even if you start with no authorization, this file is required by the XSUAA service instance.

Minimal version (authentication only, no authorization):

```json
{
  "xsappname": "my-ui5-app",
  "tenant-mode": "dedicated",
  "scopes": [],
  "role-templates": [],
  "oauth2-configuration": {
    "redirect-uris": ["https://*.cfapps.*.hana.ondemand.com/**"]
  }
}
```

For the full version with scopes and role templates, see **Part 3 — XSUAA Authorization**.

### `mta.yaml` (MTA Deployment Descriptor)

This is the deployment blueprint. It declares all modules (your UI5 app, the content deployer) and resources (service instances) that make up your application.

```yaml
_schema-version: "3.1"
ID: my-ui5-app
description: Freestyle UI5 dashboard
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
  # The UI5 app itself — built and zipped for HTML5 repo
  - name: my-ui5-app-content
    type: html5
    path: app/webapp
    build-parameters:
      build-result: dist
      builder: custom
      commands:
        - npm install
        - npx ui5 build --clean-dest --dest dist
      supported-platforms: []

  # Deploys the app zip to the HTML5 Application Repository
  - name: my-ui5-app-deployer
    type: com.sap.application.content
    path: .
    requires:
      - name: my-ui5-app-html5-repo-host
        parameters:
          content-target: true
    build-parameters:
      build-result: resources
      requires:
        - name: my-ui5-app-content
          artifacts:
            - dist/*.zip
          target-path: resources/

  # Deploys destination configuration
  - name: my-ui5-app-destination-content
    type: com.sap.application.content
    requires:
      - name: my-ui5-app-destination-service
        parameters:
          content-target: true
      - name: my-ui5-app-html5-repo-host
        parameters:
          service-key:
            name: my-ui5-app-html5-repo-host-key
      - name: my-ui5-app-uaa
        parameters:
          service-key:
            name: my-ui5-app-uaa-key
    parameters:
      content:
        subaccount:
          destinations:
            - Name: my-ui5-app-html5-repo-host
              ServiceInstanceName: my-ui5-app-html5-repo-host
              ServiceKeyName: my-ui5-app-html5-repo-host-key
              sap.cloud.service: my.ui5.app
            - Name: my-ui5-app-uaa
              Authentication: OAuth2UserTokenExchange
              ServiceInstanceName: my-ui5-app-uaa
              ServiceKeyName: my-ui5-app-uaa-key
              sap.cloud.service: my.ui5.app
          existing_destinations_policy: update
    build-parameters:
      no-source: true

resources:
  # HTML5 Application Repository — stores your app's static files
  - name: my-ui5-app-html5-repo-host
    type: org.cloudfoundry.managed-service
    parameters:
      service: html5-apps-repo
      service-plan: app-host

  # XSUAA — handles authentication
  - name: my-ui5-app-uaa
    type: org.cloudfoundry.managed-service
    parameters:
      path: ./xs-security.json
      service: xsuaa
      service-plan: application

  # Destination service — manages destination configurations
  - name: my-ui5-app-destination-service
    type: org.cloudfoundry.managed-service
    parameters:
      service: destination
      service-plan: lite
```

> **Note:** This MTA does not include a standalone AppRouter module or a CAP service module. The managed AppRouter provided by Work Zone serves the app. This keeps the deployment lean — no CF runtime memory consumed by your frontend.

### Local Development and Testing

Run your UI5 app locally:

```bash
cd app/webapp
npx ui5 serve
```

This starts a local dev server (typically on `http://localhost:8080`). To proxy API calls to your CF-deployed backend during local development, configure a `ui5-local.yaml` or use the `--proxy` flag, or add a local `default-env.json` with destination mappings for the approuter.

Alternatively, you can use `fetch()` calls directly against your API layer's CF route during development, then switch to the relative `/api/...` path (routed via `xs-app.json`) when deploying.

---

## BTP Configuration

### 1. Create the BTP Destination for Your API Layer

In the BTP Cockpit, navigate to your subaccount:

**Connectivity** → **Destinations** → **New Destination**

**Without XSUAA authorization** (backend does not validate tokens):

| Property | Value |
|----------|-------|
| Name | `my-api-layer` |
| Type | HTTP |
| URL | `https://<your-api-layer-route>.cfapps.<region>.hana.ondemand.com` |
| Proxy Type | Internet |
| Authentication | `NoAuthentication` |

**With XSUAA authorization** (backend validates JWT and checks scopes):

| Property | Value |
|----------|-------|
| Name | `my-api-layer` |
| Type | HTTP |
| URL | `https://<your-api-layer-route>.cfapps.<region>.hana.ondemand.com` |
| Proxy Type | Internet |
| Authentication | `OAuth2UserTokenExchange` |
| Token Service URL | `https://<subaccount-subdomain>.authentication.<region>.hana.ondemand.com/oauth/token` |
| Client ID | *(from your API layer's XSUAA binding — `VCAP_SERVICES.xsuaa[0].credentials.clientid`)* |
| Client Secret | *(from your API layer's XSUAA binding — `VCAP_SERVICES.xsuaa[0].credentials.clientsecret`)* |

The `OAuth2UserTokenExchange` type tells the managed AppRouter to exchange the user's JWT for a token that includes the scopes defined in your `xs-security.json`. This exchanged token is then forwarded to your API layer in the `Authorization` header.

Add the following additional properties for both cases:

| Property | Value |
|----------|-------|
| `sap.cloud.service` | `my.ui5.app` |
| `HTML5.DynamicDestination` | `true` |

The `HTML5.DynamicDestination` property allows the managed AppRouter to use this destination at runtime.

### 2. Ensure Required Service Entitlements

In your subaccount, verify entitlements for:

- **HTML5 Application Repository** — `app-host` plan (for storing your app) and `app-runtime` plan (for serving)
- **SAP Build Work Zone, standard edition** — `free` or `standard` plan
- **Authorization and Trust Management (XSUAA)** — `application` plan
- **Destination** — `lite` plan

### 3. Subscribe to SAP Build Work Zone

If not already subscribed:

**Service Marketplace** → search **SAP Build Work Zone, standard edition** → **Create** → select plan

After subscribing, assign the `Launchpad_Admin` role collection to your user:

**Security** → **Users** → select your user → **Assign Role Collection** → `Launchpad_Admin`

---

## Build and Deploy

### Build the MTA Archive

From your project root:

```bash
mbt build
```

This produces an `.mtar` file in the `mta_archives/` folder.

### Log In to Cloud Foundry

```bash
cf login -a https://api.cf.<region>.hana.ondemand.com
```

Select your org and space when prompted.

### Deploy

```bash
cf deploy mta_archives/my-ui5-app_1.0.0.mtar
```

This single command:
- Creates the XSUAA, destination, and HTML5 repo host service instances
- Builds and uploads your UI5 app to the HTML5 Application Repository
- Configures the subaccount-level destinations for Work Zone integration

After deployment, verify your app appears:

**BTP Cockpit** → **Subaccount** → **HTML5 Applications**

Your app should be listed there with its component ID from `manifest.json`.

---

## Work Zone Integration

### Option A: Via BTP Cockpit (Manual)

1. Open **SAP Build Work Zone** admin (Site Manager)
2. Go to **Content Manager** → **Content Explorer**
3. Open the **HTML5 Apps** content provider
4. Find your app and click **Add to My Content**
5. Go back to **Content Manager** → **My Content**
6. Create a **Group** (e.g., "Talent Management") and assign your app to it
7. Create or edit a **Role** and assign your app + group to it
8. Assign the role to users via **Role Collections** in the BTP Cockpit
9. Go to **Site Directory** → open (or create) your site
10. Open the site — your app tile should appear on the launchpad

### Option B: Via Common Data Model (CDM) — Automated

For a more automated approach, include a `cdm.json` file in your deployment that declares the app, catalog, group, and role assignments. This eliminates manual Work Zone admin steps after each deployment.

Create `app/webapp/cdm.json`:

```json
{
  "_version": "3.0",
  "identification": {
    "id": "my.ui5.app.cdm",
    "entityType": "bundle"
  },
  "payload": {
    "businessApps": {
      "my.ui5.app.display": {
        "sap.app": {
          "id": "my.ui5.app.display",
          "title": "Talent Management Dashboard",
          "subTitle": "MCP Server & Data Retrieval"
        },
        "sap.ui5": {
          "componentName": "my.ui5.app"
        }
      }
    },
    "catalogs": {
      "defaultCatalog": {
        "identification": { "id": "defaultCatalog", "title": "Default Catalog" },
        "payload": {
          "appDescriptors": [
            { "id": "my.ui5.app.display" }
          ]
        }
      }
    },
    "groups": {
      "talentMgmtGroup": {
        "identification": { "id": "talentMgmtGroup", "title": "Talent Management" },
        "payload": {
          "appDescriptors": [
            { "id": "my.ui5.app.display" }
          ]
        }
      }
    },
    "roles": {
      "defaultRole": {
        "identification": { "id": "defaultRole", "title": "TM Dashboard User" },
        "payload": {
          "apps": [
            { "id": "my.ui5.app.display" }
          ],
          "catalogs": [
            { "id": "defaultCatalog" }
          ],
          "groups": [
            { "id": "talentMgmtGroup" }
          ]
        }
      }
    }
  }
}
```

The CDM-based approach requires your MTA to deploy the `cdm.json` alongside the app into the HTML5 repo, and your Work Zone instance to consume it as an HTML5 Business Solution content provider rather than the default HTML5 Apps channel. Refer to SAP's documentation on "Developing HTML5 Business Solutions as Content Providers" for the detailed content provider setup.

---

## Development-to-Deployment Workflow Summary

```
Local development (VS Code + UI5 CLI)
    │
    │  Edit views, controllers, test locally with `npx ui5 serve`
    │
    ▼
Build MTA archive
    │
    │  mbt build
    │
    ▼
Deploy to Cloud Foundry
    │
    │  cf deploy mta_archives/<app>.mtar
    │
    ▼
Verify in BTP Cockpit
    │
    │  Subaccount → HTML5 Applications → confirm app listed
    │
    ▼
Configure Work Zone (first time only)
    │
    │  Add app to content, create group/role, assign to site
    │
    ▼
Business users access via Work Zone launchpad tile
```

For subsequent updates, only the `mbt build` → `cf deploy` steps are needed. The Work Zone tile configuration persists across redeployments.

---

## Checklist Before First Deployment

- [ ] Node.js, UI5 CLI, MBT, CF CLI (with multiapps + html5 plugins) installed
- [ ] CF CLI logged in to correct org/space
- [ ] BTP destination created pointing to your API layer on CF
- [ ] `HTML5.DynamicDestination` set to `true` on the destination
- [ ] HTML5 Application Repository entitled (`app-host` + `app-runtime` plans)
- [ ] XSUAA entitled (`application` plan)
- [ ] Destination service entitled (`lite` plan)
- [ ] SAP Build Work Zone subscribed
- [ ] `Launchpad_Admin` role collection assigned to your user
- [ ] `manifest.json` has a unique app ID
- [ ] `xs-app.json` routes `/api/` to the correct destination name
- [ ] `xs-security.json` present with correct `xsappname`
- [ ] `mta.yaml` references all modules and resources correctly

---

## Key References

- [SAPUI5 SDK Documentation](https://ui5.sap.com/)
- [UI5 Tooling (CLI)](https://sap.github.io/ui5-tooling/)
- [Easy UI5 Generator](https://github.com/SAP/generator-easy-ui5)
- [Deploy to HTML5 App Repo without CAP](https://community.sap.com/t5/technology-blog-posts-by-members/sap-cap-lessons-learned-deploy-app-on-html5-repository/ba-p/13950921)
- [Designing UI5 Apps for SAP Build Work Zone](https://community.sap.com/t5/technology-blog-posts-by-sap/designing-ui5-apps-as-business-solution-for-sap-build-work-zone-part-1/ba-p/13923459)
- [SAP BTP Developer's Guide](https://github.com/SAP-samples/btp-developer-guide-cap)
- [MTA Deployment to Cloud Foundry](https://cap.cloud.sap/docs/guides/deploy/to-cf)

---

**Previous:** [Part 1 — Overview, Concepts & Architecture](./01-overview-and-architecture.md)
**Next:** [Part 3 — XSUAA Authorization](./03-xsuaa-authorization.md)
