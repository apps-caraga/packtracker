/**
 * Shared WebAuthn passkey gate (dashboard, counter, checker, index).
 * Config: localStorage packtracker_passkey · session: sessionStorage packtracker_passkey_session
 */
(function (global) {
    const PASSKEY_STORAGE_KEY = 'packtracker_passkey';
    const PASSKEY_SESSION_KEY = 'packtracker_passkey_session';
    const PASSKEY_DECLINE_KEY = 'packtracker_passkey_declined';

    const PasskeyAuth = {
        bufferToBase64url(buffer) {
            const bytes = new Uint8Array(buffer);
            let binary = '';
            bytes.forEach(b => { binary += String.fromCharCode(b); });
            return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        },

        base64urlToBuffer(base64url) {
            const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
            const pad = base64.length % 4 ? '='.repeat(4 - (base64.length % 4)) : '';
            const binary = atob(base64 + pad);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return bytes;
        },

        randomBytes(length = 32) {
            const buf = new Uint8Array(length);
            crypto.getRandomValues(buf);
            return buf;
        },

        isSupported() {
            return window.isSecureContext && typeof global.PublicKeyCredential !== 'undefined';
        },

        getRpId() {
            return global.location.hostname || 'localhost';
        },

        loadConfig() {
            try {
                const raw = localStorage.getItem(PASSKEY_STORAGE_KEY);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                if (!parsed?.credentialId || !parsed?.userId) return null;
                return parsed;
            } catch (e) {
                return null;
            }
        },

        saveConfig(config) {
            localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(config));
        },

        clearConfig() {
            localStorage.removeItem(PASSKEY_STORAGE_KEY);
        },

        markSessionUnlocked() {
            sessionStorage.setItem(PASSKEY_SESSION_KEY, String(Date.now()));
        },

        isSessionUnlocked() {
            return sessionStorage.getItem(PASSKEY_SESSION_KEY) != null;
        },

        clearSession() {
            sessionStorage.removeItem(PASSKEY_SESSION_KEY);
        },

        validateConfigObject(obj) {
            if (!obj || typeof obj !== 'object') return null;
            if (typeof obj.credentialId !== 'string' || typeof obj.userId !== 'string') return null;
            return {
                credentialId: obj.credentialId,
                userId: obj.userId,
                createdAt: obj.createdAt || new Date().toISOString()
            };
        },

        async registerPasskey() {
            if (!this.isSupported()) {
                throw new Error('Passkeys require HTTPS or localhost in a supported browser.');
            }
            const userId = this.randomBytes(32);
            const challenge = this.randomBytes(32);
            const rpId = this.getRpId();
            const credential = await navigator.credentials.create({
                publicKey: {
                    challenge,
                    rp: { name: 'PackTracker', id: rpId },
                    user: {
                        id: userId,
                        name: 'packtracker-operator',
                        displayName: 'PackTracker Operator'
                    },
                    pubKeyCredParams: [
                        { alg: -7, type: 'public-key' },
                        { alg: -257, type: 'public-key' }
                    ],
                    authenticatorSelection: {
                        residentKey: 'preferred',
                        userVerification: 'required'
                    },
                    timeout: 120000,
                    attestation: 'none'
                }
            });
            if (!credential?.rawId) {
                throw new Error('Passkey creation was cancelled or failed.');
            }
            const config = {
                credentialId: this.bufferToBase64url(credential.rawId),
                userId: this.bufferToBase64url(userId),
                createdAt: new Date().toISOString()
            };
            this.saveConfig(config);
            this.markSessionUnlocked();
            return config;
        },

        async authenticatePasskey() {
            if (!this.isSupported()) {
                throw new Error('Passkeys require HTTPS or localhost in a supported browser.');
            }
            const stored = this.loadConfig();
            if (!stored) throw new Error('No passkey is configured on this device.');
            const challenge = this.randomBytes(32);
            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge,
                    rpId: this.getRpId(),
                    allowCredentials: [{
                        id: this.base64urlToBuffer(stored.credentialId),
                        type: 'public-key',
                        transports: ['internal', 'hybrid', 'usb', 'nfc', 'ble']
                    }],
                    userVerification: 'required',
                    timeout: 120000
                }
            });
            if (!assertion) throw new Error('Sign-in was cancelled or failed.');
            this.markSessionUnlocked();
            return true;
        },

        async exportConfigToFile() {
            const config = this.loadConfig();
            if (!config) throw new Error('No passkey config to export.');
            const payload = JSON.stringify(config, null, 2);
            const suggestedName = `packtracker-passkey-${new Date().toISOString().slice(0, 10)}.json`;
            if (global.showSaveFilePicker) {
                try {
                    const handle = await global.showSaveFilePicker({
                        suggestedName,
                        types: [{ description: 'PackTracker passkey config', accept: { 'application/json': ['.json'] } }]
                    });
                    const writable = await handle.createWritable();
                    await writable.write(payload);
                    await writable.close();
                    return;
                } catch (e) {
                    if (e.name === 'AbortError') return;
                    throw e;
                }
            }
            const blob = new Blob([payload], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = suggestedName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        },

        async importConfigFromFile(file) {
            const text = await file.text();
            const config = this.validateConfigObject(JSON.parse(text));
            if (!config) throw new Error('Invalid passkey config file.');
            this.saveConfig(config);
            return config;
        },

        async pickConfigFile() {
            if (global.showOpenFilePicker) {
                try {
                    const [handle] = await global.showOpenFilePicker({
                        multiple: false,
                        types: [{ description: 'PackTracker passkey config', accept: { 'application/json': ['.json'] } }]
                    });
                    return handle.getFile();
                } catch (e) {
                    if (e.name === 'AbortError') return null;
                    throw e;
                }
            }
            return null;
        }
    };

    /**
     * @param {object} options
     * @param {object} options.elements - DOM element refs (gate, lockBtn, etc.)
     * @param {string} options.pageLabel - e.g. Dashboard, Checker
     * @param {() => Promise<void>|void} options.onUnlock
     * @param {() => void} [options.onLock]
     * @param {object} [options.settings] - optional settings panel refs
     * @param {boolean} [options.promptSetupIfMissing=true]
     */
    function mountPasskeyGate(options) {
        const el = options.elements || {};
        const pageLabel = options.pageLabel || 'PackTracker';
        const onUnlock = options.onUnlock || (async () => {});
        const onLock = options.onLock || (() => {});
        const settings = options.settings || null;
        const promptSetupIfMissing = options.promptSetupIfMissing !== false;
        let unlockOnce = false;

        const gate = {
            showError(message) {
                if (!el.error) return;
                el.error.textContent = message;
                el.error.classList.remove('hidden');
            },

            clearError() {
                if (!el.error) return;
                el.error.textContent = '';
                el.error.classList.add('hidden');
            },

            hide() {
                el.gate?.classList.add('hidden');
                if (PasskeyAuth.loadConfig() && el.lockBtn) {
                    el.lockBtn.classList.remove('hidden');
                } else if (el.lockBtn) {
                    el.lockBtn.classList.add('hidden');
                }
                this.updateSettingsUI();
            },

            show(mode = 'login') {
                el.gate?.classList.remove('hidden');
                this.clearError();
                if (global.lucide && el.gate) lucide.createIcons({ root: el.gate });

                const hasConfig = !!PasskeyAuth.loadConfig();
                const supported = PasskeyAuth.isSupported();
                if (el.primaryBtn) el.primaryBtn.disabled = false;

                if (mode === 'login' && hasConfig) {
                    if (el.title) el.title.textContent = `Unlock ${pageLabel}`;
                    if (el.subtitle) el.subtitle.textContent = 'Sign in with your device passkey';
                    if (el.primaryLabel) el.primaryLabel.textContent = 'Sign in with passkey';
                    if (el.primaryBtn) el.primaryBtn.disabled = !supported;
                    el.skipBtn?.classList.add('hidden');
                    el.backupRow?.classList.remove('hidden');
                } else if (mode === 'setup' || !hasConfig) {
                    if (el.title) el.title.textContent = 'Set up passkey';
                    if (el.subtitle) el.subtitle.textContent = `Protect ${pageLabel} on shared devices`;
                    if (el.primaryLabel) {
                        el.primaryLabel.textContent = supported ? 'Create passkey' : 'Passkey unavailable';
                    }
                    if (el.primaryBtn) el.primaryBtn.disabled = !supported;
                    el.skipBtn?.classList.remove('hidden');
                    el.backupRow?.classList.remove('hidden');
                }

                if (el.hint) {
                    el.hint.textContent = supported
                        ? 'Passkeys are verified on this device only. Same config across PackTracker pages on this site.'
                        : 'Open over HTTPS or localhost to use passkeys. You can continue without one or import a config file.';
                }
            },

            updateSettingsUI() {
                if (!settings) return;
                const hasConfig = !!PasskeyAuth.loadConfig();
                if (hasConfig) {
                    if (settings.statusBadge) {
                        settings.statusBadge.textContent = 'On';
                        settings.statusBadge.className = 'text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border border-emerald-500/40 text-emerald-300 bg-emerald-500/10';
                    }
                    settings.setupBtn?.classList.add('hidden');
                    settings.removeBtn?.classList.remove('hidden');
                    settings.exportBtn?.classList.remove('hidden');
                    if (settings.hint) {
                        settings.hint.textContent = 'Use the lock icon in the header to require sign-in again.';
                    }
                } else {
                    if (settings.statusBadge) {
                        settings.statusBadge.textContent = 'Off';
                        settings.statusBadge.className = 'text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border border-slate-600 text-slate-400';
                    }
                    settings.setupBtn?.classList.remove('hidden');
                    settings.removeBtn?.classList.add('hidden');
                    settings.exportBtn?.classList.add('hidden');
                    if (settings.hint) {
                        settings.hint.textContent = 'Optional device login. Config stays in this browser or an exported file.';
                    }
                }
            },

            async unlockAndContinue() {
                this.hide();
                await onUnlock();
                unlockOnce = true;
            },

            lock() {
                PasskeyAuth.clearSession();
                onLock();
                if (PasskeyAuth.loadConfig()) {
                    this.show('login');
                } else {
                    this.hide();
                }
            },

            bindEvents() {
                el.primaryBtn?.addEventListener('click', async () => {
                    this.clearError();
                    try {
                        if (PasskeyAuth.loadConfig()) {
                            await PasskeyAuth.authenticatePasskey();
                        } else {
                            await PasskeyAuth.registerPasskey();
                        }
                        await this.unlockAndContinue();
                    } catch (err) {
                        this.showError(err.message || 'Passkey operation failed.');
                    }
                });

                el.skipBtn?.addEventListener('click', () => {
                    this.clearError();
                    localStorage.setItem(PASSKEY_DECLINE_KEY, '1');
                    this.unlockAndContinue();
                });

                const runImport = async (file) => {
                    if (!file) return;
                    this.clearError();
                    try {
                        await PasskeyAuth.importConfigFromFile(file);
                        await PasskeyAuth.authenticatePasskey();
                        await this.unlockAndContinue();
                    } catch (err) {
                        this.showError(err.message || 'Import failed.');
                    }
                };

                el.importBtn?.addEventListener('click', async () => {
                    try {
                        const file = await PasskeyAuth.pickConfigFile();
                        await runImport(file);
                    } catch (err) {
                        if (err.message) this.showError(err.message);
                        else el.importInput?.click();
                    }
                });

                el.importInput?.addEventListener('change', async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    await runImport(file);
                });

                el.exportBtn?.addEventListener('click', async () => {
                    this.clearError();
                    try {
                        await PasskeyAuth.exportConfigToFile();
                    } catch (err) {
                        this.showError(err.message || 'Export failed.');
                    }
                });

                el.lockBtn?.addEventListener('click', () => this.lock());

                settings?.setupBtn?.addEventListener('click', async () => {
                    try {
                        await PasskeyAuth.registerPasskey();
                        el.lockBtn?.classList.remove('hidden');
                        this.updateSettingsUI();
                    } catch (err) {
                        alert(err.message || 'Could not create passkey.');
                    }
                });

                settings?.removeBtn?.addEventListener('click', () => {
                    if (!confirm('Remove passkey from this browser? You can set it up again later.')) return;
                    PasskeyAuth.clearConfig();
                    PasskeyAuth.clearSession();
                    el.lockBtn?.classList.add('hidden');
                    this.updateSettingsUI();
                });

                settings?.exportBtn?.addEventListener('click', async () => {
                    try {
                        await PasskeyAuth.exportConfigToFile();
                    } catch (err) {
                        alert(err.message || 'Export failed.');
                    }
                });

                const importSettings = async (file) => {
                    if (!file) return;
                    await PasskeyAuth.importConfigFromFile(file);
                    this.updateSettingsUI();
                    alert('Config imported. Use Lock to sign in with your passkey.');
                };

                settings?.importBtn?.addEventListener('click', async () => {
                    try {
                        const file = await PasskeyAuth.pickConfigFile();
                        await importSettings(file);
                    } catch (err) {
                        if (err.name !== 'AbortError') settings.importInput?.click();
                    }
                });

                settings?.importInput?.addEventListener('change', async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    try {
                        await importSettings(file);
                    } catch (err) {
                        alert(err.message || 'Import failed.');
                    }
                });
            },

            async init() {
                this.bindEvents();
                this.updateSettingsUI();

                const hasConfig = !!PasskeyAuth.loadConfig();
                const sessionOk = PasskeyAuth.isSessionUnlocked();
                const declinedSetup = localStorage.getItem(PASSKEY_DECLINE_KEY) === '1';

                if (hasConfig && !sessionOk) {
                    this.show('login');
                    return;
                }
                if (!hasConfig && promptSetupIfMissing && !declinedSetup) {
                    this.show('setup');
                    return;
                }
                await this.unlockAndContinue();
            }
        };

        return gate;
    }

    global.PackTrackerPasskey = {
        Auth: PasskeyAuth,
        mountGate: mountPasskeyGate,
        PASSKEY_STORAGE_KEY,
        PASSKEY_SESSION_KEY,
        PASSKEY_DECLINE_KEY
    };
})(typeof window !== 'undefined' ? window : globalThis);
