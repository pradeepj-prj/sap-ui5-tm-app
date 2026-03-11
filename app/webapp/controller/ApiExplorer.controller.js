sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Element",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Column",
    "sap/m/ColumnListItem",
    "sap/m/Text",
    "sap/m/Label",
    "../model/models"
], function (Controller, Element, JSONModel, Filter, FilterOperator, MessageToast, MessageBox,
             Column, ColumnListItem, Text, Label, models) {
    "use strict";

    /**
     * All 18 TM API endpoints organized by group.
     * Each endpoint defines its HTTP method, path, parameters, and description.
     */
    var ENDPOINTS = [
        // ── Employees ─────────────────────────────────────────────
        {
            name: "search_employees",
            group: "Employees",
            method: "GET",
            path: "/employees/search",
            description: "Search employees by name (partial, case-insensitive match).",
            parameters: [
                { name: "name", type: "query", required: true, placeholder: "e.g. John, Smith", value: "" },
                { name: "limit", type: "number", required: false, placeholder: "Max results (default: 20)", value: "" }
            ]
        },
        {
            name: "get_employee_skills",
            group: "Employees",
            method: "GET",
            path: "/employees/{employee_id}/skills",
            description: "Get the complete skill profile for an employee, including proficiency levels.",
            parameters: [
                { name: "employee_id", type: "path", required: true, placeholder: "e.g. EMP000042", value: "" }
            ]
        },
        {
            name: "get_employee_top_skills",
            group: "Employees",
            method: "GET",
            path: "/employees/{employee_id}/top-skills",
            description: "Get the top skills for an employee ranked by proficiency.",
            parameters: [
                { name: "employee_id", type: "path", required: true, placeholder: "e.g. EMP000042", value: "" },
                { name: "limit", type: "number", required: false, placeholder: "Max results (default: 10)", value: "" }
            ]
        },
        {
            name: "get_employee_evidence",
            group: "Employees",
            method: "GET",
            path: "/employees/{employee_id}/evidence",
            description: "Get the full evidence inventory for an employee across all skills.",
            parameters: [
                { name: "employee_id", type: "path", required: true, placeholder: "e.g. EMP000042", value: "" }
            ]
        },
        {
            name: "get_skill_evidence",
            group: "Employees",
            method: "GET",
            path: "/employees/{employee_id}/skills/{skill_id}/evidence",
            description: "Get evidence records for a specific skill of an employee.",
            parameters: [
                { name: "employee_id", type: "path", required: true, placeholder: "e.g. EMP000042", value: "" },
                { name: "skill_id", type: "path", required: true, placeholder: "Skill ID (number)", value: "" }
            ]
        },

        // ── Skills ────────────────────────────────────────────────
        {
            name: "browse_skills",
            group: "Skills",
            method: "GET",
            path: "/skills",
            description: "Browse the skill catalog. Optionally filter by category or search keyword.",
            parameters: [
                { name: "category", type: "query", required: false, placeholder: "Filter by category (optional)", value: "" },
                { name: "search", type: "query", required: false, placeholder: "Search keyword (optional)", value: "" }
            ]
        },
        {
            name: "get_skill_experts",
            group: "Skills",
            method: "GET",
            path: "/skills/{skill_id}/experts",
            description: "Find top experts for a given skill across the organization.",
            parameters: [
                { name: "skill_id", type: "path", required: true, placeholder: "Skill ID (number)", value: "" },
                { name: "min_proficiency", type: "number", required: false, placeholder: "Min proficiency 1-5 (default: 4)", value: "" },
                { name: "limit", type: "number", required: false, placeholder: "Max results (default: 20)", value: "" }
            ]
        },
        {
            name: "get_skill_coverage",
            group: "Skills",
            method: "GET",
            path: "/skills/{skill_id}/coverage",
            description: "Get coverage statistics for a skill — how many employees have it and at what levels.",
            parameters: [
                { name: "skill_id", type: "path", required: true, placeholder: "Skill ID (number)", value: "" },
                { name: "min_proficiency", type: "number", required: false, placeholder: "Min proficiency 1-5 (default: 3)", value: "" }
            ]
        },
        {
            name: "get_skill_candidates",
            group: "Skills",
            method: "GET",
            path: "/skills/{skill_id}/candidates",
            description: "Get evidence-backed candidates for a skill with proficiency and evidence strength filters.",
            parameters: [
                { name: "skill_id", type: "path", required: true, placeholder: "Skill ID (number)", value: "" },
                { name: "min_proficiency", type: "number", required: false, placeholder: "Min proficiency 1-5 (default: 3)", value: "" },
                { name: "min_evidence_strength", type: "number", required: false, placeholder: "Min evidence strength (default: 4)", value: "" },
                { name: "limit", type: "number", required: false, placeholder: "Max results (default: 20)", value: "" }
            ]
        },
        {
            name: "get_stale_skills",
            group: "Skills",
            method: "GET",
            path: "/skills/{skill_id}/stale",
            description: "Find employees whose evidence for a skill is older than a threshold.",
            parameters: [
                { name: "skill_id", type: "path", required: true, placeholder: "Skill ID (number)", value: "" },
                { name: "older_than_days", type: "number", required: false, placeholder: "Days threshold (default: 365)", value: "" }
            ]
        },
        {
            name: "get_cooccurring_skills",
            group: "Skills",
            method: "GET",
            path: "/skills/{skill_id}/cooccurring",
            description: "Find skills that frequently co-occur with a given skill among employees.",
            parameters: [
                { name: "skill_id", type: "path", required: true, placeholder: "Skill ID (number)", value: "" },
                { name: "min_proficiency", type: "number", required: false, placeholder: "Min proficiency 1-5 (default: 3)", value: "" },
                { name: "top", type: "number", required: false, placeholder: "Top N results (default: 20)", value: "" }
            ]
        },

        // ── Talent Search ─────────────────────────────────────────
        {
            name: "talent_search",
            group: "Talent Search",
            method: "GET",
            path: "/talent/search",
            description: "Multi-skill AND search across the workforce. Find employees with all specified skills.",
            parameters: [
                { name: "skills", type: "query", required: true, placeholder: "Comma-separated skill IDs, e.g. 1,5,12", value: "" },
                { name: "min_proficiency", type: "number", required: false, placeholder: "Min proficiency 1-5 (default: 3)", value: "" }
            ]
        },

        // ── Organizations ─────────────────────────────────────────
        {
            name: "get_org_skill_summary",
            group: "Organizations",
            method: "GET",
            path: "/orgs/{org_unit_id}/skills/summary",
            description: "Get aggregated skill distribution and summary for an organization unit.",
            parameters: [
                { name: "org_unit_id", type: "path", required: true, placeholder: "e.g. OU_IT", value: "" },
                { name: "limit", type: "number", required: false, placeholder: "Max skills (default: 20)", value: "" }
            ]
        },
        {
            name: "get_org_skill_experts",
            group: "Organizations",
            method: "GET",
            path: "/orgs/{org_unit_id}/skills/{skill_id}/experts",
            description: "Find experts for a specific skill within an organization unit.",
            parameters: [
                { name: "org_unit_id", type: "path", required: true, placeholder: "e.g. OU_IT", value: "" },
                { name: "skill_id", type: "path", required: true, placeholder: "Skill ID (number)", value: "" },
                { name: "min_proficiency", type: "number", required: false, placeholder: "Min proficiency 1-5 (default: 3)", value: "" },
                { name: "limit", type: "number", required: false, placeholder: "Max results (default: 20)", value: "" }
            ]
        },

        // ── Attrition ─────────────────────────────────────────────
        {
            name: "get_all_attrition_risks",
            group: "Attrition",
            method: "GET",
            path: "/attrition/employees",
            description: "Get attrition risk scores for all employees with sorting and filtering.",
            parameters: [
                { name: "limit", type: "number", required: false, placeholder: "Max results (default: 50)", value: "" },
                { name: "offset", type: "number", required: false, placeholder: "Offset for pagination", value: "" },
                { name: "min_risk", type: "number", required: false, placeholder: "Min risk score filter", value: "" },
                { name: "sort", type: "query", required: false, placeholder: "e.g. risk_desc (default)", value: "" }
            ]
        },
        {
            name: "get_employee_attrition_risk",
            group: "Attrition",
            method: "GET",
            path: "/attrition/employees/{employee_id}",
            description: "Get detailed attrition risk prediction for a specific employee with explainable factors.",
            parameters: [
                { name: "employee_id", type: "path", required: true, placeholder: "e.g. EMP000042", value: "" }
            ]
        },
        {
            name: "get_high_risk_employees",
            group: "Attrition",
            method: "GET",
            path: "/attrition/high-risk",
            description: "Get employees with attrition risk above a threshold.",
            parameters: [
                { name: "threshold", type: "number", required: false, placeholder: "Risk threshold 0-1 (default: 0.25)", value: "" },
                { name: "limit", type: "number", required: false, placeholder: "Max results (default: 50)", value: "" },
                { name: "offset", type: "number", required: false, placeholder: "Offset for pagination", value: "" }
            ]
        },
        {
            name: "get_org_attrition_summary",
            group: "Attrition",
            method: "GET",
            path: "/attrition/orgs/{org_unit_id}/summary",
            description: "Get organization-level attrition risk summary with top at-risk employees.",
            parameters: [
                { name: "org_unit_id", type: "path", required: true, placeholder: "e.g. OU_IT", value: "" },
                { name: "top_risk_limit", type: "number", required: false, placeholder: "Top at-risk employees (default: 5)", value: "" }
            ]
        }
    ];

    /** Desired display order for endpoint groups. */
    var GROUP_ORDER = ["Employees", "Skills", "Talent Search", "Organizations", "Attrition"];

    return Controller.extend("com.sap.tm.dashboard.controller.ApiExplorer", {

        onInit: function () {
            // Deep-clone endpoints so each session starts fresh
            var aEndpoints = JSON.parse(JSON.stringify(ENDPOINTS));

            // Sort by group order, preserving intra-group order
            aEndpoints.sort(function (a, b) {
                return GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
            });

            var oModel = new JSONModel({
                endpoints: aEndpoints,
                selectedEndpoint: {
                    name: "",
                    method: "",
                    path: "",
                    description: "",
                    group: "",
                    parameters: []
                },
                results: null,
                resultsArray: [],
                resultType: "",        // "table" | "json"
                formattedJson: "",
                loading: false,
                errorMessage: "",
                queryDuration: ""
            });
            oModel.setSizeLimit(500);

            this.getView().setModel(oModel, "apiExplorer");
        },

        /* ---------------------------------------------------------------
         *  Endpoint selection
         * --------------------------------------------------------------- */

        onEndpointSelect: function (oEvent) {
            var oItem = oEvent.getParameter("listItem");
            var oCtx = oItem.getBindingContext("apiExplorer");
            var oEndpoint = JSON.parse(JSON.stringify(oCtx.getObject()));

            // Reset parameter values
            oEndpoint.parameters.forEach(function (p) {
                p.value = "";
            });

            var oModel = this.getView().getModel("apiExplorer");
            oModel.setProperty("/selectedEndpoint", oEndpoint);
            oModel.setProperty("/results", null);
            oModel.setProperty("/resultsArray", []);
            oModel.setProperty("/resultType", "");
            oModel.setProperty("/formattedJson", "");
            oModel.setProperty("/errorMessage", "");
            oModel.setProperty("/queryDuration", "");

            this._clearResultsTable();
        },

        /* ---------------------------------------------------------------
         *  Endpoint filter / search
         * --------------------------------------------------------------- */

        onEndpointFilter: function (oEvent) {
            var sQuery = oEvent.getParameter("newValue");
            var oList = this._getEndpointList();
            if (!oList) {
                return;
            }
            var oBinding = oList.getBinding("items");

            if (sQuery) {
                var aFilters = [
                    new Filter({
                        filters: [
                            new Filter("name", FilterOperator.Contains, sQuery),
                            new Filter("description", FilterOperator.Contains, sQuery),
                            new Filter("group", FilterOperator.Contains, sQuery)
                        ],
                        and: false
                    })
                ];
                oBinding.filter(aFilters);
            } else {
                oBinding.filter([]);
            }
        },

        /* ---------------------------------------------------------------
         *  Run Query
         * --------------------------------------------------------------- */

        onRunQuery: function () {
            var oModel = this.getView().getModel("apiExplorer");
            var oEndpoint = oModel.getProperty("/selectedEndpoint");

            if (!oEndpoint || !oEndpoint.name) {
                MessageToast.show("Please select an endpoint first.");
                return;
            }

            // Validate required parameters
            var aMissing = [];
            oEndpoint.parameters.forEach(function (p) {
                if (p.required && !p.value) {
                    aMissing.push(p.name);
                }
            });

            if (aMissing.length > 0) {
                MessageBox.warning("Please fill in required parameters: " + aMissing.join(", "));
                return;
            }

            // Build URL: substitute path params and collect query params
            var oServerModel = this.getOwnerComponent().getModel("server");
            var sBaseUrl = oServerModel.getProperty("/tmBaseUrl");
            var sApiKey = oServerModel.getProperty("/apiKey");
            var sPath = oEndpoint.path;
            var aQueryParams = [];

            oEndpoint.parameters.forEach(function (p) {
                if (!p.value) {
                    return;
                }
                var sPlaceholder = "{" + p.name + "}";
                if (sPath.indexOf(sPlaceholder) !== -1) {
                    // Path parameter
                    sPath = sPath.replace(sPlaceholder, encodeURIComponent(p.value));
                } else {
                    // Query parameter
                    aQueryParams.push(encodeURIComponent(p.name) + "=" + encodeURIComponent(p.value));
                }
            });

            var sUrl = sBaseUrl + sPath;
            if (aQueryParams.length > 0) {
                sUrl += "?" + aQueryParams.join("&");
            }

            // Reset state before request
            oModel.setProperty("/loading", true);
            oModel.setProperty("/errorMessage", "");
            oModel.setProperty("/results", null);
            oModel.setProperty("/resultsArray", []);
            oModel.setProperty("/resultType", "");
            oModel.setProperty("/formattedJson", "");
            oModel.setProperty("/queryDuration", "");
            this._clearResultsTable();

            var iStart = Date.now();
            var that = this;

            models.fetchJson(sUrl, sApiKey)
                .then(function (data) {
                    var iDuration = Date.now() - iStart;
                    oModel.setProperty("/queryDuration", "Completed in " + iDuration + "ms");
                    that._displayResults(data, oEndpoint);
                })
                .catch(function (oError) {
                    var iDuration = Date.now() - iStart;
                    oModel.setProperty("/queryDuration", "Failed after " + iDuration + "ms");
                    oModel.setProperty("/errorMessage", oError.message || "Request failed");
                })
                .finally(function () {
                    oModel.setProperty("/loading", false);
                });
        },

        /* ---------------------------------------------------------------
         *  Clear Results
         * --------------------------------------------------------------- */

        onClearResults: function () {
            var oModel = this.getView().getModel("apiExplorer");
            oModel.setProperty("/results", null);
            oModel.setProperty("/resultsArray", []);
            oModel.setProperty("/resultType", "");
            oModel.setProperty("/formattedJson", "");
            oModel.setProperty("/errorMessage", "");
            oModel.setProperty("/queryDuration", "");
            this._clearResultsTable();
        },

        /* ---------------------------------------------------------------
         *  Display Results
         * --------------------------------------------------------------- */

        _displayResults: function (data, oEndpoint) {
            var oModel = this.getView().getModel("apiExplorer");
            oModel.setProperty("/results", data);

            // Determine if data is an array or contains a nested array
            var aData = null;
            if (Array.isArray(data)) {
                aData = data;
            } else if (data && typeof data === "object") {
                // Check for common wrapper patterns, e.g. { employees: [...], count: 5 }
                var aKeys = Object.keys(data);
                var sArrayKey = aKeys.find(function (k) {
                    return Array.isArray(data[k]);
                });
                if (sArrayKey && aKeys.length <= 3) {
                    aData = data[sArrayKey];
                }
            }

            // For attrition endpoints the AttritionDashboard fragment handles
            // display via visibility bindings, so just set the data
            if (oEndpoint.group === "Attrition") {
                if (aData) {
                    oModel.setProperty("/resultsArray", aData);
                    oModel.setProperty("/resultType", "table");
                } else {
                    oModel.setProperty("/resultType", "json");
                }
                return;
            }

            if (aData && aData.length > 0) {
                // Array data: show in a dynamic table
                oModel.setProperty("/resultsArray", aData);
                oModel.setProperty("/resultType", "table");
                this._buildResultsTable(aData);
            } else {
                // Object data: show formatted JSON
                oModel.setProperty("/resultType", "json");
                var sFormatted = this._formatJsonAsHtml(data);
                oModel.setProperty("/formattedJson", sFormatted);
            }
        },

        /* ---------------------------------------------------------------
         *  Dynamic Table Builder
         *  Reads the keys from the first record and creates columns + a
         *  ColumnListItem template programmatically.
         * --------------------------------------------------------------- */

        _buildResultsTable: function (aData) {
            var oTable = this._getResultsTable();
            if (!oTable) {
                return;
            }

            // Remove existing columns and unbind
            oTable.removeAllColumns();
            oTable.unbindItems();

            var oFirst = aData[0];
            if (!oFirst || typeof oFirst !== "object") {
                return;
            }

            var aKeys = Object.keys(oFirst);
            // Limit to first 8 columns for readability
            var aVisibleKeys = aKeys.slice(0, 8);
            var aCells = [];

            aVisibleKeys.forEach(function (sKey) {
                oTable.addColumn(new Column({
                    header: new Label({ text: sKey }),
                    demandPopin: true,
                    minScreenWidth: aVisibleKeys.length > 5 ? "Tablet" : ""
                }));

                aCells.push(new Text({
                    text: {
                        path: "apiExplorer>" + sKey,
                        formatter: function (val) {
                            if (val === null || val === undefined) {
                                return "";
                            }
                            if (typeof val === "object") {
                                return JSON.stringify(val);
                            }
                            return String(val);
                        }
                    },
                    wrapping: false,
                    maxLines: 2
                }));
            });

            oTable.bindItems({
                path: "apiExplorer>/resultsArray",
                template: new ColumnListItem({ cells: aCells })
            });
        },

        _clearResultsTable: function () {
            var oTable = this._getResultsTable();
            if (oTable) {
                oTable.removeAllColumns();
                oTable.unbindItems();
            }
        },

        /* ---------------------------------------------------------------
         *  JSON Formatter
         * --------------------------------------------------------------- */

        _formatJsonAsHtml: function (data) {
            var sJson;
            try {
                sJson = JSON.stringify(data, null, 2);
            } catch (e) {
                sJson = String(data);
            }

            var sEscaped = sJson
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");

            return "<pre style='font-family:monospace;font-size:0.875rem;" +
                   "background:#f5f5f5;padding:1rem;border-radius:4px;" +
                   "overflow-x:auto;max-height:500px;overflow-y:auto;'>" +
                   sEscaped + "</pre>";
        },

        /* ---------------------------------------------------------------
         *  Helpers — locate controls inside fragments
         * --------------------------------------------------------------- */

        _getEndpointList: function () {
            return this._byIdFragment("endpointList");
        },

        _getResultsTable: function () {
            return this._byIdFragment("apiResultsTable");
        },

        /**
         * Find a control by local ID.  Fragments embedded in a View get the
         * view-ID prefix automatically, so try view.byId first and fall back
         * to the global Core registry.
         */
        _byIdFragment: function (sId) {
            var oView = this.getView();
            var oCtrl = oView.byId(sId);
            if (!oCtrl) {
                oCtrl = Element.getElementById(sId);
            }
            return oCtrl;
        }
    });
});
