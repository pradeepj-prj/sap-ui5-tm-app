sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "../model/models"
], function (Controller, JSONModel, models) {
    "use strict";

    return Controller.extend("com.sap.tm.dashboard.controller.Sessions", {

        onInit: function () {
            var oModel = new JSONModel({
                sessions: [],
                selectedTimeRange: "24h",
                lastUpdated: "Never",
                summary: {
                    totalSessions: 0,
                    totalCalls: 0,
                    errors: 0,
                    avgDuration: 0,
                    timeSpan: 0,
                    timeSpanUnit: "min"
                }
            });
            oModel.setSizeLimit(5000);
            this.getView().setModel(oModel, "sessions");
            this._loadData();
        },

        /**
         * Fetch audit entries and process into session groups.
         */
        _loadData: function () {
            var that = this;
            var sMcpBase = this.getOwnerComponent().getModel("server").getProperty("/mcpBaseUrl");
            var oModel = this.getView().getModel("sessions");
            var sTimeRange = oModel.getProperty("/selectedTimeRange");

            var sUrl = sMcpBase + "/audit/recent?limit=500";

            // Append time range as hours parameter
            var iHours = this._timeRangeToHours(sTimeRange);
            if (iHours) {
                sUrl += "&hours=" + iHours;
            }

            models.fetchJson(sUrl).then(function (data) {
                var aEntries = Array.isArray(data) ? data : (data.entries || []);

                // Group entries into time-based sessions
                var aGroups = models.groupIntoSessions(aEntries);

                // Build session objects
                var aSessions = [];
                var iTotalCalls = 0;
                var iTotalErrors = 0;
                var iTotalDuration = 0;
                var dGlobalMin = null;
                var dGlobalMax = null;

                aGroups.forEach(function (oGroup) {
                    var aCalls = oGroup.entries;

                    // Sort calls by timestamp ascending
                    aCalls.sort(function (a, b) {
                        return new Date(a.timestamp) - new Date(b.timestamp);
                    });

                    var iSessionErrors = 0;
                    var iSessionDuration = 0;
                    var dFirst = aCalls[0].timestamp ? new Date(aCalls[0].timestamp) : null;
                    var dLast = aCalls[aCalls.length - 1].timestamp ? new Date(aCalls[aCalls.length - 1].timestamp) : null;

                    // Track global time bounds
                    if (dFirst && (!dGlobalMin || dFirst < dGlobalMin)) {
                        dGlobalMin = dFirst;
                    }
                    if (dLast && (!dGlobalMax || dLast > dGlobalMax)) {
                        dGlobalMax = dLast;
                    }

                    // Find max duration in session for ProgressIndicator scaling
                    var iMaxDuration = 0;
                    aCalls.forEach(function (c) {
                        var dur = c.duration_ms || 0;
                        if (dur > iMaxDuration) {
                            iMaxDuration = dur;
                        }
                    });

                    // Process calls: compute formatted fields and insert gap markers
                    var aProcessedCalls = [];
                    aCalls.forEach(function (call, idx) {
                        // Detect gap before this call (>30s between consecutive calls)
                        if (idx > 0 && call.timestamp && aCalls[idx - 1].timestamp) {
                            var dPrev = new Date(aCalls[idx - 1].timestamp);
                            var dCurr = new Date(call.timestamp);
                            var iGapMs = dCurr - dPrev;

                            if (iGapMs > 30000) {
                                aProcessedCalls.push({
                                    isGap: true,
                                    gapMs: iGapMs,
                                    gapFormatted: that._formatDuration(iGapMs)
                                });
                            }
                        }

                        var bSuccess = !!call.success;
                        if (!bSuccess) {
                            iSessionErrors++;
                        }

                        var iDur = call.duration_ms || 0;
                        iSessionDuration += iDur;

                        aProcessedCalls.push({
                            isGap: false,
                            timestamp: call.timestamp,
                            timestampFormatted: call.timestamp ? new Date(call.timestamp).toLocaleString() : "N/A",
                            operation: call.tool_name || call.operation || "unknown",
                            call_type: call.call_type || "",
                            duration_ms: Math.round(iDur),
                            durationPercent: iMaxDuration > 0 ? Math.round((iDur / iMaxDuration) * 100) : 0,
                            success: bSuccess
                        });
                    });

                    iTotalCalls += aCalls.length;
                    iTotalErrors += iSessionErrors;
                    iTotalDuration += iSessionDuration;

                    var iSessionSpanMs = (dFirst && dLast) ? (dLast - dFirst) : 0;

                    aSessions.push({
                        sessionId: oGroup.id,
                        displayName: oGroup.displayName,
                        callCount: aCalls.length,
                        errorCount: iSessionErrors,
                        totalDuration: iSessionDuration,
                        durationFormatted: that._formatDuration(iSessionDuration),
                        firstCallTime: dFirst ? dFirst.toLocaleString() : "N/A",
                        lastCallTime: dLast ? dLast.toLocaleString() : "N/A",
                        sessionSpanMs: iSessionSpanMs,
                        expanded: false,
                        calls: aProcessedCalls
                    });
                });

                // Compute overall summary
                var iAvgDuration = iTotalCalls > 0 ? Math.round(iTotalDuration / iTotalCalls) : 0;
                var iGlobalSpanMs = (dGlobalMin && dGlobalMax) ? (dGlobalMax - dGlobalMin) : 0;
                var oTimeSpan = that._computeTimeSpan(iGlobalSpanMs);

                oModel.setProperty("/sessions", aSessions);
                oModel.setProperty("/summary", {
                    totalSessions: aSessions.length,
                    totalCalls: iTotalCalls,
                    errors: iTotalErrors,
                    avgDuration: iAvgDuration,
                    timeSpan: oTimeSpan.value,
                    timeSpanUnit: oTimeSpan.unit
                });
                oModel.setProperty("/lastUpdated", new Date().toLocaleTimeString());

            }).catch(function (err) {
                oModel.setProperty("/lastUpdated", "Error: " + (err.message || "fetch failed"));
            });
        },

        /**
         * Convert time range selector key to hours.
         */
        _timeRangeToHours: function (sRange) {
            switch (sRange) {
                case "1h": return 1;
                case "6h": return 6;
                case "24h": return 24;
                case "7d": return 168;
                default: return 24;
            }
        },

        /**
         * Format a duration in ms to a human-readable string.
         */
        _formatDuration: function (iMs) {
            if (iMs < 1000) {
                return iMs + " ms";
            } else if (iMs < 60000) {
                return (iMs / 1000).toFixed(1) + " s";
            } else if (iMs < 3600000) {
                return (iMs / 60000).toFixed(1) + " min";
            } else {
                return (iMs / 3600000).toFixed(1) + " h";
            }
        },

        /**
         * Compute time span value and unit for the summary tile.
         */
        _computeTimeSpan: function (iMs) {
            if (iMs < 60000) {
                return { value: Math.round(iMs / 1000), unit: "sec" };
            } else if (iMs < 3600000) {
                return { value: Math.round(iMs / 60000), unit: "min" };
            } else if (iMs < 86400000) {
                return { value: parseFloat((iMs / 3600000).toFixed(1)), unit: "h" };
            } else {
                return { value: parseFloat((iMs / 86400000).toFixed(1)), unit: "d" };
            }
        },

        /**
         * Apply filter button handler - re-fetches data with current filters.
         */
        onApplyFilter: function () {
            this._loadData();
        },

        /**
         * Toggle session detail expansion when a session is selected.
         */
        onSessionPress: function (oEvent) {
            var oItem = oEvent.getParameter("listItem");
            var oContext = oItem.getBindingContext("sessions");
            if (oContext) {
                var sPath = oContext.getPath();
                var oModel = this.getView().getModel("sessions");
                var bExpanded = oModel.getProperty(sPath + "/expanded");
                // Collapse all sessions first
                var aSessions = oModel.getProperty("/sessions");
                aSessions.forEach(function (session, idx) {
                    oModel.setProperty("/sessions/" + idx + "/expanded", false);
                });
                // Toggle the selected one
                oModel.setProperty(sPath + "/expanded", !bExpanded);
            }
        }
    });
});
