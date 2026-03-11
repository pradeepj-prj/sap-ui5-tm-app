# Making Your Custom Joule Agent Available in SAP Build Work Zone

## Context

You have already built and deployed a custom Joule agent via Joule Studio in SAP Build. The agent works within the Joule Studio test/chat interface. This guide covers the configuration steps needed to surface that agent through the standard Joule copilot interface embedded in SAP Build Work Zone, so that business users can interact with it from their launchpad.

---

## Prerequisites (Confirm These First)

- **Joule Studio** is accessible via SAP Build Lobby (you have this)
- **SAP Build Process Automation** is subscribed with the `build-default` plan
- **Joule service** is subscribed with the `foundation` or `standard` plan
- **SAP Cloud Identity Services** (Identity Authentication + Identity Provisioning) is activated and configured as the trust provider for your subaccount
- **SAP Build Work Zone** (standard or advanced edition) is subscribed in a subaccount within the same global account
- Your custom agent has been **released and deployed** to an environment in Joule Studio's Control Tower

---

## Configuration Steps

### Step 1: Ensure the Joule Booster Has Been Run

Go to your **Global Account** in the BTP Cockpit → **Boosters** → search for the **"Setting Up Joule"** booster.

If it hasn't been run yet, execute it. The booster automates the creation of service instances, trust configuration, and the initial formation that links Joule to other SAP Build components.

> **Note:** Running the booster requires **Global Account Administrator** privileges. If you don't have this role (e.g., you cannot see "System Landscape" in the global account left nav), you will need someone with admin access to run it or to perform Steps 2–3 manually.

---

### Step 2: Configure the Formation (Global Account Level)

This is the most commonly missed step.

**Global Account** → **System Landscape** → **Formations**

1. Locate the formation created by the Joule booster (or create a new one if needed)
2. Ensure the formation includes **both**:
   - Your **SAP Build Process Automation** system (the one hosting Joule Studio)
   - Your **SAP Build Work Zone** system (from the subaccount where Work Zone is subscribed)
3. Within the formation properties:
   - Enable **"Enable Capability Deployment"**
   - Enable **"Enable Joule Icon in Integrated System"**
4. Verify the **Joule property** is toggled ON for the formation

> **This step requires Global Account Administrator access.** If "System Landscape" is not visible in your global account left nav, your user lacks this role.

---

### Step 3: Verify the Navigation Service Destination

In the **subaccount** where Joule is set up:

**Subaccount** → **Connectivity** → **Destinations** → find **"NavigationService"**

1. Export the destination and confirm `tokenServiceURLType` is set to `Dedicated` (not `Common`)
2. If it's set to `Common`, edit the destination, change it to `Dedicated`, and save
3. If the destination doesn't exist, the Joule booster may not have completed successfully — re-run or create it manually per SAP's integration guide

> For Joule setups done after October 2025, this destination is typically configured automatically by the booster.

---

### Step 4: Associate Destinations with Your Environment (Control Tower)

If your agent calls external services (e.g., your MCP server or API layer on Cloud Foundry), those BTP destinations need to be linked to the environment where your agent is deployed.

**SAP Build Lobby** → **Control Tower** → **Destinations**

1. Find the destination(s) pointing to your backend services
2. Click **"..."** → **Associate Environments**
3. Select **Specific Environments** and choose the environment where your agent is deployed
4. Confirm

---

### Step 5: Share Access to Your Joule Project

By default, only users with explicit Execute or Admin access can use your custom agent. Other users will get a generic Joule fallback response — it won't trigger your agent.

**SAP Build Lobby** → open your Joule agent/skill project → **Share**

1. Share with either:
   - Up to **5 individual users**, OR
   - Up to **10 user groups** (configured in SAP Cloud Identity Services)
2. Grant **Execute** access (minimum required for consumption)
3. **Redeploy** the agent after sharing — this is required for the access changes to take effect

> You cannot mix individual users and groups in the same project. If you add both, only the groups will be considered.

---

### Step 6: Refresh Work Zone Content (If Needed)

In your **Work Zone admin** (Site Manager):

1. Go to **Content Manager** → **Content Explorer**
2. Refresh the content channel associated with SAP Build / Joule
3. Open your Work Zone site and verify the **Joule icon** appears in the top shell bar

---

### Step 7: Test End-to-End

1. Open your **Work Zone site** as a business user (not as admin)
2. Click the **Joule icon** in the shell bar to open the Joule side panel
3. Type a message that matches your agent's intent / activation phrase
4. Verify that Joule routes to your custom agent rather than giving a generic response

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Joule icon not visible in Work Zone | Formation not configured, or Joule property not enabled | Complete Step 2 |
| Joule opens but custom agent doesn't trigger | Access not shared, or project not redeployed after sharing | Complete Step 5, then redeploy |
| Joule shows blank screen | IAS / SSO misconfiguration | Check Identity Authentication trust settings in your subaccount |
| Navigation button missing after Joule setup | NavigationService destination misconfigured | Complete Step 3 |
| Agent works in Joule Studio test but not in Work Zone Joule | Destination not associated with environment | Complete Step 4 |
| Generic fallback response for all users | Users lack Execute access on the project | Share the project and redeploy |

---

## Architecture Summary

```
Business User
    │
    ▼
SAP Build Work Zone (Launchpad)
    │
    ▼
Joule Copilot (embedded side panel)
    │
    ▼
Joule Runtime ◄── Formation links Build Process Automation + Work Zone
    │
    ▼
Your Custom Agent (deployed in Joule Studio environment)
    │
    ▼
Actions / API Calls (via BTP Destinations)
    │
    ▼
Your Backend Services (MCP Server, API Layer on CF, etc.)
```

---

## Key References

- [Joule Integration Guide (SAP Help)](https://help.sap.com/doc/de3af3c0f81642dbaa4d36172ed57a72/CLOUD/en-US/79bfc83ab386450c8cd9c7937ce26a3a.pdf)
- [Getting Started with Joule Studio – Part 3: Integrate with Work Zone](https://community.sap.com/t5/technology-blog-posts-by-sap/getting-started-with-joule-studio-in-sap-build-part-3-integrate-joule/ba-p/14159716)
- [Getting Started with Joule Studio – Part 4: Managing Access](https://community.sap.com/t5/technology-blog-posts-by-sap/getting-started-with-joule-studio-in-sap-build-part-4-managing-access-to/ba-p/14162116)
- [Extend Joule with Joule Studio – SAP Architecture Center](https://architecture.learning.sap.com/docs/ref-arch/06ff6062dc/3)
