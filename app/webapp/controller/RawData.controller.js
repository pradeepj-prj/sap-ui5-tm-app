sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Text",
    "sap/m/VBox",
    "sap/m/MessageToast",
    "../model/models"
], function (Controller, JSONModel, Dialog, Button, Text, VBox, MessageToast, models) {
    "use strict";

    return Controller.extend("com.sap.tm.dashboard.controller.RawData", {

        onInit: function () {
            var oModel = new JSONModel({
                entries: [],
                filteredEntries: [],
                types: [{ key: "", text: "All Types" }],
                operations: [{ key: "", text: "All Operations" }],
                errorsOnly: false,
                searchText: ""
            });
            oModel.setSizeLimit(5000);
            this.getView().setModel(oModel, "raw");
            this._loadData();
        },

        _loadData: function () {
            var sMcpBase = this.getOwnerComponent().getModel("server").getProperty("/mcpBaseUrl");
            var oModel = this.getView().getModel("raw");
            var that = this;

            models.fetchJson(sMcpBase + "/audit/recent?limit=500").then(function (data) {
                var aEntries = Array.isArray(data) ? data : (data.entries || []);

                // Add a truncated parameters summary to each entry
                aEntries.forEach(function (entry) {
                    var sParams = "";
                    if (entry.parameters) {
                        try {
                            sParams = typeof entry.parameters === "string"
                                ? entry.parameters
                                : JSON.stringify(entry.parameters);
                        } catch (e) {
                            sParams = String(entry.parameters);
                        }
                    }
                    entry.parametersSummary = sParams.length > 80 ? sParams.substring(0, 80) + "..." : sParams;
                    if (typeof entry.duration_ms === "number") {
                        entry.duration_ms = Math.round(entry.duration_ms);
                    }
                });

                oModel.setProperty("/entries", aEntries);

                // Extract unique types
                var oTypes = {};
                var oOps = {};
                aEntries.forEach(function (e) {
                    if (e.call_type) { oTypes[e.call_type] = true; }
                    var sOp = e.tool_name || e.operation;
                    if (sOp) { oOps[sOp] = true; }
                });

                var aTypes = [{ key: "", text: "All Types" }];
                Object.keys(oTypes).sort().forEach(function (k) {
                    aTypes.push({ key: k, text: k });
                });
                oModel.setProperty("/types", aTypes);

                var aOps = [{ key: "", text: "All Operations" }];
                Object.keys(oOps).sort().forEach(function (k) {
                    aOps.push({ key: k, text: k });
                });
                oModel.setProperty("/operations", aOps);

                // Apply initial (no) filter
                that._applyFilters();
            }).catch(function (err) {
                MessageToast.show("Failed to load audit data: " + err.message);
            });
        },

        onApplyFilters: function () {
            this._applyFilters();
        },

        _applyFilters: function () {
            var oModel = this.getView().getModel("raw");
            var aEntries = oModel.getProperty("/entries") || [];

            var oTypeSelect = this.byId("rawTypeFilter");
            var oOpSelect = this.byId("rawOperationFilter");

            var sType = oTypeSelect ? oTypeSelect.getSelectedKey() : "";
            var sOp = oOpSelect ? oOpSelect.getSelectedKey() : "";
            var bErrorsOnly = oModel.getProperty("/errorsOnly");
            var sSearch = (oModel.getProperty("/searchText") || "").toLowerCase();

            var aFiltered = aEntries.filter(function (entry) {
                if (sType && entry.call_type !== sType) {
                    return false;
                }
                if (sOp && (entry.tool_name || entry.operation) !== sOp) {
                    return false;
                }
                if (bErrorsOnly && !!entry.success) {
                    return false;
                }
                if (sSearch) {
                    var sHaystack = [
                        entry.id, entry.tool_name || entry.operation, entry.call_type,
                        entry.parametersSummary, entry.timestamp
                    ].join(" ").toLowerCase();
                    if (sHaystack.indexOf(sSearch) === -1) {
                        return false;
                    }
                }
                return true;
            });

            oModel.setProperty("/filteredEntries", aFiltered);
        },

        onExport: function () {
            var oModel = this.getView().getModel("raw");
            var aData = oModel.getProperty("/filteredEntries") || [];

            if (aData.length === 0) {
                MessageToast.show("No data to export");
                return;
            }

            sap.ui.require(["sap/ui/export/Spreadsheet"], function (Spreadsheet) {
                var oSettings = {
                    workbook: {
                        columns: [
                            { label: "ID", property: "id" },
                            { label: "Timestamp", property: "timestamp" },
                            { label: "Operation", property: "operation" },
                            { label: "Type", property: "call_type" },
                            { label: "Duration (ms)", property: "duration_ms", type: "Number" },
                            { label: "Success", property: "success" },
                            { label: "Parameters", property: "parametersSummary" }
                        ]
                    },
                    dataSource: aData,
                    fileName: "AuditData_" + new Date().toISOString().substring(0, 10) + ".xlsx"
                };

                var oSpreadsheet = new Spreadsheet(oSettings);
                oSpreadsheet.build().then(function () {
                    MessageToast.show("Export complete");
                }).finally(function () {
                    oSpreadsheet.destroy();
                });
            });
        },

        onRowPress: function (oEvent) {
            var oItem = oEvent.getParameter("listItem");
            var oContext = oItem.getBindingContext("raw");
            var oEntry = oContext.getObject();

            var sJson;
            try {
                sJson = JSON.stringify(oEntry, null, 2);
            } catch (e) {
                sJson = String(oEntry);
            }

            var oDialog = new Dialog({
                title: "Audit Entry Detail — " + (oEntry.tool_name || oEntry.operation || oEntry.id),
                contentWidth: "600px",
                contentHeight: "400px",
                resizable: true,
                draggable: true,
                content: [
                    new VBox({
                        items: [
                            new Text({
                                text: sJson,
                                renderWhitespace: true
                            }).addStyleClass("sapUiSmallMargin")
                        ]
                    })
                ],
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
