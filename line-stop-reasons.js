/** Shared line stop / downtime reason catalog (dashboard + counter). */
(function (global) {
    const GROUPS = [
        {
            label: 'Counts as downtime',
            category: 'downtime',
            options: [
                { id: 'material_shortage', label: 'Material shortage' },
                { id: 'quality_hold', label: 'Quality hold' },
                { id: 'equipment_failure', label: 'Equipment failure' },
                { id: 'power_interruption', label: 'Power interruption' },
                { id: 'staging_space', label: 'Awaiting staging/warehouse space' },
                { id: 'insufficient_manpower', label: 'Insufficient manpower' },
                { id: 'safety_incident', label: 'Safety incident/inspection' }
            ]
        },
        {
            label: 'Planned pause',
            category: 'planned',
            options: [
                { id: 'shift_change', label: 'Shift change' },
                { id: 'meal_break', label: 'Meal break' },
                { id: 'pack_config_change', label: 'Changing food pack configuration' }
            ]
        },
        {
            label: 'Other',
            category: 'other',
            options: [
                { id: 'other', label: 'Other reason (with remarks)', needsRemarks: true }
            ]
        }
    ];

    function allOptions() {
        const out = [];
        GROUPS.forEach(g => {
            g.options.forEach(o => {
                out.push({ ...o, category: g.category, groupLabel: g.label });
            });
        });
        return out;
    }

    function findOption(id) {
        return allOptions().find(o => o.id === id) || null;
    }

    function groupForCategory(category) {
        return GROUPS.find(g => g.category === category) || null;
    }

    function populateCategorySelect(selectEl, { placeholder = 'Select category…' } = {}) {
        if (!selectEl) return;
        selectEl.innerHTML = '';
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = placeholder;
        selectEl.appendChild(ph);
        GROUPS.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.category;
            opt.textContent = g.label;
            selectEl.appendChild(opt);
        });
    }

    function populateCauseSelect(selectEl, category, { placeholder = 'Select cause…' } = {}) {
        if (!selectEl) return;
        selectEl.innerHTML = '';
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = placeholder;
        selectEl.appendChild(ph);
        const group = groupForCategory(category);
        if (!group) {
            selectEl.disabled = true;
            return;
        }
        selectEl.disabled = false;
        group.options.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.id;
            opt.textContent = o.label;
            opt.dataset.needsRemarks = o.needsRemarks ? '1' : '0';
            selectEl.appendChild(opt);
        });
    }

    /** @deprecated use category + cause selects */
    function categoryBadgeText(category) {
        if (category === 'downtime') return 'Downtime';
        if (category === 'planned') return 'Planned';
        return '';
    }

    function mountReasonPicker(containerEl, { inputName = 'lineStopReason' } = {}) {
        if (!containerEl) return null;
        containerEl.innerHTML = '';
        containerEl.classList.add('line-stop-picker-host');
        const groupName = `${inputName}_${Date.now().toString(36)}`;

        GROUPS.forEach((g, gi) => {
            if (gi > 0) {
                const divider = document.createElement('div');
                divider.className = 'line-stop-picker-divider';
                divider.setAttribute('aria-hidden', 'true');
                containerEl.appendChild(divider);
            }
            const section = document.createElement('div');
            section.className = 'line-stop-picker-section';

            const heading = document.createElement('p');
            heading.className = 'line-stop-picker-heading';
            heading.textContent = g.label.toUpperCase();
            section.appendChild(heading);

            g.options.forEach(o => {
                const row = document.createElement('label');
                row.className = 'line-stop-picker-row';

                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = groupName;
                radio.value = o.id;
                radio.className = 'line-stop-picker-radio';

                const text = document.createElement('span');
                text.className = 'line-stop-picker-label';
                text.textContent = o.label;

                row.appendChild(radio);
                row.appendChild(text);

                const badgeText = categoryBadgeText(g.category);
                if (badgeText) {
                    const badge = document.createElement('span');
                    badge.className = `line-stop-cat-badge is-${g.category}`;
                    badge.textContent = badgeText;
                    row.appendChild(badge);
                }

                section.appendChild(row);
            });

            containerEl.appendChild(section);
        });

        const api = {
            getSelectedId() {
                const checked = containerEl.querySelector(`input[name="${groupName}"]:checked`);
                return checked ? checked.value : '';
            },
            reset() {
                containerEl.querySelectorAll('input[type="radio"]').forEach(r => { r.checked = false; });
            },
            onChange(fn) {
                containerEl.addEventListener('change', (e) => {
                    if (e.target && e.target.matches('input[type="radio"]')) fn(e.target.value);
                });
            }
        };
        return api;
    }

    function populateReasonSelect(selectEl, { placeholder = 'Select a reason…', includePlaceholder = true } = {}) {
        if (!selectEl) return;
        selectEl.innerHTML = '';
        const isListbox = parseInt(selectEl.getAttribute('size') || '1', 10) > 1;
        if (includePlaceholder && !isListbox) {
            const ph = document.createElement('option');
            ph.value = '';
            ph.textContent = placeholder;
            selectEl.appendChild(ph);
        }
        GROUPS.forEach(g => {
            const og = document.createElement('optgroup');
            og.label = g.label;
            g.options.forEach(o => {
                const opt = document.createElement('option');
                opt.value = o.id;
                opt.textContent = o.label;
                opt.dataset.category = g.category;
                opt.dataset.needsRemarks = o.needsRemarks ? '1' : '0';
                og.appendChild(opt);
            });
            selectEl.appendChild(og);
        });
    }

    function displayReasonLabel(reasonLabel, remarks) {
        const base = (reasonLabel || 'Stopped').trim();
        const r = (remarks || '').trim();
        if (!r) return base;
        const short = r.length > 40 ? `${r.slice(0, 38)}…` : r;
        return `${base} — ${short}`;
    }

    function pillTitle({ reasonLabel, category, remarks, stoppedAt, stoppedBy }) {
        const parts = [];
        if (category === 'downtime') parts.push('Counts as downtime');
        else if (category === 'planned') parts.push('Planned pause');
        if (reasonLabel) parts.push(reasonLabel);
        if (remarks) parts.push(`Remarks: ${remarks}`);
        if (stoppedAt) parts.push(`Since: ${stoppedAt}`);
        if (stoppedBy) parts.push(`By: ${stoppedBy}`);
        return parts.join(' · ');
    }

    global.PackTrackerLineStop = {
        GROUPS,
        allOptions,
        findOption,
        groupForCategory,
        populateCategorySelect,
        populateCauseSelect,
        populateReasonSelect,
        mountReasonPicker,
        categoryBadgeText,
        displayReasonLabel,
        pillTitle
    };
})(typeof window !== 'undefined' ? window : globalThis);
