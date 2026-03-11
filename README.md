# TM Skills Dashboard

A freestyle SAPUI5 dashboard application for Talent Management monitoring and MCP (Model Context Protocol) server observability. Deployable to SAP BTP HTML5 Application Repository via MTA with zero Cloud Foundry runtime memory.

## What It Does

This app unifies three concerns into a single tabbed dashboard:

- **Overview & Observability** -- KPI tiles, operation mix charts, call volume timelines, latency percentiles (P50/P95/P99), and error rate analytics from MCP audit data
- **API Explorer** -- Interactive form-driven UI for 18 TM/attrition REST endpoints (Employees, Skills, Gaps, Risk, Org, Attrition)
- **MCP Explorer** -- Read-only catalog of 21 tools, 2 resources, and 5 prompts exposed by the MCP server
- **Sessions** -- Time-based session grouping of audit entries (2-hour inactivity gap splitting) with expandable call timelines and gap markers
- **Demo** -- Live-streaming view with 10-second polling, real-time stats, and session picker
- **Raw Data** -- Filterable, searchable, exportable audit log table

## Architecture

```
SAPUI5 App (HTML5 Repo, no CF runtime)
    |
Managed AppRouter (SAP Build Work Zone)
    |-- /tm/*  --> FastAPI on CF (TM REST API) --> PostgreSQL on EC2
    |-- /mcp/* --> FastMCP on CF (MCP Server)  --> FastAPI (via principal propagation)
    |
XSUAA (authentication + token exchange)
```

**Why freestyle UI5 instead of CAP?** The Python backend already exists. CAP's value is auto-generating OData services from domain models, which doesn't apply when wrapping existing REST APIs.

## Project Structure

```
app/webapp/                     SAPUI5 application source
  controller/                   8 controllers (App shell + 7 tabs)
    App.controller.js             ShellBar, tab navigation, settings
    Overview.controller.js        KPIs, charts, recent activity (30s poll)
    Observability.controller.js   Latency percentiles, error rates (30s poll)
    ApiExplorer.controller.js     18-endpoint interactive form
    McpExplorer.controller.js     MCP tool/resource/prompt catalog
    Sessions.controller.js        Time-based session grouping
    Demo.controller.js            Live call streaming (10s poll)
    RawData.controller.js         Filterable audit log table
  view/                         8 XML views (one per controller)
  fragment/                     4 reusable XML fragments
    KpiHeader.fragment.xml        6-metric KPI tile row
    EndpointForm.fragment.xml     Dynamic API query form
    AttritionDashboard.fragment.xml  Attrition KPIs + chart
    ToolCard.fragment.xml         MCP tool card layout
  model/
    models.js                   Device model, groupIntoSessions(), fetchJson()
    formatter.js                13 formatting functions
    mcpCatalog.json             Static MCP tool/resource/prompt catalog
  css/style.css                 Custom styles (duration colors, risk badges, etc.)
  i18n/                         Internationalization bundles
  Component.js                  Initializes server + app JSON models
  manifest.json                 App descriptor (ID, dependencies, routing)
  index.html                    Bootstrap entry point (sap_horizon theme)
  xs-app.json                   Managed AppRouter route definitions
docs/                           4-part technical guide series + Joule guide
mta.yaml                       MTA deployment descriptor
xs-security.json                XSUAA config (minimal, ready for scope expansion)
ui5.yaml                       UI5 tooling config (SAPUI5 1.120.0)
package.json                    Node dependencies
CLAUDE.md                       AI coding assistant instructions
```

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [UI5 CLI](https://sap.github.io/ui5-tooling/) (`@ui5/cli` -- installed as devDependency)
- For BTP deployment: [Cloud MTA Build Tool](https://sap.github.io/cloud-mta-build-tool/) (`mbt`) and [Cloud Foundry CLI](https://docs.cloudfoundry.org/cf-cli/) (`cf`)

## Getting Started

```bash
# Install dependencies
npm install

# Start local dev server (port 8080)
npx ui5 serve

# Open in browser
open http://localhost:8080/index.html
```

The local dev server proxies API calls:
- `/tm/*` to the TM API layer on BTP
- `/mcp/*` to the MCP server on BTP

Use the Settings dialog (gear icon in ShellBar) to switch between BTP and local backend URLs, or to set an API key.

## Building & Deploying to SAP BTP

```bash
# Build the MTA archive
mbt build

# Deploy to Cloud Foundry
cf deploy mta_archives/tm-dashboard_1.0.0.mtar
```

The MTA deploys three modules:
1. **tm-dashboard-content** -- UI5 app built and zipped
2. **tm-dashboard-deployer** -- Pushes the zip to HTML5 Application Repository
3. **tm-dashboard-destination-content** -- Configures BTP destinations for API routing

No CF runtime memory is consumed; the app is served by the managed AppRouter in SAP Build Work Zone.

## Authentication

Currently uses API key passthrough (`authenticationType: "none"` for API routes). The docs describe the migration path to full XSUAA JWT authentication with OAuth2UserTokenExchange principal propagation (see [Part 3](docs/03-xsuaa-authorization.md) and [Part 4](docs/04-migrating-python-backends-to-xsuaa.md)).

## Technical Guide Series

The `docs/` directory contains a 4-part guide plus a supplementary Joule integration guide:

| Part | File | Topic |
|------|------|-------|
| 1 | [01-overview-and-architecture.md](docs/01-overview-and-architecture.md) | Architecture rationale, system topology, key SAP BTP concepts |
| 2 | [02-project-setup-and-deployment.md](docs/02-project-setup-and-deployment.md) | Scaffolding, config files, build/deploy workflow |
| 3 | [03-xsuaa-authorization.md](docs/03-xsuaa-authorization.md) | XSUAA scopes, role templates, token propagation |
| 4 | [04-migrating-python-backends-to-xsuaa.md](docs/04-migrating-python-backends-to-xsuaa.md) | Migrating FastAPI/FastMCP from API key to JWT auth |
| -- | [joule-agent-workzone-guide.md](docs/joule-agent-workzone-guide.md) | Custom Joule agent in SAP Build Work Zone |

## Key Design Decisions

- **Tab-scoped models**: Each tab gets its own JSON model to avoid cross-tab data contamination
- **Time-based session splitting**: Audit entries are grouped into sessions by detecting 2-hour inactivity gaps (the MCP server doesn't track sessions natively)
- **Static MCP catalog**: The MCP server returns HTML, so the tool/resource/prompt catalog is maintained as a static JSON file
- **Charts via sap.viz**: VizFrame charts (donut, bar, column, scatter, timeseries_line) with lazy loading
- **No OData/CAP**: Direct `fetch()` calls to REST APIs via a thin `fetchJson()` helper

## Tech Stack

- **SAPUI5** 1.120.0 with `sap_horizon` theme
- **Libraries**: `sap.m`, `sap.f`, `sap.ui.core`, `sap.ui.layout`, `sap.viz`, `sap.tnt`, `sap.ui.export`
- **Backend**: FastAPI (Python) on Cloud Foundry + FastMCP (Python) on Cloud Foundry
- **Database**: PostgreSQL on EC2
- **Auth**: XSUAA (planned), API key passthrough (current)
- **Deployment**: MTA to HTML5 Application Repository (zero CF runtime)
