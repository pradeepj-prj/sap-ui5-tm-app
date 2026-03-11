sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel"
], function (UIComponent, JSONModel) {
    "use strict";

    return UIComponent.extend("com.sap.tm.dashboard.Component", {
        metadata: {
            manifest: "json"
        },

        init: function () {
            UIComponent.prototype.init.apply(this, arguments);

            // Server configuration model
            var oServerModel = new JSONModel({
                tmBaseUrl: "/tm",
                mcpBaseUrl: "/mcp",
                apiKey: sessionStorage.getItem("tmApiKey") || "",
                servers: [
                    { key: "btp", name: "BTP (Destination)", tmUrl: "/tm", mcpUrl: "/mcp" },
                    { key: "local", name: "Local Dev", tmUrl: "http://localhost:8000", mcpUrl: "http://localhost:8001" }
                ],
                selectedServer: "btp"
            });
            this.setModel(oServerModel, "server");

            // App state model
            var oAppModel = new JSONModel({
                selectedTab: "overview",
                lastUpdated: null,
                pollingEnabled: true
            });
            this.setModel(oAppModel, "app");
        }
    });
});
