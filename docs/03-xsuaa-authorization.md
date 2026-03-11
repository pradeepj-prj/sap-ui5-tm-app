# Part 3: XSUAA Authorization

> **Series:** Building a Freestyle SAPUI5 App on SAP BTP for Work Zone
> - **Part 1** — Overview, Concepts & Architecture
> - **Part 2** — Project Setup, Configuration & Deployment
> - **Part 3** — XSUAA Authorization *(this file)*
> - **Part 4** — Migrating Python Backend Apps (FastAPI + FastMCP) from API Key Auth to XSUAA

---

## How Authorization Works in This Architecture

Authentication (who is the user?) is handled automatically by Work Zone and the managed AppRouter — you get this for free the moment a user opens your app from the launchpad.

Authorization (what can the user do?) requires three things: scope definitions in `xs-security.json`, user-role assignments in the BTP cockpit, and scope enforcement in your backend API layer.

The flow:

```
User opens app in Work Zone
    │
    ▼
Managed AppRouter (Work Zone)
    │  Authenticates user via XSUAA
    │  Issues JWT containing user's scopes
    │
    ▼
xs-app.json route with authenticationType: "xsuaa"
    │  AppRouter attaches JWT to outbound request
    │  (via OAuth2UserTokenExchange destination)
    │
    ▼
Your API Layer (CF) — FastAPI
    │  Receives JWT in Authorization header
    │  Validates token + checks scopes
    │  Returns data or 403 Forbidden
    │
    ▼
PostgreSQL (EC2)
```

---

## Step 1: Define Scopes and Role Templates

Update your `xs-security.json` with scopes, role templates, and (optionally) auto-created role collections:

```json
{
  "xsappname": "my-ui5-app",
  "tenant-mode": "dedicated",
  "scopes": [
    {
      "name": "$XSAPPNAME.ViewDashboard",
      "description": "View MCP server metadata and dashboard"
    },
    {
      "name": "$XSAPPNAME.QueryData",
      "description": "Submit queries to the data layer"
    }
  ],
  "role-templates": [
    {
      "name": "DashboardViewer",
      "description": "Can view the dashboard and MCP server metadata",
      "scope-references": ["$XSAPPNAME.ViewDashboard"]
    },
    {
      "name": "DataAnalyst",
      "description": "Can view the dashboard and submit data queries",
      "scope-references": [
        "$XSAPPNAME.ViewDashboard",
        "$XSAPPNAME.QueryData"
      ]
    }
  ],
  "role-collections": [
    {
      "name": "TM Dashboard Viewer",
      "description": "View-only access to the Talent Management dashboard",
      "role-template-references": [
        {
          "name": "DashboardViewer",
          "role-template-app-id": "$XSAPPNAME"
        }
      ]
    },
    {
      "name": "TM Data Analyst",
      "description": "Full access to dashboard and data queries",
      "role-template-references": [
        {
          "name": "DataAnalyst",
          "role-template-app-id": "$XSAPPNAME"
        }
      ]
    }
  ],
  "oauth2-configuration": {
    "redirect-uris": ["https://*.cfapps.*.hana.ondemand.com/**"]
  }
}
```

The `$XSAPPNAME` variable is resolved at deployment time. The `role-collections` block auto-creates role collections during MTA deployment so you don't have to create them manually in the BTP cockpit. You still need to assign users to these role collections after deployment.

---

## Step 2: Configure the Destination for Token Propagation

Use `OAuth2UserTokenExchange` as the authentication type on your BTP destination (see Part 2 for the full destination table). This ensures the managed AppRouter exchanges the user's token and forwards it to your API layer with the correct scopes embedded.

For this token exchange to work, the XSUAA service instances on both sides (your UI5 app's XSUAA and your API layer's XSUAA) must trust each other. If both are in the same subaccount, this is automatic. If they are in different subaccounts, you need to configure cross-consumption via the `authorities` property in `xs-security.json`:

On the UI5 app side:

