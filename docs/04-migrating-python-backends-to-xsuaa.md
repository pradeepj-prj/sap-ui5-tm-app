# Part 4: Migrating Python Backend Apps (FastAPI + FastMCP) from API Key Auth to XSUAA

> **Series:** Building a Freestyle SAPUI5 App on SAP BTP for Work Zone
> - **Part 1** — Overview, Concepts & Architecture
> - **Part 2** — Project Setup, Configuration & Deployment
> - **Part 3** — XSUAA Authorization
> - **Part 4** — Migrating Python Backend Apps (FastAPI + FastMCP) from API Key Auth to XSUAA *(this file)*

---

## Current State

You have two Python applications deployed on SAP BTP Cloud Foundry:

1. **API Layer** — a FastAPI app that connects to a remote PostgreSQL database on EC2. Currently protected by a simple API key: if you provide the correct key, you get access to all data. No user identity, no role-based access.

2. **MCP Server** — a FastMCP app that wraps tools, resources, and prompts. The MCP server calls the API layer. Currently either unprotected or also relying on the same API key.

Both apps are already registered as BTP destinations.

### Why the Change

To surface these services through a SAPUI5 app in SAP Build Work Zone, the managed AppRouter handles authentication via XSUAA and can propagate the user's JWT to your backends. Switching from API key to XSUAA-based JWT authentication gives you user identity (who is calling), role-based scopes (what they're allowed to do), token expiry (no long-lived static keys), and compatibility with the Work Zone managed AppRouter flow.

---

## What Changes and What Doesn't

| Component | What changes | What stays the same |
|-----------|-------------|---------------------|
| FastAPI app | Auth middleware: API key → JWT validation + scope enforcement | All business logic, database queries, endpoint structure |
| FastMCP app | Add JWT validation middleware + user token exchange for API layer calls | Tool/resource/prompt definitions, MCP protocol logic |
| PostgreSQL on EC2 | Nothing | Connection string, schema, data |
| BTP Destination | Authentication type: `NoAuthentication` → `OAuth2UserTokenExchange` | URL, proxy type, additional properties |
| `manifest.yaml` / CF deployment | Add XSUAA service binding to both apps, remove API_KEY env | App name, routes, memory, buildpack |

The core point: your business logic doesn't change. You're swapping the auth middleware layer and adding a service binding.

---

## Step 1: Create an XSUAA Service Instance for Your Backend

Your backend apps need their own XSUAA service instance to validate incoming JWTs. Create an `xs-security.json` for the backend:

```json
{
  "xsappname": "tm-api-layer",
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
      "description": "Can view the dashboard",
      "scope-references": ["$XSAPPNAME.ViewDashboard"]
    },
    {
      "name": "DataAnalyst",
      "description": "Can view and query data",
      "scope-references": [
        "$XSAPPNAME.ViewDashboard",
        "$XSAPPNAME.QueryData"
      ]
    }
  ]
}
```

Create the service instance and a service key:

```bash
cf create-service xsuaa application tm-api-layer-uaa -c xs-security.json
cf create-service-key tm-api-layer-uaa tm-api-layer-uaa-key
```

Bind it to your FastAPI app:

```bash
cf bind-service <your-fastapi-app-name> tm-api-layer-uaa
cf restage <your-fastapi-app-name>
```

After binding, the XSUAA credentials are injected into the `VCAP_SERVICES` environment variable of your app.

> **Note:** If your UI5 app's XSUAA and this backend XSUAA are in the same subaccount, token exchange works automatically. If they're in different subaccounts, you need cross-trust configuration — see Part 3, Step 2.

---

## Step 2: Modify Your FastAPI App

### Install Dependencies

Add these to your `requirements.txt`:

```
sap-xssec>=4.0.0
cfenv>=0.5.3
```

`sap-xssec` is SAP's official Python library for XSUAA JWT validation. `cfenv` helps parse `VCAP_SERVICES`.

### Create the Auth Middleware

Create a new file `auth.py` (or add to your existing structure):

