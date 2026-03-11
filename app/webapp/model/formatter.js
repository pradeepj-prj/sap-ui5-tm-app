sap.ui.define([], function () {
    "use strict";

    return {
        /**
         * Format duration in ms to a human-readable string.
         */
        formatDuration: function (iMs) {
            if (iMs === null || iMs === undefined) {
                return "—";
            }
            if (iMs < 1000) {
                return Math.round(iMs) + "ms";
            }
            return (iMs / 1000).toFixed(1) + "s";
        },

        /**
         * Return semantic state based on duration thresholds.
         */
        durationState: function (iMs) {
            if (iMs === null || iMs === undefined) {
                return "None";
            }
            if (iMs < 500) {
                return "Success";
            }
            if (iMs < 2000) {
                return "Warning";
            }
            return "Error";
        },

        /**
         * Format a status boolean to icon.
         */
        statusIcon: function (bSuccess) {
            return bSuccess !== false ? "sap-icon://accept" : "sap-icon://error";
        },

        /**
         * Format a status boolean to semantic state.
         */
        statusState: function (bSuccess) {
            return bSuccess !== false ? "Success" : "Error";
        },

        /**
         * Format ISO timestamp to locale string.
         */
        formatTimestamp: function (sTimestamp) {
            if (!sTimestamp) {
                return "—";
            }
            var d = new Date(sTimestamp);
            return d.toLocaleString();
        },

        /**
         * Format ISO timestamp to time only (HH:MM:SS).
         */
        formatTime: function (sTimestamp) {
            if (!sTimestamp) {
                return "—";
            }
            var d = new Date(sTimestamp);
            return d.toLocaleTimeString();
        },

        /**
         * Format a number with commas.
         */
        formatNumber: function (n) {
            if (n === null || n === undefined) {
                return "0";
            }
            return Number(n).toLocaleString();
        },

        /**
         * Calculate percentile from a sorted array of numbers.
         */
        percentile: function (aValues, p) {
            if (!aValues || aValues.length === 0) {
                return 0;
            }
            var sorted = aValues.slice().sort(function (a, b) { return a - b; });
            var idx = Math.ceil((p / 100) * sorted.length) - 1;
            return sorted[Math.max(0, idx)];
        },

        /**
         * Format risk level to semantic state.
         */
        riskState: function (sLevel) {
            switch ((sLevel || "").toLowerCase()) {
                case "high":
                case "critical":
                    return "Error";
                case "medium":
                    return "Warning";
                case "low":
                    return "Success";
                default:
                    return "None";
            }
        },

        /**
         * Format proficiency score to percentage.
         */
        proficiencyPercent: function (fScore) {
            if (!fScore) {
                return 0;
            }
            return Math.round(fScore * 100);
        },

        /**
         * Truncate text to a max length with ellipsis.
         */
        truncate: function (sText, iMax) {
            if (!sText) {
                return "";
            }
            iMax = iMax || 80;
            return sText.length > iMax ? sText.substring(0, iMax) + "…" : sText;
        },

        /**
         * Format gap duration between calls.
         */
        formatGap: function (iMs) {
            if (iMs < 60000) {
                return Math.round(iMs / 1000) + "s";
            }
            return Math.round(iMs / 60000) + " min";
        }
    };
});
