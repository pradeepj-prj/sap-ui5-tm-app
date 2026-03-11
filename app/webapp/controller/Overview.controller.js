sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "../model/models"
], function (Controller, JSONModel, models) {
    "use strict";

    return Controller.extend("com.sap.tm.dashboard.controller.Overview", {
        _pollingTimer: null,

        onInit: function () {
            var oModel = new JSONModel({
                summary: {
                    total_calls: 0,
                    active_sessions: 0,
                    unique_operations: 0,
                    avg_duration_ms: 0,
                    error_rate: 0,
                    unique_clients: 0
                },
                operationMix: [],
                callVolume: [],
                recentActivity: []
            });
            this.getView().setModel(oModel, "overview");
            this._loadData();
            this._startPolling();
        },

        onExit: function () {
            this._stopPolling();
        },

        _startPolling: function () {
            var that = this;
            this._pollingTimer = setInterval(function () {
                that._loadData();
            }, 30000);
        },

        _stopPolling: function () {
            if (this._pollingTimer) {
                clearInterval(this._pollingTimer);
                this._pollingTimer = null;
            }
        },

        _loadData: function () {
            var that = this;
            var sMcpBase = this.getOwnerComponent().getModel("server").getProperty("/mcpBaseUrl");
            var oModel = this.getView().getModel("overview");

            // Load summary
            models.fetchJson(sMcpBase + "/audit/summary").then(function (data) {
                var s = data.overall || data;
                oModel.setProperty("/summary", {
                    total_calls: s.total_calls || 0,
                    active_sessions: s.active_sessions || s.unique_sessions || 0,
                    unique_operations: s.unique_tools || s.unique_operations || 0,
                    avg_duration_ms: Math.round(s.avg_duration_ms || 0),
                    error_rate: s.error_rate_pct != null ? parseFloat(s.error_rate_pct.toFixed(1)) : (s.error_rate ? parseFloat((s.error_rate * 100).toFixed(1)) : 0),
                    unique_clients: s.unique_clients || 0
                });
            }).catch(function () { /* silent on network error */ });

            // Load recent activity for charts and feed
            models.fetchJson(sMcpBase + "/audit/recent?limit=500").then(function (data) {
                var aEntries = Array.isArray(data) ? data : (data.entries || []);

                // Recent activity (last 20)
                oModel.setProperty("/recentActivity", aEntries.slice(0, 20).map(function (e) {
                    var copy = Object.assign({}, e);
                    if (typeof copy.duration_ms === "number") {
                        copy.duration_ms = Math.round(copy.duration_ms);
                    }
                    return copy;
                }));

                // Operation mix
                var oOps = {};
                aEntries.forEach(function (e) {
                    var op = e.tool_name || e.operation || "unknown";
                    oOps[op] = (oOps[op] || 0) + 1;
                });
                var aMix = Object.keys(oOps).map(function (k) {
                    return { operation: k, count: oOps[k] };
                }).sort(function (a, b) { return b.count - a.count; });
                oModel.setProperty("/operationMix", aMix);

                // Call volume over time (group by hour)
                var oHours = {};
                aEntries.forEach(function (e) {
                    if (!e.timestamp) { return; }
                    var d = new Date(e.timestamp);
                    var sHour = d.toISOString().substring(0, 13) + ":00:00";
                    oHours[sHour] = (oHours[sHour] || 0) + 1;
                });
                var aVolume = Object.keys(oHours).sort().map(function (k) {
                    return { time: new Date(k), count: oHours[k] };
                });
                oModel.setProperty("/callVolume", aVolume);

                // Compute active sessions using time-based grouping
                oModel.setProperty("/summary/active_sessions", models.groupIntoSessions(aEntries).length);

                that.getOwnerComponent().getModel("app").setProperty("/lastUpdated", new Date().toLocaleTimeString());
            }).catch(function () { /* silent */ });
        }
    });
});
