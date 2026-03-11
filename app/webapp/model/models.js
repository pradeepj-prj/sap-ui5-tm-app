sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/Device"
], function (JSONModel, Device) {
    "use strict";

    return {
        createDeviceModel: function () {
            var oModel = new JSONModel(Device);
            oModel.setDefaultBindingMode("OneWay");
            return oModel;
        },

        /**
         * Group audit entries into time-based sessions using an inactivity gap threshold.
         * @param {Array} aEntries - audit log entries with timestamp fields
         * @param {number} [iGapMs=7200000] - inactivity gap in ms (default 2 hours)
         * @returns {Array} sorted sessions (most recent first), each {id, displayName, entries}
         */
        groupIntoSessions: function (aEntries, iGapMs) {
            if (!iGapMs) {
                iGapMs = 7200000; // 2 hours
            }

            // Separate entries with and without timestamps
            var aWithTime = [];
            var aNoTime = [];
            aEntries.forEach(function (e) {
                if (e.timestamp) {
                    aWithTime.push(e);
                } else {
                    aNoTime.push(e);
                }
            });

            // Sort by timestamp ascending
            aWithTime.sort(function (a, b) {
                return new Date(a.timestamp) - new Date(b.timestamp);
            });

            var aSessions = [];
            var aCurrentGroup = [];

            aWithTime.forEach(function (entry, idx) {
                if (idx > 0) {
                    var dPrev = new Date(aWithTime[idx - 1].timestamp);
                    var dCurr = new Date(entry.timestamp);
                    if (dCurr - dPrev > iGapMs) {
                        // Gap exceeded — finalize current session
                        aSessions.push(aCurrentGroup);
                        aCurrentGroup = [];
                    }
                }
                aCurrentGroup.push(entry);
            });

            // Push last group
            if (aCurrentGroup.length > 0) {
                aSessions.push(aCurrentGroup);
            }

            // Append no-timestamp entries to the last session (or create one)
            if (aNoTime.length > 0) {
                if (aSessions.length > 0) {
                    aSessions[aSessions.length - 1] = aSessions[aSessions.length - 1].concat(aNoTime);
                } else {
                    aSessions.push(aNoTime);
                }
            }

            // Build session objects
            var aResult = aSessions.map(function (aGroup) {
                var dStart = aGroup[0].timestamp ? new Date(aGroup[0].timestamp) : new Date();
                var sId = "__auto_" + dStart.toISOString();
                var sDisplayName = dStart.toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit"
                });
                return {
                    id: sId,
                    displayName: sDisplayName,
                    entries: aGroup
                };
            });

            // Sort by first entry timestamp descending (most recent first)
            aResult.sort(function (a, b) {
                var dA = a.entries[0].timestamp ? new Date(a.entries[0].timestamp) : new Date(0);
                var dB = b.entries[0].timestamp ? new Date(b.entries[0].timestamp) : new Date(0);
                return dB - dA;
            });

            return aResult;
        },

        fetchJson: function (sUrl, sApiKey, oOptions) {
            var oHeaders = {};
            if (sApiKey) {
                oHeaders["X-API-Key"] = sApiKey;
            }
            if (oOptions && oOptions.headers) {
                Object.assign(oHeaders, oOptions.headers);
            }
            return fetch(sUrl, {
                method: (oOptions && oOptions.method) || "GET",
                headers: oHeaders,
                body: (oOptions && oOptions.body) || undefined
            }).then(function (response) {
                if (!response.ok) {
                    throw new Error("HTTP " + response.status + ": " + response.statusText);
                }
                return response.json();
            });
        }
    };
});
