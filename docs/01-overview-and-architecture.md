# Part 1: Freestyle SAPUI5 App — Overview, Concepts & Architecture

> **Series:** Building a Freestyle SAPUI5 App on SAP BTP for Work Zone
> - **Part 1** — Overview, Concepts & Architecture *(this file)*
> - **Part 2** — Project Setup, Configuration & Deployment
> - **Part 3** — XSUAA Authorization
> - **Part 4** — Migrating Python Backend Apps (FastAPI + FastMCP) from API Key Auth to XSUAA

---

## Purpose

This series walks through building a standalone SAPUI5 application — a dashboard and data retrieval interface — that consumes backend services already deployed on SAP BTP Cloud Foundry. The backend consists of an MCP server wrapper (FastMCP/Python) and an API layer (FastAPI/Python), both running on CF, which query a remote PostgreSQL database on an EC2 instance.

The app will be deployed to the HTML5 Application Repository on SAP BTP and surfaced through SAP Build Work Zone, standard edition, giving business users a launchpad tile to access it.

---

## Key Concepts

### SAP Cloud Application Programming Model (CAP)

CAP is SAP's opinionated framework for building enterprise-grade services and applications on BTP. It uses CDS (Core Data Services) as a declarative modeling language for defining domain models, service definitions, and UI annotations. CAP auto-generates OData services from these models and comes with built-in support for HANA Cloud persistence, XSUAA-based authentication, multitenancy, audit logging, and change tracking. It supports both Node.js and Java runtimes.

CAP is most valuable when you are building a new data-centric application from scratch — where it owns the data model, the persistence layer, and the service exposure. It significantly reduces boilerplate for CRUD-heavy business applications.

### SAPUI5

SAPUI5 is SAP's enterprise JavaScript UI framework. It provides a rich set of UI controls (tables, forms, charts, lists, dialogs) that follow SAP's Fiori design language. SAPUI5 apps can be built as "freestyle" (you hand-code views and controllers) or using "Fiori Elements" (UI is auto-generated from OData annotations). Freestyle gives full control over layout and behavior.

### SAP Fiori

SAP Fiori is a design system — a set of UX guidelines, patterns, and principles for enterprise applications. It is not a framework itself. SAPUI5 is the technology that implements Fiori. When someone says "Fiori app," they typically mean a SAPUI5 application that follows the Fiori design guidelines.

### SAP Build Work Zone (Standard Edition)

Work Zone is SAP's managed launchpad service. It provides a centralized portal — the Fiori Launchpad — where business users access all their BTP applications from tiles. Work Zone handles the application shell, user authentication (via a managed AppRouter), role-based visibility, and personalization. It also hosts the Joule copilot side panel.

### HTML5 Application Repository

A BTP service that stores and serves the static frontend assets (HTML, JS, CSS, JSON) of your UI5 apps. When your app is deployed here, it is served by the managed AppRouter provided by Work Zone — meaning your frontend consumes zero Cloud Foundry runtime memory and doesn't need its own CF application instance.

### Managed AppRouter vs Standalone AppRouter

The **managed AppRouter** is provided by Work Zone. It handles authentication, session management, and request routing to backend services via BTP destinations. You don't deploy or maintain it — Work Zone does.

A **standalone AppRouter** is a Node.js application (`@sap/approuter`) that you deploy yourself as a CF app. It gives full control over routing, middleware, and custom logic, but requires you to manage its lifecycle, memory, and configuration.

For this use case, the managed AppRouter (via Work Zone) is sufficient and recommended.

---

## Why a Freestyle UI5 App and Not CAP

The decision to build a freestyle SAPUI5 app rather than a full CAP application is driven by the specific architecture of this project:

**The backend already exists.** The MCP server and API layer are already built, deployed, and running on Cloud Foundry. They expose REST endpoints that query a remote PostgreSQL database on EC2. There is no need to re-model this data in CDS or re-expose it through OData. CAP's primary value proposition — auto-generating services from a domain model — doesn't apply when the service layer is already in place.

**CAP expects to own the persistence layer.** CAP is designed around the assumption that it manages the database (typically HANA Cloud via HDI containers). When used as a pure facade over external services, you lose many of its built-in features: draft handling, automatic CRUD operations, deep inserts, pagination, and sorting all require manual implementation in custom handlers. You would be writing the same `fetch()` calls to your API layer that you'd write in a standalone UI5 app, but with the overhead of a CAP project wrapping them.

**The UI requirements are lightweight.** The application is a dashboard showing MCP server metadata (available tools, resources, prompts) and a form-based interface for querying data. This does not need Fiori Elements' auto-generated List Reports or Object Pages. A freestyle UI5 app with a few views and controllers is simpler and more direct.

**No enterprise data qualities are needed.** This is a demo/internal tool. It doesn't require multitenancy, audit logging, change tracking, or role-based field-level authorization — the enterprise features where CAP shines.

**Fewer moving parts.** A CAP project would introduce an additional CF application (the CAP Node.js or Java service), an additional XSUAA service instance, and an MTA with more modules to manage. The freestyle UI5 approach deploys only static files to the HTML5 Repository and routes API calls through BTP destinations — no additional runtime.

In summary: CAP adds a service layer. When that service layer would only proxy calls to an existing backend without adding value, it becomes unnecessary complexity.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  SAP Build Work Zone                     │
│              (Fiori Launchpad + Managed AppRouter)       │
│                                                         │
│   ┌─────────────────────┐                               │
│   │   Your UI5 App      │  served from HTML5 App Repo   │
│   │   (static files)    │                               │
│   └────────┬────────────┘                               │
│            │  API calls routed via xs-app.json           │
└────────────┼────────────────────────────────────────────┘
             │
             ▼
     BTP Destination
     (points to your API layer's CF route)
             │
             ▼
┌────────────────────────┐     ┌─────────────────────────┐
│   API Layer (CF)       │────▶│  PostgreSQL (EC2)        │
│   FastAPI / Python     │     │  (Remote database)       │
└────────────────────────┘     └─────────────────────────┘
             ▲
             │
┌────────────────────────┐
│   MCP Server (CF)      │
│   FastMCP / Python     │
└────────────────────────┘
```

The UI5 app contains no backend logic. All data retrieval happens through the managed AppRouter, which forwards API requests to your CF-deployed services via a BTP destination. The UI5 app itself is purely static content stored in the HTML5 Application Repository.

---

**Next:** [Part 2 — Project Setup, Configuration & Deployment](./02-project-setup-and-deployment.md)
