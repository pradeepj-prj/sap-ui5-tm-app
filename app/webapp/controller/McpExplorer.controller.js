sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/List",
    "sap/m/StandardListItem",
    "sap/m/Text",
    "sap/m/VBox",
    "sap/m/ObjectStatus"
], function (Controller, JSONModel, Dialog, Button, List, StandardListItem, Text, VBox, ObjectStatus) {
    "use strict";

    return Controller.extend("com.sap.tm.dashboard.controller.McpExplorer", {

        onInit: function () {
            var oMcpModel = new JSONModel(sap.ui.require.toUrl("com/sap/tm/dashboard/model/mcpCatalog.json"));
            oMcpModel.setDefaultBindingMode("OneWay");
            this.getView().setModel(oMcpModel, "mcp");
        },

        /**
         * Handler for tool item press. Opens a dialog showing tool details
         * including the full parameter list.
         */
        onToolSelect: function (oEvent) {
            var oItem = oEvent.getParameter("listItem");
            var oContext = oItem.getBindingContext("mcp");
            var oTool = oContext.getObject();

            // Build parameter list items
            var aParamItems = oTool.parameters.map(function (param) {
                return new StandardListItem({
                    title: param.name,
                    description: "Type: " + param.type,
                    info: param.required ? "Required" : "Optional",
                    infoState: param.required ? "Warning" : "Success",
                    icon: param.required ? "sap-icon://sys-enter-2" : "sap-icon://hint"
                });
            });

            // If no parameters, show a placeholder
            if (aParamItems.length === 0) {
                aParamItems.push(new StandardListItem({
                    title: "No parameters",
                    icon: "sap-icon://information"
                }));
            }

            var oParamList = new List({
                headerText: "Parameters",
                items: aParamItems
            });

            var oDialog = new Dialog({
                title: oTool.name,
                contentWidth: "480px",
                content: new VBox({
                    items: [
                        new Text({ text: oTool.description }).addStyleClass("sapUiSmallMarginBottom"),
                        new ObjectStatus({
                            text: "Category: " + oTool.category,
                            state: "Information"
                        }).addStyleClass("sapUiSmallMarginBottom"),
                        oParamList
                    ]
                }).addStyleClass("sapUiSmallMargin"),
                endButton: new Button({
                    text: "Close",
                    press: function () {
                        oDialog.close();
                    }
                }),
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            oDialog.open();
        }
    });
});
