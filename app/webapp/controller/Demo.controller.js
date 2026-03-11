sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "../model/models"
], function (Controller, JSONModel, MessageToast, models) {
    "use strict";

    var GAP_THRESHOLD_MS = 30000; // 30 seconds
    var POLL_INTERVAL_MS = 10000; // 10 seconds
    return Controller.extend("com.sap.tm.dashboard.controller.Demo", {
        _pollingTimer: null,
        _seenIds: {},
        _lastPollTime: null,

        onInit: function () {
            var oModel = new JSONModel({
                sessions: [],
                selectedSession: "",
                calls: [],
                stats: {
                    callCount: 0,
                    errors: 0,
                    totalDuration: 0,
                    timeSpan: 0
                },
                lastUpdatedText: "Not yet updated",
                isLive: true,
                timeRange: "1h",
                clearedAt: null
            });
            oModel.setSizeLimit(5000);
            this.getView().setModel(oModel, "demo");

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
                that._updateLastUpdatedText();
            }, POLL_INTERVAL_MS);
        },

        _stopPolling: function () {
            if (this._pollingTimer) {
                clearInterval(this._pollingTimer);
                this._pollingTimer = null;
            }
        },

        _loadData: function () {
            var sMcpBase = this.getOwnerComponent().getModel("server").getProperty("/mcpBaseUrl");
            var oModel = this.getView().getModel("demo");
            var that = this;

            models.fetchJson(sMcpBase + "/audit/recent?limit=200").then(function (data) {
                var aEntries = Array.isArray(data) ? data : (data.entries || []);
                that._lastPollTime = new Date();

                // Apply time range filter
                var sTimeRange = oModel.getProperty("/timeRange");
                aEntries = that._filterByTimeRange(aEntries, sTimeRange);

                // Group entries into time-based sessions
                var aGroups = models.groupIntoSessions(aEntries);

                // Build session picker items (already sorted most recent first)
                var aSessions = aGroups.map(function (oGroup) {
                    return {
                        id: oGroup.id,
                        label: oGroup.displayName + " (" + oGroup.entries.length + " calls)",
                        firstTimestamp: oGroup.entries.length > 0 ? oGroup.entries[0].timestamp : "",
                        entries: oGroup.entries
                    };
                });

                oModel.setProperty("/sessions", aSessions);

                // Auto-select most recent session if none selected or current is gone
                var sSelected = oModel.getProperty("/selectedSession");
                var bFound = aSessions.some(function (s) { return s.id === sSelected; });
                if (!sSelected || !bFound) {
                    if (aSessions.length > 0) {
                        oModel.setProperty("/selectedSession", aSessions[0].id);
                        that._displaySession(aSessions[0].entries);
                    }
                } else {
                    // Refresh current session
                    var oSession = aSessions.find(function (s) { return s.id === sSelected; });
                    if (oSession) {
                        var bHasNew = that._detectNewCalls(oSession.entries);
                        that._displaySession(oSession.entries);
                        if (bHasNew) {
                            that._scrollToBottom();
                        }
                    }
                }

                that._updateLastUpdatedText();
            }).catch(function (err) {
                MessageToast.show("Failed to load demo data: " + err.message);
            });
        },

        _filterByTimeRange: function (aEntries, sTimeRange) {
            var iHours;
            switch (sTimeRange) {
                case "1h": iHours = 1; break;
                case "6h": iHours = 6; break;
                case "24h": iHours = 24; break;
                default: iHours = 1;
            }
            var dCutoff = new Date(Date.now() - iHours * 3600000);
            return aEntries.filter(function (e) {
                if (!e.timestamp) { return true; }
                return new Date(e.timestamp) >= dCutoff;
            });
        },

        _detectNewCalls: function (aEntries) {
            var bHasNew = false;
            var oNewSeen = {};
            aEntries.forEach(function (entry) {
                var sId = entry.id || entry.timestamp;
                oNewSeen[sId] = true;
                if (!this._seenIds[sId]) {
                    bHasNew = true;
                }
            }.bind(this));
            this._seenIds = oNewSeen;
            return bHasNew;
        },

        _displaySession: function (aEntries) {
            var that = this;
            var oModel = this.getView().getModel("demo");

            // Filter out entries before clearedAt timestamp
            var sClearedAt = this.getView().getModel("demo").getProperty("/clearedAt");
            if (sClearedAt) {
                var dClearedAt = new Date(sClearedAt);
                aEntries = aEntries.filter(function (e) {
                    return e.timestamp && new Date(e.timestamp) > dClearedAt;
                });
            }

            // Sort by timestamp ascending
            var aSorted = aEntries.slice().sort(function (a, b) {
                return new Date(a.timestamp) - new Date(b.timestamp);
            });

            // Compute max duration for progress bar normalization
            var iMaxDuration = 1;
            aSorted.forEach(function (e) {
                if (e.duration_ms && e.duration_ms > iMaxDuration) {
                    iMaxDuration = e.duration_ms;
                }
            });

            // Build display list with gap markers
            var aCalls = [];
            for (var i = 0; i < aSorted.length; i++) {
                var entry = aSorted[i];

                // Insert gap marker if gap > threshold between consecutive calls
                if (i > 0) {
                    var dPrev = new Date(aSorted[i - 1].timestamp);
                    var dCurr = new Date(entry.timestamp);
                    var iGapMs = dCurr - dPrev;

                    if (iGapMs > GAP_THRESHOLD_MS) {
                        var sGapLabel = that._formatDuration(iGapMs) + " gap between tool calls";
                        aCalls.push({
                            isGap: true,
                            gapDuration: iGapMs,
                            gapLabel: sGapLabel
                        });
                    }
                }

                // Prepare display fields
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

                aCalls.push({
                    isGap: false,
                    id: entry.id,
                    timestamp: entry.timestamp,
                    timestampShort: entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : "",
                    operation: entry.tool_name || entry.operation || "unknown",
                    duration_ms: Math.round(entry.duration_ms || 0),
                    durationPercent: iMaxDuration > 0 ? Math.min(100, Math.round((entry.duration_ms || 0) / iMaxDuration * 100)) : 0,
                    success: entry.success,
                    error_message: entry.error_msg || entry.error_message || "",
                    parametersSummary: sParams.length > 100 ? sParams.substring(0, 100) + "..." : sParams,
                    parameters: entry.parameters
                });
            }

            oModel.setProperty("/calls", aCalls);

            // Compute stats
            var iErrors = 0;
            var iTotalDuration = 0;
            aSorted.forEach(function (e) {
                if (!e.success) { iErrors++; }
                iTotalDuration += (e.duration_ms || 0);
            });

            var iTimeSpan = 0;
            if (aSorted.length >= 2) {
                var dFirst = new Date(aSorted[0].timestamp);
                var dLast = new Date(aSorted[aSorted.length - 1].timestamp);
                iTimeSpan = Math.round((dLast - dFirst) / 60000); // in minutes
            }

            oModel.setProperty("/stats", {
                callCount: aSorted.length,
                errors: iErrors,
                totalDuration: iTotalDuration,
                timeSpan: iTimeSpan
            });
        },

        _formatDuration: function (iMs) {
            if (iMs < 1000) {
                return iMs + "ms";
            }
            var iSec = Math.round(iMs / 1000);
            if (iSec < 60) {
                return iSec + "s";
            }
            var iMin = Math.floor(iSec / 60);
            var iRemSec = iSec % 60;
            return iMin + "m " + iRemSec + "s";
        },

        _scrollToBottom: function () {
            var oList = this.byId("demoCallList");
            if (oList) {
                setTimeout(function () {
                    var aItems = oList.getItems();
                    if (aItems.length > 0) {
                        var oLastItem = aItems[aItems.length - 1];
                        oList.scrollToIndex(aItems.length - 1);
                        // Fallback: try DOM scrolling
                        try {
                            var oDom = oLastItem.getDomRef();
                            if (oDom) {
                                oDom.scrollIntoView({ behavior: "smooth", block: "end" });
                            }
                        } catch (e) { /* ignore */ }
                    }
                }, 200);
            }
        },

        _updateLastUpdatedText: function () {
            if (!this._lastPollTime) { return; }
            var oModel = this.getView().getModel("demo");
            var iDiffSec = Math.round((Date.now() - this._lastPollTime.getTime()) / 1000);
            var sText;
            if (iDiffSec < 5) {
                sText = "Updated just now";
            } else if (iDiffSec < 60) {
                sText = "Updated " + iDiffSec + "s ago";
            } else {
                sText = "Updated " + Math.round(iDiffSec / 60) + "m ago";
            }
            oModel.setProperty("/lastUpdatedText", sText);
        },

        onClearScreen: function () {
            var oModel = this.getView().getModel("demo");
            if (oModel.getProperty("/clearedAt")) {
                // Toggle off — restore full history
                oModel.setProperty("/clearedAt", null);
            } else {
                oModel.setProperty("/clearedAt", new Date().toISOString());
            }
            this._seenIds = {};

            // Re-display current session with the filter applied
            var sSelectedId = oModel.getProperty("/selectedSession");
            var aSessions = oModel.getProperty("/sessions") || [];
            var oSession = aSessions.find(function (s) { return s.id === sSelectedId; });
            if (oSession) {
                this._displaySession(oSession.entries);
            }
        },

        onSessionSelect: function (oEvent) {
            var oModel = this.getView().getModel("demo");
            var sSelectedId = oModel.getProperty("/selectedSession");
            var aSessions = oModel.getProperty("/sessions") || [];
            var oSession = aSessions.find(function (s) { return s.id === sSelectedId; });

            // Reset seen IDs and clear screen filter for new session
            this._seenIds = {};
            oModel.setProperty("/clearedAt", null);

            if (oSession) {
                this._displaySession(oSession.entries);
            }
        },

        onTimeRangeChange: function () {
            this.getView().getModel("demo").setProperty("/clearedAt", null);
            this._loadData();
        }
    });
});