```python
import os
import json
from functools import lru_cache
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sap_xssec import create_security_context

# --- XSUAA configuration ---

@lru_cache()
def get_xsuaa_credentials():
    """Extract XSUAA credentials from VCAP_SERVICES (injected by CF service binding)."""
    vcap = json.loads(os.environ.get("VCAP_SERVICES", "{}"))
    xsuaa_list = vcap.get("xsuaa", [])
    if not xsuaa_list:
        raise RuntimeError("No XSUAA service bound. Run: cf bind-service <app> <xsuaa-instance>")
    return xsuaa_list[0]["credentials"]


# --- JWT validation dependency ---

bearer_scheme = HTTPBearer(auto_error=True)

async def validate_jwt(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)
) -> dict:
    """
    FastAPI dependency that validates the incoming JWT against XSUAA.
    Returns the decoded token claims (including scopes) on success.
    Raises 401 on invalid/expired token.
    """
    token = credentials.credentials
    xsuaa_creds = get_xsuaa_credentials()

    try:
        security_context = create_security_context(token, xsuaa_creds)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token validation failed: {str(e)}")

    # Extract useful claims from the security context
    return {
        "user_name": security_context.get_logon_name(),
        "email": security_context.get_email(),
        "scopes": security_context.get_granted_scopes() or [],
        "security_context": security_context  # Keep reference for scope checks
    }


# --- Scope-checking dependency ---

def require_scope(scope_name: str):
    """
    Returns a FastAPI dependency that checks for a specific local scope.
    Usage: @app.get("/data", dependencies=[Depends(require_scope("QueryData"))])
    """
    async def _check(token_info: dict = Depends(validate_jwt)):
        security_context = token_info["security_context"]
        if not security_context.check_local_scope(scope_name):
            raise HTTPException(
                status_code=403,
                detail=f"Missing required scope: {scope_name}"
            )
        return token_info
    return _check
```

### Update Your FastAPI Endpoints

**Before** (API key auth):

```python
from fastapi import FastAPI, Header, HTTPException

app = FastAPI()

async def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key != os.environ.get("API_KEY"):
        raise HTTPException(status_code=401, detail="Invalid API key")

@app.get("/employees")
async def get_employees(auth=Depends(verify_api_key)):
    # query PostgreSQL and return data
    ...

@app.post("/query")
async def run_query(query_request: QueryRequest, auth=Depends(verify_api_key)):
    # execute query against PostgreSQL
    ...
```

**After** (XSUAA JWT auth):

```python
from fastapi import FastAPI, Depends
from auth import validate_jwt, require_scope

app = FastAPI()

@app.get("/employees", dependencies=[Depends(require_scope("ViewDashboard"))])
async def get_employees(token_info: dict = Depends(validate_jwt)):
    # Same business logic — query PostgreSQL and return data
    # Now you also have token_info["user_name"] and token_info["email"]
    ...

@app.post("/query", dependencies=[Depends(require_scope("QueryData"))])
async def run_query(query_request: QueryRequest, token_info: dict = Depends(validate_jwt)):
    # Same business logic — execute query against PostgreSQL
    # You can log who executed the query: token_info["user_name"]
    ...

@app.get("/me")
async def get_current_user(token_info: dict = Depends(validate_jwt)):
    """Endpoint for UI5 app to check current user's scopes."""
    return {
        "user": token_info["user_name"],
        "email": token_info["email"],
        "scopes": token_info["scopes"]
    }
```

### Principal Propagation: Forwarding User Identity to Downstream Services

When your MCP server receives a request from a user (via Work Zone or Joule), the user's JWT arrives in the `Authorization` header. When the MCP server then calls your API layer, it should forward that user identity rather than authenticating as a technical service account. This is called **principal propagation**.

The mechanism is a **user token exchange**: the MCP server takes the incoming user JWT and exchanges it at the XSUAA token endpoint for a new JWT that is still associated with the original user but is valid for the API layer's audience. The API layer then validates this exchanged token and sees the real user — with their scopes, email, and identity intact.

This matters because:

- The API layer can enforce scopes **per user**, not per calling service
- Query logs show "pradeep@company.com queried the employees table," not "mcp-server-technical-account queried"
- You get a consistent audit trail across every hop in the chain
- If a user shouldn't have `QueryData` access, the API layer rejects the call even if the MCP server itself has broad permissions

Here's a helper module for performing the user token exchange in Python:

```python
# token_exchange.py
import os
import json
import httpx
from functools import lru_cache

@lru_cache()
def get_xsuaa_credentials():
    """Get XSUAA credentials from VCAP_SERVICES."""
    vcap = json.loads(os.environ.get("VCAP_SERVICES", "{}"))
    xsuaa_list = vcap.get("xsuaa", [])
    if not xsuaa_list:
        raise RuntimeError("No XSUAA service bound")
    return xsuaa_list[0]["credentials"]


async def exchange_user_token(incoming_token: str, target_client_id: str = None) -> str:
    """
    Exchange a user JWT for a new JWT valid for a downstream service.
    The new token preserves the original user's identity and scopes.

    Args:
        incoming_token: The user's JWT received on the inbound request
        target_client_id: The client ID of the target service's XSUAA instance.
                          If None, uses the same XSUAA instance (same-subaccount scenario).
    """
    creds = get_xsuaa_credentials()
    token_url = f"{creds['url']}/oauth/token"

    data = {
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": incoming_token,
        "client_id": creds["clientid"],
        "client_secret": creds["clientsecret"],
        "response_type": "token",
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(token_url, data=data)
        response.raise_for_status()
        return response.json()["access_token"]
```

