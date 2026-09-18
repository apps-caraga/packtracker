/** QC reject reason catalog (checker UI). */
(function (global) {
    const OPTIONS = [
        { id: 'damaged_pack', label: 'Damaged pack / seal' },
        { id: 'wrong_label', label: 'Wrong or missing label' },
        { id: 'underweight', label: 'Underweight / fill issue' },
        { id: 'foreign_material', label: 'Foreign material' },
        { id: 'date_code', label: 'Date / lot code issue' },
        { id: 'other', label: 'Other (add note)', needsRemarks: true }
    ];

    function findOption(id) {
        return OPTIONS.find(o => o.id === id) || null;
    }

    function mountReasonPicker(containerEl, { inputName = 'rejectReason' } = {}) {
        if (!containerEl) return null;
        containerEl.innerHTML = '';
        containerEl.classList.add('line-stop-picker-host');
        const groupName = `${inputName}_${Date.now().toString(36)}`;

        OPTIONS.forEach(o => {
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
            containerEl.appendChild(row);
        });

        return {
            getSelectedId() {
                const checked = containerEl.querySelector(`input[name="${groupName}"]:checked`);
                return checked ? checked.value : '';
            },
            reset() {
                containerEl.querySelectorAll('input[type="radio"]').forEach(r => { r.checked = false; });
            }
        };
    }

    global.PackTrackerRejectReasons = {
        OPTIONS,
        findOption,
        mountReasonPicker
    };
})(typeof window !== 'undefined' ? window : globalThis);
