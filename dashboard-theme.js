/** Light/dark theme for dashboard & counter (no sync/detection logic) */
(function () {
    const STORAGE_KEY = 'packtracker_dashboard_theme';
    const DEFAULT = 'dark';

    const THEMES = [
        { id: 'light', label: 'Light' },
        { id: 'dark', label: 'Dark' }
    ];

    function normalize(themeId) {
        if (THEMES.some(t => t.id === themeId)) return themeId;
        if (themeId === 'midnight' || themeId === 'catppuccin-mocha') return 'dark';
        if (themeId === 'catppuccin-latte' || (typeof themeId === 'string' && themeId.startsWith('pastel-'))) {
            return 'light';
        }
        return DEFAULT;
    }

    function apply(themeId) {
        const id = normalize(themeId);
        document.documentElement.setAttribute('data-theme', id);
        document.documentElement.classList.add('theme-root');
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            const style = getComputedStyle(document.documentElement);
            const c = style.getPropertyValue('--theme-color-meta').trim();
            if (c) meta.setAttribute('content', c);
        }
        try {
            localStorage.setItem(STORAGE_KEY, id);
        } catch (e) { /* ignore */ }
        return id;
    }

    function initSelect() {
        const sel = document.getElementById('themeSelect');
        if (!sel) return;
        if (!sel.options.length) {
            THEMES.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.label;
                sel.appendChild(opt);
            });
        }
        const saved = normalize(localStorage.getItem(STORAGE_KEY) || DEFAULT);
        sel.value = apply(saved);
        sel.addEventListener('change', () => apply(sel.value));
    }

    const api = { apply, initSelect, STORAGE_KEY, DEFAULT };
    window.PackTrackerTheme = api;
    window.DashboardTheme = api;

    apply(normalize(localStorage.getItem(STORAGE_KEY) || DEFAULT));

    window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY && e.newValue) apply(e.newValue);
    });
})();
