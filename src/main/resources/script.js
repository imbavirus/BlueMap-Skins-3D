// BlueMap Offline Player Markers — map UI (v9.0)
// Feeds world x/y/z/yaw; body size is projected 1.8 blocks (option B).
(function () {
	'use strict';

	if (window.bmopmScriptLoaded === 'v9.3') return;
	window.bmopmScriptLoaded = 'v9.3';

	const VERSION = 'v9.3';
	const STORAGE_KEY = 'bmopm-3d-models-enabled';
	const STORAGE_OFFLINE = 'bmopm-show-offline';
	const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

	let modelsEnabled = false;
	let showOffline = true;
	let configLoaded = false;
	let updating = false;
	let updateTimer = null;
	/** Rebuilt every fetch — never sticky. Values: { yaw, name, x, y, z } */
	const liveByUuid = new Map();
	const liveByName = new Map();
	/** Offline POI positions from markers.json: uuid -> { x,y,z,yaw,name } */
	const offlineByUuid = new Map();
	let lastLiveFetch = 0;

	// Remove broken v8 overlay if present
	try {
		document.getElementById('bmopm-world-overlay')?.remove();
		window.bmopmWorldEntities = [];
	} catch (_) { /* */ }

	function parseSignedClassToken(prefix, classList) {
		if (!classList) return 0;
		for (const cls of classList) {
			if (!cls.startsWith(prefix)) continue;
			const raw = cls.substring(prefix.length);
			if (raw.startsWith('n')) return -parseInt(raw.substring(1), 10) || 0;
			return parseInt(raw, 10) || 0;
		}
		return 0;
	}

	function extractUuidFromString(s) {
		if (!s) return null;
		const m = String(s).match(UUID_RE);
		return m ? m[1] : null;
	}

	function extractPlayerUuid(el) {
		if (!el) return null;
		const nodes = [el, ...(el.querySelectorAll ? el.querySelectorAll('[class*="bmopm-player-"]') : [])];
		for (const node of nodes) {
			if (!node.classList) continue;
			for (const cls of node.classList) {
				if (cls.startsWith('bmopm-player-')) return cls.substring('bmopm-player-'.length);
			}
		}
		const idHit = extractUuidFromString(el.id) ||
			extractUuidFromString(el.getAttribute?.('data-player-uuid'));
		if (idHit) return idHit;
		let p = el.parentElement;
		for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
			const u = extractUuidFromString(p.id);
			if (u) return u;
		}
		const img = el.querySelector?.('img');
		if (img?.src) {
			const u = extractUuidFromString(img.src);
			if (u) return u;
		}
		return null;
	}

	function extractPlayerName(el) {
		const scan = [el, ...(el.querySelectorAll ? el.querySelectorAll('[class*="bmopm-nb-"]') : [])];
		for (const node of scan) {
			if (!node.classList) continue;
			for (const cls of node.classList) {
				if (!cls.startsWith('bmopm-nb-')) continue;
				try {
					const b64 = cls.substring('bmopm-nb-'.length).replace(/-/g, '+').replace(/_/g, '/');
					const pad = b64 + '==='.slice((b64.length + 3) % 4);
					const bin = atob(pad);
					const bytes = new Uint8Array(bin.length);
					for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
					const name = new TextDecoder().decode(bytes);
					if (name) return name;
				} catch (_) { /* */ }
			}
		}
		const nameEl = el.querySelector?.('.bm-player-name, .bmopm-nametag .bmopm-name');
		if (nameEl?.textContent) {
			return nameEl.textContent.replace(/\s*Offline\s*$/i, '').trim();
		}
		const label = el.querySelector?.('.bm-marker-poi-label');
		if (label?.textContent) {
			return label.textContent.replace(/\(offline\).*/i, '').replace(/\s*Offline\s*/i, '').trim().split('\n')[0].trim();
		}
		return null;
	}

	function onlinePlayerRoots() {
		return Array.from(document.querySelectorAll('.bm-marker-player'));
	}

	/** Offline POIs only — never match bmopm-player-uuid on live markers */
	function offlinePlayerRoots() {
		const nodes = Array.from(document.querySelectorAll(
			'.bm-marker-poi.bmopm-offline-player, .bmopm-offline-player'
		));
		return Array.from(new Set(
			nodes
				.map(el => el.closest('.bm-marker-poi') || el)
				.filter(el => el && !el.classList.contains('bm-marker-player'))
		));
	}

	function isLiveOnline(uuid, name) {
		if (uuid && liveByUuid.has(String(uuid).toLowerCase())) return true;
		if (name && liveByName.has(String(name).toLowerCase())) return true;
		return false;
	}

	function ensureOfflineNametag(root, name) {
		if (!root || root.classList.contains('bm-marker-player')) return;
		let tag = root.querySelector(':scope > .bmopm-nametag');
		if (!tag) {
			tag = document.createElement('div');
			tag.className = 'bmopm-nametag bmopm-nametag-offline';
			tag.innerHTML = '<div class="bmopm-name"></div><div class="bmopm-status">Offline</div>';
			root.appendChild(tag);
		}
		const nameEl = tag.querySelector('.bmopm-name');
		if (nameEl && name) nameEl.textContent = name;
		const st = tag.querySelector('.bmopm-status');
		if (st) st.textContent = 'Offline';
		const poiLabel = root.querySelector('.bm-marker-poi-label');
		if (poiLabel) poiLabel.style.setProperty('display', 'none', 'important');
	}

	function clearOfflineStyling(root) {
		if (!root) return;
		root.classList.remove('bmopm-offline-player');
		root.classList.add('bmopm-online-player');
		root.querySelector('.bmopm-nametag-offline, .bmopm-nametag')?.remove();
		const model = root.querySelector('.bmopm-3d-model');
		if (model) {
			model.dataset.kind = 'online';
			model.querySelectorAll('canvas').forEach(c => {
				c.classList.remove('bmopm-canvas-offline');
				c.style.removeProperty('filter');
			});
		}
	}

	function markerEntries() {
		const byEl = new Map();
		const onlineUuids = new Set();
		const onlineNames = new Set();

		for (const el of onlinePlayerRoots()) {
			byEl.set(el, 'online');
			const u = extractPlayerUuid(el);
			const n = extractPlayerName(el);
			if (u) onlineUuids.add(String(u).toLowerCase());
			if (n) onlineNames.add(String(n).toLowerCase());
		}

		for (const el of offlinePlayerRoots()) {
			const u = extractPlayerUuid(el);
			const n = extractPlayerName(el);
			const live = isLiveOnline(u, n) ||
				(u && onlineUuids.has(String(u).toLowerCase())) ||
				(n && onlineNames.has(String(n).toLowerCase()));
			if (live) {
				el.classList.add('bmopm-offline-hidden');
				el.style.setProperty('display', 'none', 'important');
				el.style.setProperty('visibility', 'hidden', 'important');
				continue;
			}
			if (!byEl.has(el)) byEl.set(el, 'offline');
		}
		return Array.from(byEl.entries()).map(([el, kind]) => ({ el, kind }));
	}

	function resolvePose(root, kind, uuid, name) {
		const u = uuid ? String(uuid).toLowerCase() : '';
		const n = name ? String(name).toLowerCase() : '';
		let yaw = 0;
		let x, y, z;

		if (kind === 'online' || isLiveOnline(uuid, name)) {
			const live = (u && liveByUuid.get(u)) || (n && liveByName.get(n));
			if (live) {
				if (Number.isFinite(live.yaw)) yaw = live.yaw;
				if (Number.isFinite(live.x)) { x = live.x; y = live.y; z = live.z; }
			}
		} else {
			yaw = parseSignedClassToken('bmopm-yaw-', root.classList);
			const off = u && offlineByUuid.get(u);
			if (off) {
				if (Number.isFinite(off.yaw)) yaw = off.yaw;
				if (Number.isFinite(off.x)) { x = off.x; y = off.y; z = off.z; }
			}
		}
		if (!Number.isFinite(x)) {
			// last resort: classes only for yaw
			if (kind === 'offline') yaw = parseSignedClassToken('bmopm-yaw-', root.classList);
		}
		return { yaw, x, y, z };
	}

	function ensureModelContainer(entry) {
		const root = entry.el;
		let kind = entry.kind;

		const cs = getComputedStyle(root);
		if (cs.position === 'static') root.style.position = 'relative';
		root.style.overflow = 'visible';

		let container = root.querySelector(':scope > .bmopm-3d-model') || root.querySelector('.bmopm-3d-model');
		if (!container) {
			container = document.createElement('div');
			container.className = 'bmopm-3d-model';
			root.insertBefore(container, root.firstChild);
		}

		const uuid = extractPlayerUuid(root);
		const name = extractPlayerName(root);
		if (uuid) {
			container.dataset.playerUuid = uuid;
			root.classList.add('bmopm-player-' + uuid);
		}
		if (name) container.dataset.playerName = name;

		if (root.classList.contains('bm-marker-player') || isLiveOnline(uuid, name)) {
			kind = 'online';
		}

		const pose = resolvePose(root, kind, uuid, name);
		container.dataset.kind = kind;
		container.dataset.yaw = String(pose.yaw || 0);
		if (Number.isFinite(pose.x)) {
			container.dataset.x = String(pose.x);
			container.dataset.y = String(pose.y);
			container.dataset.z = String(pose.z);
		}

		if (kind === 'online') {
			clearOfflineStyling(root);
			root.classList.add('bmopm-online-player');
			container.dataset.animate = 'true';
		} else {
			root.classList.add('bmopm-offline-player');
			root.classList.remove('bmopm-online-player');
			container.dataset.animate = root.classList.contains('bmopm-no-animate') ? 'false' : 'true';
			ensureOfflineNametag(root, name || 'Player');
		}
		return container;
	}

	function applyOfflineVisibility() {
		for (const el of offlinePlayerRoots()) {
			const u = extractPlayerUuid(el);
			const n = extractPlayerName(el);
			if (!showOffline || isLiveOnline(u, n)) {
				el.classList.add('bmopm-offline-hidden');
				el.style.setProperty('display', 'none', 'important');
			} else {
				el.classList.remove('bmopm-offline-hidden');
				el.style.removeProperty('display');
				el.style.removeProperty('visibility');
			}
		}
	}

	function scheduleUpdate(delay) {
		if (updateTimer) clearTimeout(updateTimer);
		updateTimer = setTimeout(() => {
			updateTimer = null;
			updateModelVisibility();
		}, delay == null ? 150 : delay);
	}

	function setModelsEnabled(enabled, persist) {
		modelsEnabled = !!enabled;
		window.bmopmModelsEnabled = modelsEnabled;
		document.body?.classList.toggle('bmopm-models-on', modelsEnabled);
		if (persist) localStorage.setItem(STORAGE_KEY, modelsEnabled ? 'true' : 'false');
		syncControlLabels();
		updateModelVisibility();
	}

	function setShowOffline(enabled, persist) {
		showOffline = !!enabled;
		window.bmopmShowOffline = showOffline;
		if (persist) localStorage.setItem(STORAGE_OFFLINE, showOffline ? 'true' : 'false');
		syncControlLabels();
		updateModelVisibility();
	}

	function syncControlLabels() {
		const btn = document.getElementById('bmopm-3d-toggle');
		if (btn) {
			btn.textContent = modelsEnabled ? '3D ON' : '3D OFF';
			btn.classList.toggle('bmopm-active', modelsEnabled);
		}
		const offBtn = document.getElementById('bmopm-offline-toggle');
		if (offBtn) {
			offBtn.textContent = showOffline ? 'Offline ON' : 'Offline OFF';
			offBtn.classList.toggle('bmopm-active', showOffline);
			offBtn.title = showOffline ? 'Hide offline players' : 'Show offline players';
		}
	}

	function updateModelVisibility() {
		if (updating) return;
		updating = true;
		try {
			applyOfflineVisibility();
			const entries = markerEntries();
			for (const entry of entries) {
				const root = entry.el;
				if (entry.kind === 'offline' && !showOffline) {
					root.classList.remove('bmopm-3d-mode');
					continue;
				}
				const container = ensureModelContainer(entry);
				const icon = root.querySelector('.bm-marker-poi-icon');
				const headImg = root.querySelector('img[alt="playerhead"]');

				if (modelsEnabled) {
					// Always hide POI/head icons when body model is on
					if (icon) {
						icon.style.setProperty('display', 'none', 'important');
						icon.style.setProperty('visibility', 'hidden', 'important');
						icon.style.setProperty('opacity', '0', 'important');
					}
					root.querySelectorAll('img').forEach(img => {
						if (img.classList.contains('bmopm-body')) return;
						if (img.closest('.bmopm-3d-model')) return;
						if (img.closest('.bmopm-floating-figure')) return;
						img.style.setProperty('display', 'none', 'important');
						img.style.setProperty('visibility', 'hidden', 'important');
					});
					// IMPORTANT: keep .bmopm-3d-model as a zero-size discovery hook only.
					// The visible body is position:fixed (.bmopm-floating-figure).
					// Forcing display:block + 64×112 here re-opens an in-CSS2D path and races the model script.
					container.style.setProperty('display', 'none', 'important');
					container.style.setProperty('width', '0', 'important');
					container.style.setProperty('height', '0', 'important');
					container.style.setProperty('overflow', 'hidden', 'important');
					root.classList.add('bmopm-3d-mode');
				} else {
					if (icon) {
						icon.style.removeProperty('display');
						icon.style.removeProperty('visibility');
					}
					if (headImg) {
						headImg.style.removeProperty('display');
						headImg.style.removeProperty('visibility');
					}
					container.style.setProperty('display', 'none', 'important');
					root.classList.remove('bmopm-3d-mode');
					if (entry.kind === 'offline') {
						ensureOfflineNametag(root, extractPlayerName(root) || 'Player');
					}
				}
			}
			window.bmopmModelsEnabled = modelsEnabled;
			if (modelsEnabled && typeof window.bmopmSyncModels === 'function') {
				window.bmopmSyncModels();
			}
		} finally {
			updating = false;
		}
	}

	function ensureControlBar() {
		// Inject style tag so position wins over any cached bmopm-*.css
		// Original was right:14px bottom-right; +50px left => right:64px. Use 114px so it's
		// obviously shifted even if a prior patch already applied 64px.
		let posStyle = document.getElementById('bmopm-controls-pos-style');
		if (!posStyle) {
			posStyle = document.createElement('style');
			posStyle.id = 'bmopm-controls-pos-style';
			(document.head || document.documentElement).appendChild(posStyle);
		}
		posStyle.textContent = [
			'#bmopm-controls.bmopm-controls,',
			'#bmopm-controls {',
			'  position: fixed !important;',
			'  right: 114px !important;',
			'  bottom: 18px !important;',
			'  top: auto !important;',
			'  left: auto !important;',
			'  display: flex !important;',
			'  flex-direction: column !important;',
			'  gap: 8px !important;',
			'  z-index: 10050 !important;',
			'  pointer-events: auto !important;',
			'  margin: 0 !important;',
			'  transform: none !important;',
			'}'
		].join('\n');

		let bar = document.getElementById('bmopm-controls');
		if (!bar) {
			bar = document.createElement('div');
			bar.id = 'bmopm-controls';
			bar.className = 'bmopm-controls';
			(document.body || document.documentElement).appendChild(bar);
		} else if (!bar.isConnected) {
			document.body.appendChild(bar);
		}
		// Inline !important as well (beats most author CSS)
		bar.style.cssText = [
			'position:fixed !important',
			'right:114px !important',
			'bottom:18px !important',
			'top:auto !important',
			'left:auto !important',
			'display:flex !important',
			'flex-direction:column !important',
			'gap:8px !important',
			'z-index:10050 !important',
			'pointer-events:auto !important',
			'margin:0 !important',
			'transform:none !important'
		].join(';');

		if (!document.getElementById('bmopm-3d-toggle')) {
			const button = document.createElement('button');
			button.id = 'bmopm-3d-toggle';
			button.type = 'button';
			button.className = 'bmopm-3d-toggle-button';
			button.addEventListener('click', e => {
				e.preventDefault();
				e.stopPropagation();
				setModelsEnabled(!modelsEnabled, true);
			});
			bar.appendChild(button);
		}
		if (!document.getElementById('bmopm-offline-toggle')) {
			const offBtn = document.createElement('button');
			offBtn.id = 'bmopm-offline-toggle';
			offBtn.type = 'button';
			offBtn.className = 'bmopm-3d-toggle-button bmopm-offline-toggle-button';
			offBtn.addEventListener('click', e => {
				e.preventDefault();
				e.stopPropagation();
				setShowOffline(!showOffline, true);
			});
			bar.appendChild(offBtn);
		}
		syncControlLabels();
	}

	function currentMapId() {
		try {
			if (bluemap?.mapViewer?.map?.data?.id) return bluemap.mapViewer.map.data.id;
		} catch (_) { /* */ }
		return 'world';
	}

	/** Replace live + offline pose caches entirely each poll (never sticky) */
	function fetchLivePlayers() {
		const now = Date.now();
		if (now - lastLiveFetch < 900) return;
		lastLiveFetch = now;
		const mapId = currentMapId();
		const base = `maps/${encodeURIComponent(mapId)}/live`;
		Promise.all([
			fetch(`${base}/players.json`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null),
			fetch(`${base}/markers.json`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null)
		]).then(([playersData, markersData]) => {
			liveByUuid.clear();
			liveByName.clear();
			const list = Array.isArray(playersData) ? playersData : (playersData?.players || []);
			if (Array.isArray(list)) {
				for (const p of list) {
					if (!p) continue;
					const uuid = (p.uuid || '').toString().toLowerCase();
					const name = (p.name || '').toString();
					const pos = p.position || {};
					const rot = p.rotation || {};
					let yaw = rot.yaw;
					if (typeof yaw !== 'number') yaw = p.yaw;
					if (typeof yaw !== 'number') yaw = 0;
					const entry = {
						yaw,
						name,
						x: Number(pos.x),
						y: Number(pos.y),
						z: Number(pos.z)
					};
					if (uuid) liveByUuid.set(uuid, entry);
					if (name) liveByName.set(name.toLowerCase(), entry);
				}
			}

			offlineByUuid.clear();
			if (markersData && typeof markersData === 'object') {
				for (const [setId, set] of Object.entries(markersData)) {
					if (!set?.markers) continue;
					const offlineSet = setId === 'offline-players' || /offline/i.test(set.label || '');
					for (const [mid, m] of Object.entries(set.markers)) {
						if (!m) continue;
						const classes = m.classes || [];
						if (!offlineSet && !classes.some(c => String(c).includes('bmopm-offline'))) continue;
						const pos = m.position || {};
						const x = Number(pos.x), y = Number(pos.y), z = Number(pos.z);
						if (!Number.isFinite(x)) continue;
						let yaw = 0;
						let name = m.label || '';
						for (const cls of classes) {
							const s = String(cls);
							if (s.startsWith('bmopm-yaw-')) {
								const raw = s.substring(10);
								yaw = raw.startsWith('n') ? -parseInt(raw.slice(1), 10) || 0 : parseInt(raw, 10) || 0;
							}
							if (s.startsWith('bmopm-nb-')) {
								try {
									const b64 = s.substring(8).replace(/-/g, '+').replace(/_/g, '/');
									const pad = b64 + '==='.slice((b64.length + 3) % 4);
									name = new TextDecoder().decode(Uint8Array.from(atob(pad), c => c.charCodeAt(0)));
								} catch (_) { /* */ }
							}
						}
						const uuid = (extractUuidFromString(mid) || mid || '').toLowerCase();
						offlineByUuid.set(uuid, { uuid, name, x, y, z, yaw });
					}
				}
			}
			scheduleUpdate(50);
		});
	}

	function loadConfigThenInit() {
		const storedOff = localStorage.getItem(STORAGE_OFFLINE);
		if (storedOff === 'true' || storedOff === 'false') showOffline = storedOff === 'true';
		// Default models ON. Only honor explicit false from localStorage.
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === 'false') {
			modelsEnabled = false;
		} else {
			modelsEnabled = true;
			if (stored !== 'true') localStorage.setItem(STORAGE_KEY, 'true');
		}
		configLoaded = true;
		finishInit();
	}

	function finishInit() {
		window.bmopmModelsEnabled = modelsEnabled;
		window.bmopmShowOffline = showOffline;
		document.body?.classList.toggle('bmopm-models-on', modelsEnabled);
		ensureControlBar();
		fetchLivePlayers();
		updateModelVisibility();
		[400, 1500, 4000].forEach(ms => setTimeout(() => {
			fetchLivePlayers();
			updateModelVisibility();
		}, ms));
	}

	const observer = new MutationObserver(() => {
		if (configLoaded) scheduleUpdate(180);
	});

	if (typeof bluemap !== 'undefined' && bluemap.events) {
		bluemap.events.addEventListener('markersUpdated', () => scheduleUpdate(200));
		bluemap.events.addEventListener('ready', () => {
			ensureControlBar();
			scheduleUpdate(300);
		});
		bluemap.events.addEventListener('bluemapCameraMoved', () => {
			if (modelsEnabled && typeof window.bmopmOnCameraDistance === 'function') {
				window.bmopmOnCameraDistance();
			}
		});
	}

	setInterval(() => {
		if (!configLoaded) return;
		fetchLivePlayers();
		if (modelsEnabled) scheduleUpdate(100);
	}, 1200);

	window.bmopmDebug = function () {
		return {
			version: VERSION,
			modelsEnabled,
			showOffline,
			live: liveByUuid.size,
			offlineDom: offlinePlayerRoots().length,
			onlineDom: onlinePlayerRoots().length,
			models: typeof window.bmopmDebugWorld === 'function' ? window.bmopmDebugWorld() : null
		};
	};

	if (!customElements.get('bmopm-datetime')) {
		class LocaleDateTime extends HTMLElement {
			connectedCallback() {
				const ts = this.getAttribute('data-timestamp');
				if (ts) this.innerText = new Date(parseInt(ts, 10)).toLocaleString();
			}
		}
		customElements.define('bmopm-datetime', LocaleDateTime);
	}

	function boot() {
		if (document.body) observer.observe(document.body, { childList: true, subtree: true });
		loadConfigThenInit();
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
	else boot();

	console.log('[BMOPM] script.js', VERSION, 'world pose for 1.8-block body size');
})();
