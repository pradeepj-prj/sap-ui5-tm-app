# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This repository contains a **freestyle SAPUI5 dashboard application** ("TM Skills Dashboard") deployable to SAP BTP HTML5 Application Repository via MTA, plus a 4-part technical guide series and a supplementary Joule agent integration guide.

The app combines three previously separate UIs into a unified dashboard:
- **Overview & Observability** — KPIs, charts, and analytics from MCP audit data
- **API Explorer** — Interactive UI for 18 TM/attrition REST endpoints
- **MCP Explorer** — Read-only catalog of 21 tools, 2 resources, 5 prompts

## Document Structure

Guides live in the `docs/` directory:

| File | Topic |
|------|-------|
| `docs/01-overview-and-architecture.md` | Architecture rationale: why freestyle UI5 over CAP, system diagram, key SAP BTP concepts |
| `docs/02-project-setup-and-deployment.md` | Project scaffolding, config files (manifest.json, xs-app.json, xs-security.json, mta.yaml), BTP setup, build/deploy workflow |
| `docs/03-xsuaa-authorization.md` | XSUAA scope definitions, role templates, token propagation via OAuth2UserTokenExchange, backend scope enforcement |
| `docs/04-migrating-python-backends-to-xsuaa.md` | Migrating FastAPI + FastMCP from API key auth to XSUAA JWT validation, principal propagation with user token exchange, sap-xssec library usage |
| `docs/joule-agent-workzone-guide.md` | Configuring a custom Joule agent (built in Joule Studio) to appear in SAP Build Work Zone's Joule side panel |

## Architecture Covered in the Guides

The system described (not implemented here) has this topology:

- **Frontend**: Freestyle SAPUI5 app deployed to HTML5 Application Repository, served by Work Zone's managed AppRouter (no CF runtime needed)
- **API Layer**: FastAPI (Python) on CF, connects to PostgreSQL on EC2, protected by XSUAA JWT validation via `sap-xssec`
- **MCP Server**: FastMCP (Python) on CF, calls the API layer with principal propagation (user token exchange preserves end-user identity)
- **Auth**: XSUAA handles authentication; managed AppRouter propagates user JWTs via OAuth2UserTokenExchange destinations; backend enforces scopes per user

Key design decision: CAP was intentionally avoided because the backend already exists — CAP's value is auto-generating services from domain models, which doesn't apply when wrapping existing REST APIs.

## App Structure

```
app/webapp/           — SAPUI5 application source
  controller/         — JS controllers (one per tab + App shell)
  view/               — XML views
  fragment/           — Reusable XML fragments
  model/              — formatter.js, models.js
  css/                — Custom styles
  i18n/               — Internationalization
  Component.js        — UI5 component
  manifest.json       — App descriptor (dataSources, routing)
  index.html          — Entry point
  xs-app.json         — Managed AppRouter routes
mta.yaml              — MTA deployment descriptor
xs-security.json      — XSUAA config (minimal, no scopes yet)
ui5.yaml              — UI5 tooling config
package.json          — Node dependencies
```

## Working with This Repo

- `npx ui5 serve` from project root to run locally (port 8080)
- `mbt build` to create .mtar for BTP deployment
- API routes: `/tm/...` → TM API layer, `/mcp/...` → MCP server
- Auth: API key passthrough initially (no XSUAA enforcement yet)
- Charts use `sap.viz` (VizFrame), theme is `sap_horizon`
- MCP catalog is a static JSON file (`mcpCatalog.json`) since MCP server returns HTML not JSON
- Guides in `docs/` are sequentially ordered (Parts 1-4) and cross-reference each other

## Guidelines for UI5

Use the `get_guidelines` tool of the UI5 MCP server to retrieve the latest coding standards and best practices for UI5 development.