```json
{
  "xsappname": "my-ui5-app",
  "tenant-mode": "dedicated",
  "authorities": [
    "$ACCEPT_GRANTED_AUTHORITIES"
  ]
}
```

On the API layer side:

```json
{
  "xsappname": "my-api-layer",
  "authorities": [
    {
      "$XSAPPNAME": {
        "$ACCEPT_GRANTED_SCOPES": [
          "$XSAPPNAME.ViewDashboard",
          "$XSAPPNAME.QueryData"
        ]
      }
    }
  ]
}
```

If both services are in the same subaccount and share the same XSUAA instance, you can skip this cross-trust configuration.

---

## Step 3: Enforce Scopes in Your API Layer (Backend)

The managed AppRouter and destination handle token creation and propagation. But enforcement must happen in your backend — the API layer running on CF. Without backend enforcement, scopes are informational only.

Since your API layer is a **FastAPI** (Python) app, see **Part 4** for the complete implementation guide on migrating from API key auth to XSUAA JWT validation, including the FastAPI middleware, dependency injection pattern, and the `sap_xssec` library usage.

For reference, the general pattern in any Python framework is:

1. Read the JWT from the `Authorization: Bearer <token>` header
2. Fetch the XSUAA public keys from the `/token_keys` endpoint (cached)
3. Validate the JWT signature, expiry, issuer, and audience
4. Extract the `scope` claim and check for the required scope
5. Return `403 Forbidden` if the scope is missing

---

## Step 4: (Optional) UI-Side Scope Checking

You can conditionally show or hide UI elements based on the user's scopes. This is a UX improvement, not a security measure — backend enforcement is still required.

A common pattern is to expose a lightweight `/api/me` endpoint on your API layer that decodes the JWT and returns the user's scopes:

```python
@app.get("/me")
async def get_current_user(token_info: dict = Depends(validate_jwt)):
    return {
        "user": token_info.get("user_name", "unknown"),
        "email": token_info.get("email", ""),
        "scopes": token_info.get("scope", [])
    }
```

Your UI5 app calls this on startup and uses the result to toggle visibility of views or controls via model binding:

```javascript
// In your controller's onInit
fetch("/api/me")
  .then(res => res.json())
  .then(data => {
    var oModel = new sap.ui.model.json.JSONModel({
      canQuery: data.scopes.includes("my-ui5-app.QueryData"),
      userName: data.user
    });
    this.getView().setModel(oModel, "auth");
  });
```

Then in your XML view, bind visibility:

```xml
<Button text="Run Query" visible="{auth>/canQuery}" press="onRunQuery" />
```

---

## Step 5: Assign Users to Role Collections

After deploying the MTA (which creates the XSUAA instance with your scopes, role templates, and role collections):

**BTP Cockpit** → **Security** → **Role Collections**

1. Find the auto-created role collections (e.g., "TM Dashboard Viewer", "TM Data Analyst")
2. Click on a role collection → **Edit** → **Users** tab
3. Add users by email / user ID
4. Save

Alternatively, if you use SAP Cloud Identity Services, you can map IAS user groups to role collections for bulk assignment.

---

## Authorization Summary

| Layer | What It Does | Who Handles It |
|-------|-------------|----------------|
| Authentication | Verifies user identity, issues JWT | Managed AppRouter + XSUAA (automatic) |
| Token propagation | Forwards JWT with scopes to backend | BTP Destination with `OAuth2UserTokenExchange` |
| Backend enforcement | Validates JWT, checks scopes, returns 403 if denied | Your API layer — FastAPI (you implement this) |
| UI-side visibility | Hides/shows controls based on scopes | Your UI5 app (optional, cosmetic only) |
| User-role assignment | Maps users to role collections | BTP Cockpit or IAS group mapping |

---

**Previous:** [Part 2 — Project Setup, Configuration & Deployment](./02-project-setup-and-deployment.md)
**Next:** [Part 4 — Migrating Python Backend Apps from API Key Auth to XSUAA](./04-migrating-python-backends-to-xsuaa.md)
