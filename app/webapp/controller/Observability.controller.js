sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "../model/models"
], function (Controller, JSONModel, models) {
    "use strict";

    return Controller.extend("com.sap.tm.dashboard.controller.Observability", {
        _pollingTimer: null,

        onInit: function () {
            var oModel = new JSONModel({
                percentiles: {
                    p50: 0,
                    p95: 0,
                    p99: 0
                },
                callsByOperation: [],
                errorRates: [],
                latencyByOp: [],
                histogram: [],
                scatter: [],
                slowest: []
            });
            this.getView().setModel(oModel, "obs");
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

        /**
         * Compute the value at a given percentile from a sorted array.
         * Uses nearest-rank method.
         * @param {number[]} aSorted - sorted array of numbers (ascending)
         * @param {number} p - percentile (0-100)
         * @returns {number}
         */
        _percentile: function (aSorted, p) {
            if (!aSorted.length) {
                return 0;
            }
            var index = Math.ceil((p / 100) * aSorted.length) - 1;
            return aSorted[Math.max(0, index)];
        },

        _loadData: function () {
            var sMcpBase = this.getOwnerComponent().getModel("server").getProperty("/mcpBaseUrl");
            var oModel = this.getView().getModel("obs");
            var that = this;

            models.fetchJson(sMcpBase + "/audit/recent?limit=500").then(function (data) {
                var aEntries = Array.isArray(data) ? data : (data.entries || []);

                // --- Extract durations and compute percentiles ---
                var aDurations = [];
                aEntries.forEach(function (e) {
                    if (typeof e.duration_ms === "number") {
                        aDurations.push(e.duration_ms);
                    }
                });
                aDurations.sort(function (a, b) { return a - b; });

                oModel.setProperty("/percentiles", {
                    p50: Math.round(that._percentile(aDurations, 50)),
                    p95: Math.round(that._percentile(aDurations, 95)),
                    p99: Math.round(that._percentile(aDurations, 99))
                });

                // --- Group by operation ---
                var oOps = {};
                aEntries.forEach(function (e) {
                    var sOp = e.tool_name || e.operation || "unknown";
                    if (!oOps[sOp]) {
                        oOps[sOp] = { count: 0, errors: 0, durations: [] };
                    }
                    oOps[sOp].count++;
                    if (!e.success) {
                        oOps[sOp].errors++;
                    }
                    if (typeof e.duration_ms === "number") {
                        oOps[sOp].durations.push(e.duration_ms);
                    }
                });

                // Calls per operation
                var aCallsByOp = Object.keys(oOps).map(function (op) {
                    return { Operation: op, Count: oOps[op].count };
                }).sort(function (a, b) { return b.Count - a.Count; });
                oModel.setProperty("/callsByOperation", aCallsByOp);

                // Error rate by operation (percentage)
                var aErrorRates = Object.keys(oOps).map(function (op) {
                    var rate = oOps[op].count > 0
                        ? parseFloat(((oOps[op].errors / oOps[op].count) * 100).toFixed(1))
                        : 0;
                    return { Operation: op, ErrorRate: rate };
                }).sort(function (a, b) { return b.ErrorRate - a.ErrorRate; });
                oModel.setProperty("/errorRates", aErrorRates);

                // Latency by operation (avg and max)
                var aLatencyByOp = Object.keys(oOps).map(function (op) {
                    var durs = oOps[op].durations;
                    var avg = 0;
                    var max = 0;
                    if (durs.length > 0) {
                        var sum = durs.reduce(function (s, v) { return s + v; }, 0);
                        avg = Math.round(sum / durs.length);
                        max = Math.round(Math.max.apply(null, durs));
                    }
                    return { Operation: op, Avg: avg, Max: max };
                }).sort(function (a, b) { return b.Avg - a.Avg; });
                oModel.setProperty("/latencyByOp", aLatencyByOp);

                // --- Histogram: 5 duration buckets ---
                var oBuckets = {
                    "<100ms": 0,
                    "100-500ms": 0,
                    "500ms-1s": 0,
                    "1-5s": 0,
                    ">5s": 0
                };
                aDurations.forEach(function (d) {
                    if (d < 100) {
                        oBuckets["<100ms"]++;
                    } else if (d < 500) {
                        oBuckets["100-500ms"]++;
                    } else if (d < 1000) {
                        oBuckets["500ms-1s"]++;
                    } else if (d < 5000) {
                        oBuckets["1-5s"]++;
                    } else {
                        oBuckets[">5s"]++;
                    }
                });
                var aHistogram = Object.keys(oBuckets).map(function (b) {
                    return { Bucket: b, Count: oBuckets[b] };
                });
                oModel.setProperty("/histogram", aHistogram);

                // --- Scatter data: individual call durations over time ---
                var aScatter = aEntries
                    .filter(function (e) { return e.timestamp && typeof e.duration_ms === "number"; })
                    .map(function (e) {
                        return {
                            Time: new Date(e.timestamp),
                            Duration: Math.round(e.duration_ms)
                        };
                    });
                oModel.setProperty("/scatter", aScatter);

                // --- Top 10 slowest calls ---
                var aSlowest = aEntries
                    .filter(function (e) { return typeof e.duration_ms === "number"; })
                    .sort(function (a, b) { return b.duration_ms - a.duration_ms; })
                    .slice(0, 10)
                    .map(function (e) {
                        return {
                            Operation: e.tool_name || e.operation || "unknown",
                            Duration: Math.round(e.duration_ms),
                            Timestamp: e.timestamp ? new Date(e.timestamp).toLocaleString() : "",
                            Client: e.client_name || e.client_id || "",
                            Status: e.success ? "Success" : "Error"
                        };
                    });
                oModel.setProperty("/slowest", aSlowest);

            }).catch(function () { /* silent on network error */ });
        }
    });
});
