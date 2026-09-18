/** Shared Upstash + Google Sheet connection config (setup.html + dashboard + counter). */
(function (global) {
    const STORAGE_KEY = 'packtracker_connection';
    const LEGACY_DASHBOARD_KEY = 'packtracker_dashboard';
    const CONFIG_KIND = 'packtracker_connection_config';
    const CONFIG_VERSION = 3;
    const BOARD_STORAGE_KEY = LEGACY_DASHBOARD_KEY;
    const COUNTER_UPSTASH_KEY = 'packtracker_upstash';

    function normalizeRestUrl(raw) {
        let url = (raw || '').trim();
        url = url.replace(/\/pipeline\/?$/i, '').replace(/\/$/, '');
        return url;
    }

    function normalizeRestToken(raw) {
        return (raw || '').trim();
    }

    function normalizeSheetWebAppUrl(raw) {
        let url = (raw || '').trim();
        if (!url) return '';
        if (url.includes('script.google.com') && url.includes('/dev')) {
            url = url.replace(/\/dev(\?.*)?$/, '/exec');
        }
        return url;
    }

    function defaultConnection() {
        return {
            restUrl: '',
            restToken: '',
            keyPrefixBase: 'packtracker',
            publishUpstashForCounters: true,
            sheet: {
                enabled: false,
                webAppUrl: '',
                sharedSecret: ''
            }
        };
    }

    function sanitizeConnection(raw) {
        const d = defaultConnection();
        if (!raw || typeof raw !== 'object') return d;
        return {
            restUrl: normalizeRestUrl(raw.restUrl),
            restToken: normalizeRestToken(raw.restToken),
            keyPrefixBase: (raw.keyPrefixBase || 'packtracker').replace(/:/g, '').trim() || 'packtracker',
            publishUpstashForCounters: raw.publishUpstashForCounters !== false,
            sheet: {
                enabled: !!raw.sheet?.enabled,
                webAppUrl: normalizeSheetWebAppUrl(raw.sheet?.webAppUrl),
                sharedSecret: (raw.sheet?.sharedSecret || '').trim()
            }
        };
    }

    function migrateFromLegacyDashboard() {
        try {
            const existing = localStorage.getItem(STORAGE_KEY);
            if (existing) return;
            const raw = localStorage.getItem(LEGACY_DASHBOARD_KEY);
            if (!raw) return;
            const c = JSON.parse(raw);
            if (!c.restUrl && !c.restToken && !c.sheet?.webAppUrl) return;
            saveConnection(sanitizeConnection({
                restUrl: c.restUrl,
                restToken: c.restToken,
                keyPrefixBase: c.keyPrefixBase,
                publishUpstashForCounters: c.publishUpstashForCounters,
                sheet: c.sheet
            }));
        } catch (e) {
            console.warn('PackTracker connection migrate failed', e);
        }
    }

    function loadConnection() {
        migrateFromLegacyDashboard();
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return defaultConnection();
            return sanitizeConnection(JSON.parse(raw));
        } catch (e) {
            console.warn('PackTracker connection load failed', e);
            return defaultConnection();
        }
    }

    function saveConnection(conn) {
        const clean = sanitizeConnection(conn);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
        return clean;
    }

    function isUpstashConfigured(conn) {
        const c = conn || loadConnection();
        return !!(c.restUrl && c.restToken);
    }

    function lineKeyPrefix(base, lineIndexOneBased) {
        const b = (base || 'packtracker').replace(/:/g, '').trim() || 'packtracker';
        return `${b}_line_${lineIndexOneBased}`;
    }

    function dashboardMetaKey(base, suffix) {
        const b = (base || 'packtracker').replace(/:/g, '').trim() || 'packtracker';
        return `${b}_dashboard:${suffix}`;
    }

    function defaultBoardSettings() {
        return { totalTarget: 0, lineCount: 2, pollSeconds: 3 };
    }

    function sanitizeBoardSettings(raw) {
        const d = defaultBoardSettings();
        if (!raw || typeof raw !== 'object') return d;
        const src = raw.dashboard && typeof raw.dashboard === 'object' ? raw.dashboard : raw;
        return {
            totalTarget: Math.max(0, Math.floor(Number(src.totalTarget) || 0)),
            lineCount: Math.max(2, Math.min(10, Math.floor(Number(src.lineCount) || 2))),
            pollSeconds: Math.max(1, Math.min(60, Math.floor(Number(src.pollSeconds) || 3)))
        };
    }

    function loadBoardSettingsRaw() {
        try {
            const raw = localStorage.getItem(BOARD_STORAGE_KEY);
            if (!raw) return defaultBoardSettings();
            const c = JSON.parse(raw);
            return {
                totalTarget: Math.max(0, Math.floor(Number(c.totalTarget) || 0)),
                lineCount: Math.max(2, Math.min(10, Math.floor(Number(c.lineCount) || 2))),
                pollSeconds: Math.max(1, Math.min(60, Math.floor(Number(c.pollSeconds) || 3)))
            };
        } catch (e) {
            return defaultBoardSettings();
        }
    }

    function loadBoardSettings() {
        return loadBoardSettingsRaw();
    }

    function saveBoardSettings(board) {
        const clean = sanitizeBoardSettings(board);
        localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(clean));
        return clean;
    }

    function buildExportPayload(conn) {
        const c = sanitizeConnection(conn || loadConnection());
        return {
            kind: CONFIG_KIND,
            version: CONFIG_VERSION,
            exportedAt: new Date().toISOString(),
            restUrl: c.restUrl,
            restToken: c.restToken,
            keyPrefixBase: c.keyPrefixBase,
            publishUpstashForCounters: c.publishUpstashForCounters,
            sheet: { ...c.sheet }
        };
    }

    function readImportPayload(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid config file.');
        }
        if (data.kind && data.kind !== CONFIG_KIND) {
            throw new Error('This file is not a PackTracker connection export.');
        }
        const connection = sanitizeConnection({
            restUrl: data.restUrl,
            restToken: data.restToken,
            keyPrefixBase: data.keyPrefixBase,
            publishUpstashForCounters: data.publishUpstashForCounters,
            sheet: data.sheet
        });
        return { connection };
    }

    function applyImportedPayload(payload) {
        saveConnection(payload.connection);
        return payload;
    }

    function downloadConfigFile(conn, filename) {
        const payload = buildExportPayload(conn);
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename || `packtracker-connection-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    async function readConfigFile(file) {
        const text = await file.text();
        return readImportPayload(JSON.parse(text));
    }

    async function importConfigFile(file) {
        const payload = await readConfigFile(file);
        return applyImportedPayload(payload);
    }

    function importFromCounterStorage() {
        const raw = localStorage.getItem(COUNTER_UPSTASH_KEY);
        if (!raw) return null;
        const c = JSON.parse(raw);
        const base = (c.keyPrefix || 'packtracker').replace(/:/g, '').replace(/_line_?\d+$/i, '');
        return sanitizeConnection({
            restUrl: c.restUrl,
            restToken: c.restToken,
            keyPrefixBase: base,
            publishUpstashForCounters: true,
            sheet: loadConnection().sheet
        });
    }

    global.PackTrackerConnection = {
        STORAGE_KEY,
        CONFIG_KIND,
        load: loadConnection,
        save: saveConnection,
        isConfigured: isUpstashConfigured,
        normalizeRestUrl,
        normalizeRestToken,
        normalizeSheetWebAppUrl,
        BOARD_STORAGE_KEY,
        buildExportPayload,
        readImportPayload,
        applyImportedPayload,
        downloadConfigFile,
        readConfigFile,
        importConfigFile,
        loadBoardSettings,
        saveBoardSettings,
        importFromCounterStorage,
        migrateFromLegacyDashboard,
        lineKeyPrefix,
        dashboardMetaKey
    };
})(typeof window !== 'undefined' ? window : globalThis);