And here's how the MCP server uses it when calling the API layer:

```python
# In your MCP server tool implementation
from token_exchange import exchange_user_token

async def call_api_layer(endpoint: str, user_token: str, method: str = "GET", payload: dict = None):
    """
    Call the API layer with the user's propagated identity.
    The API layer sees the original user, not the MCP server.
    """
    # Exchange the user's token for one valid at the API layer
    exchanged_token = await exchange_user_token(user_token)

    headers = {"Authorization": f"Bearer {exchanged_token}"}
    api_base = os.environ.get("API_LAYER_URL")

    async with httpx.AsyncClient() as client:
        if method == "GET":
            response = await client.get(f"{api_base}/{endpoint}", headers=headers)
        elif method == "POST":
            response = await client.post(f"{api_base}/{endpoint}", headers=headers, json=payload)
        response.raise_for_status()
        return response.json()
```

> **Same-subaccount shortcut:** If both the MCP server and the API layer are bound to the same XSUAA service instance (same subaccount, same `xsappname`), you can often forward the incoming JWT directly without exchange — the token is already valid for both services. Token exchange becomes necessary when the services have different XSUAA instances or are in different subaccounts.

---

## Step 3: Modify Your FastMCP App for Principal Propagation

The MCP server now has two responsibilities: validate the incoming user JWT (to know who's calling), and propagate that user's identity when calling the API layer (so the API layer enforces scopes against the real user).

### Add XSUAA Middleware

The FastMCP framework uses Starlette under the hood, so you add middleware similarly to FastAPI:

```python
from fastmcp import FastMCP
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from sap_xssec import create_security_context
import os, json

mcp = FastMCP("Talent Management MCP Server")

class XSUAAAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip auth for health checks and MCP protocol negotiation
        if request.url.path in ["/health", "/sse", "/"]:
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"error": "Missing Bearer token"}
            )

        token = auth_header.replace("Bearer ", "")
        vcap = json.loads(os.environ.get("VCAP_SERVICES", "{}"))
        xsuaa_creds = vcap.get("xsuaa", [{}])[0].get("credentials", {})

        try:
            security_context = create_security_context(token, xsuaa_creds)
            # Store user info AND the raw token in request state
            # The raw token is needed for principal propagation to the API layer
            request.state.user = security_context.get_logon_name()
            request.state.email = security_context.get_email()
            request.state.scopes = security_context.get_granted_scopes() or []
            request.state.user_token = token  # ← Preserve for downstream calls
        except Exception as e:
            return JSONResponse(
                status_code=401,
                content={"error": f"Token validation failed: {str(e)}"}
            )

        return await call_next(request)

# Add middleware to the underlying Starlette app
mcp.app.add_middleware(XSUAAAuthMiddleware)
```

The key addition compared to the earlier version is `request.state.user_token` — storing the raw incoming JWT so your tool implementations can use it for principal propagation.

### Update Tool Implementations to Propagate the User

In your MCP tool definitions, access the stored token and pass it to the API layer via the token exchange helper:

```python
from token_exchange import exchange_user_token
import httpx, os

@mcp.tool()
async def get_employees(department: str = None, ctx=None) -> str:
    """Retrieve employee data from the talent management system."""
    # Get the user's token from the request context
    user_token = ctx.request.state.user_token

    # Exchange for a token valid at the API layer (preserves user identity)
    api_token = await exchange_user_token(user_token)

    # Call the API layer — it sees the original user, not "mcp-server"
    api_base = os.environ.get("API_LAYER_URL")
    params = {"department": department} if department else {}

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{api_base}/employees",
            headers={"Authorization": f"Bearer {api_token}"},
            params=params
        )
        response.raise_for_status()
        return response.json()


@mcp.tool()
async def run_query(sql_query: str, ctx=None) -> str:
    """Execute a data query against the talent management database."""
    user_token = ctx.request.state.user_token
    api_token = await exchange_user_token(user_token)

    api_base = os.environ.get("API_LAYER_URL")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{api_base}/query",
            headers={"Authorization": f"Bearer {api_token}"},
            json={"query": sql_query}
        )
        # If the user lacks the QueryData scope, the API layer returns 403
        # This means scope enforcement happens at the API layer, per user
        response.raise_for_status()
        return response.json()
```

> **Note:** The exact way to access the request context in FastMCP tool functions depends on your FastMCP version. The `ctx` parameter pattern shown above is one approach — consult your FastMCP version's documentation for the correct way to access `request.state` from within tool handlers.

> **Note on SSE transport:** If you're using SSE transport behind the managed AppRouter, ensure the AppRouter doesn't buffer the SSE stream — set `"timeout": 300000` on the route in `xs-app.json`.

### The Full Principal Propagation Chain

With this setup, the user's identity flows end-to-end:

```
User "pradeep@company.com" opens Work Zone
    │
    ▼
Managed AppRouter → issues JWT for pradeep
    │
    ▼
MCP Server receives JWT → validates → sees "pradeep@company.com"
    │  Exchanges token (preserving pradeep's identity)
    ▼
API Layer receives exchanged JWT → validates → sees "pradeep@company.com"
    │  Checks: does pradeep have QueryData scope? → Yes → execute
    ▼
PostgreSQL → query runs, result returned
    │
    ▼
Audit log: "pradeep@company.com executed query X at timestamp Y"
```

If a different user without the `QueryData` scope tries the same flow, the API layer returns 403 — even though the MCP server itself has access. The authorization decision is made based on the *user*, not the *calling service*.

---

## Step 4: Update the CF Deployment

### Update `manifest.yaml`

Add the XSUAA service binding to your apps:

```yaml
applications:
  - name: tm-api-layer
    memory: 256M
    buildpack: python_buildpack
    command: gunicorn main:app -w 2 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8080
    services:
      - tm-api-layer-uaa          # XSUAA binding for JWT validation
    env:
      DATABASE_URL: "${DATABASE_URL}"

  - name: tm-mcp-server
    memory: 256M
    buildpack: python_buildpack
    services:
      - tm-api-layer-uaa          # Same XSUAA — validates inbound JWT + exchanges for API layer calls
    env:
      API_LAYER_URL: "https://tm-api-layer.cfapps.<region>.hana.ondemand.com"
```

> **Both apps bind to the same XSUAA instance.** This is the simplest principal propagation setup — since they share the same `xsappname` and credentials, the MCP server can exchange user tokens for the API layer without cross-trust configuration. If you later move them to separate subaccounts, you'd create separate XSUAA instances and configure the `authorities` / `$ACCEPT_GRANTED_AUTHORITIES` properties (see Part 3, Step 2).

### Update `requirements.txt`

For the API layer:

```
fastapi>=0.100.0
uvicorn>=0.23.0
gunicorn>=21.2.0
sap-xssec>=4.0.0
cfenv>=0.5.3
psycopg2-binary>=2.9.0
# ... your existing dependencies
```

For the MCP server (add `httpx` for async HTTP calls with token propagation):

```
fastmcp>=0.1.0
sap-xssec>=4.0.0
cfenv>=0.5.3
httpx>=0.24.0
# ... your existing dependencies
```

### Deploy

```bash
cf push tm-api-layer
cf push tm-mcp-server   # If updated
```

Or if you're using `cf deploy` with an MTA, update your `mta.yaml` to include the XSUAA resource and bindings.

---

## Step 5: Update the BTP Destination

Your existing BTP destination for the API layer needs to change from no-auth to token exchange.

**BTP Cockpit** → **Connectivity** → **Destinations** → edit `my-api-layer`

| Property | Old Value | New Value |
|----------|-----------|-----------|
| Authentication | `NoAuthentication` | `OAuth2UserTokenExchange` |
| Token Service URL | *(not set)* | `https://<subdomain>.authentication.<region>.hana.ondemand.com/oauth/token` |
| Client ID | *(not set)* | *(from `cf service-key tm-api-layer-uaa tm-api-layer-uaa-key`)* |
| Client Secret | *(not set)* | *(from the same service key)* |

To get the client credentials:

```bash
cf service-key tm-api-layer-uaa tm-api-layer-uaa-key
```

This outputs JSON containing `clientid`, `clientsecret`, and `url` (the token service base URL). Use these values in the destination configuration.

Keep the existing additional properties:

| Property | Value |
|----------|-------|
| `sap.cloud.service` | `my.ui5.app` |
| `HTML5.DynamicDestination` | `true` |

---

## Step 6: Test the Migration

### Test locally (without CF)

You can test JWT validation locally by getting a token from your XSUAA instance:

```bash
# Get client credentials from the service key
cf service-key tm-api-layer-uaa tm-api-layer-uaa-key

# Request a token using client credentials grant
curl -X POST "https://<subdomain>.authentication.<region>.hana.ondemand.com/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=<clientid>&client_secret=<clientsecret>"

# Use the access_token to call your API
curl -H "Authorization: Bearer <access_token>" \
  https://tm-api-layer.cfapps.<region>.hana.ondemand.com/employees
```

### Test via Work Zone (full principal propagation)

1. Open your Work Zone site
2. Launch the UI5 app tile
3. The app should call `/api/employees` which routes through the managed AppRouter
4. The AppRouter exchanges the user's token and forwards it to your API layer
5. Your FastAPI app validates the JWT and returns data (or 403 if scopes are missing)
6. Check your API layer logs — the user identity should show the actual Work Zone user, not a technical account

### Test the MCP server path (via Joule or direct)

1. Open Joule in Work Zone and trigger your custom agent
2. The agent calls the MCP server with the user's JWT
3. The MCP server exchanges the token and calls the API layer
4. The API layer validates the exchanged token — it should still see the original user
5. If the user lacks the required scope, the API layer returns 403 and the MCP server surfaces the error

### Test scope enforcement

1. Assign a test user only the "TM Dashboard Viewer" role collection (which has `ViewDashboard` but not `QueryData`)
2. Log in as that user and try to access the dashboard — should work
3. Try to submit a data query — should get 403 from the API layer
4. This confirms that authorization is enforced per user, end-to-end

---

## Migration Checklist

- [ ] `xs-security.json` created with scopes and role templates for the backend
- [ ] XSUAA service instance created: `cf create-service xsuaa application tm-api-layer-uaa -c xs-security.json`
- [ ] Service key created: `cf create-service-key tm-api-layer-uaa tm-api-layer-uaa-key`
- [ ] XSUAA bound to FastAPI app: `cf bind-service <app> tm-api-layer-uaa`
- [ ] XSUAA bound to MCP server: `cf bind-service <mcp-app> tm-api-layer-uaa`
- [ ] `sap-xssec` and `cfenv` added to `requirements.txt` for both apps
- [ ] `httpx` added to MCP server's `requirements.txt` for async token exchange
- [ ] `auth.py` created with `validate_jwt` and `require_scope` for FastAPI
- [ ] `token_exchange.py` created with `exchange_user_token` for MCP server
- [ ] FastAPI endpoints updated to use `Depends(validate_jwt)` / `Depends(require_scope(...))`
- [ ] `/me` endpoint added to FastAPI for UI5 scope checking
- [ ] MCP server middleware added for JWT validation and user token storage
- [ ] MCP server tool implementations updated to propagate user token via exchange
- [ ] API key auth removed from both apps (or deprecated)
- [ ] Both apps redeployed: `cf push tm-api-layer` and `cf push tm-mcp-server`
- [ ] BTP destination updated to `OAuth2UserTokenExchange` with correct credentials
- [ ] Role collections assigned to test users in BTP cockpit
- [ ] End-to-end test via Work Zone confirmed (UI5 → API layer)
- [ ] End-to-end test via Joule confirmed (Joule → MCP server → API layer)
- [ ] Scope enforcement test: user without `QueryData` gets 403 on query endpoints

---

## Architecture After Migration (with Principal Propagation)

```
┌─────────────────────────────────────────────────────────┐
│                  SAP Build Work Zone                     │
│              (Fiori Launchpad + Managed AppRouter)       │
│                                                         │
│   ┌─────────────────────┐                               │
│   │   SAPUI5 App         │  HTML5 App Repo              │
│   └────────┬────────────┘                               │
│            │  Bearer JWT (user: pradeep@company.com)     │
└────────────┼────────────────────────────────────────────┘
             │
             ▼
┌────────────────────────┐     ┌─────────────────────────┐
│   FastAPI (CF)         │────▶│  PostgreSQL (EC2)        │
│   JWT validated via    │     │                          │
│   sap-xssec            │     └─────────────────────────┘
│   Sees: pradeep        │
│   Scopes enforced      │
└────────────────────────┘
             ▲
             │  User token exchange (still pradeep)
┌────────────────────────┐
│   FastMCP Server (CF)  │
│   JWT validated via    │
│   sap-xssec            │
│   Sees: pradeep        │
│   Propagates identity  │
└────────────────────────┘
             ▲
             │  Bearer JWT (user: pradeep@company.com)
      Joule (Work Zone) / UI5 App
```

Every service in the chain knows the request originated from `pradeep@company.com`. Authorization decisions at the API layer are made against the real user's scopes, not a technical service account. Audit logs at every hop reflect the actual user.

---

**Previous:** [Part 3 — XSUAA Authorization](./03-xsuaa-authorization.md)
