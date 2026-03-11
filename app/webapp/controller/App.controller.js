sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Lib",
    "sap/m/Dialog",
    "sap/m/Input",
    "sap/m/Button",
    "sap/m/Label",
    "sap/m/VBox",
    "sap/m/MessageToast"
], function (Controller, Lib, Dialog, Input, Button, Label, VBox, MessageToast) {
    "use strict";

    return Controller.extend("com.sap.tm.dashboard.controller.App", {
        onInit: function () {
            // Ensure sap.viz is loaded for chart tabs
            Lib.load({ name: "sap.viz" });
        },

        onTabSelect: function (oEvent) {
            var sKey = oEvent.getParameter("key");
            this.getOwnerComponent().getModel("app").setProperty("/selectedTab", sKey);
        },

        onServerChange: function (oEvent) {
            var sKey = oEvent.getParameter("selectedItem").getKey();
            var oServerModel = this.getOwnerComponent().getModel("server");
            var aServers = oServerModel.getProperty("/servers");
            var oSelected = aServers.find(function (s) { return s.key === sKey; });
            if (oSelected) {
                oServerModel.setProperty("/tmBaseUrl", oSelected.tmUrl);
                oServerModel.setProperty("/mcpBaseUrl", oSelected.mcpUrl);
            }
        },

        onOpenSettings: function () {
            var oServerModel = this.getOwnerComponent().getModel("server");
            var that = this;

            if (!this._oSettingsDialog) {
                var oApiKeyInput = new Input({
                    type: "Text",
                    placeholder: "Enter API Key",
                    value: oServerModel.getProperty("/apiKey")
                });
                this._apiKeyInput = oApiKeyInput;

                this._oSettingsDialog = new Dialog({
                    title: "Settings",
                    content: new VBox({
                        items: [
                            new Label({ text: "API Key (for TM endpoints)" }),
                            oApiKeyInput
                        ]
                    }).addStyleClass("sapUiSmallMargin"),
                    beginButton: new Button({
                        text: "Save",
                        type: "Emphasized",
                        press: function () {
                            var sApiKey = that._apiKeyInput.getValue();
                            oServerModel.setProperty("/apiKey", sApiKey);
                            sessionStorage.setItem("tmApiKey", sApiKey);
                            MessageToast.show("API key saved");
                            that._oSettingsDialog.close();
                        }
                    }),
                    endButton: new Button({
                        text: "Cancel",
                        press: function () {
                            that._oSettingsDialog.close();
                        }
                    })
                });
            }

            this._oSettingsDialog.open();
        }
    });
});
