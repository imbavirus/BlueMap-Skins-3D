// BlueMap Offline Player Markers — player figures (v9.2)
// Size: projected 1.8 world blocks (option B) — unchanged from working v9.0.
// Facing: simple playerWrapper.rotation from MC yaw only (no skinview camera hacks).
(function () {
	'use strict';

	const THIS_VERSION = 'v9.2';
	if (window.bmopmPlayerModelLoadedVersion === THIS_VERSION && typeof window.bmopmSyncModels === 'function') {
		return;
	}
	try {
		document.getElementById('bmopm-world-overlay')?.remove();
		document.querySelectorAll('.bmopm-floating-figure').forEach(el => el.remove());
	} catch (_) { /* */ }

	window.bmopmPlayerModelLoadedVersion = THIS_VERSION;

	/** @type {Map<string, object>} */
	const scenes = new Map();
	/** Internal render buffer (stretched via CSS to world-projected size) */
	const BUF_W = 64;
	const BUF_H = 112;
	const PLAYER_HEIGHT_BLOCKS = 1.8;
	const SKINVIEW_CDN = 'https://cdn.jsdelivr.net/npm/skinview3d@3.1.0/bundles/skinview3d.bundle.js';
	const DEG2RAD = Math.PI / 180;

	let skinview3dApi = null;
	let skinviewLoadPromise = null;
	let layoutRaf = 0;

	function sceneKey(uuid, name) {
		return (uuid || '') + '|' + (name || '');
	}

	function ensureSkinview3d() {
		if (skinview3dApi) return Promise.resolve(skinview3dApi);
		if (skinview3dApi === false) return Promise.resolve(null);
		if (skinviewLoadPromise) return skinviewLoadPromise;
		if (window.skinview3d?.SkinViewer) {
			skinview3dApi = window.skinview3d;
			return Promise.resolve(skinview3dApi);
		}
		skinviewLoadPromise = new Promise(resolve => {
			const s = document.createElement('script');
			s.src = SKINVIEW_CDN;
			s.async = true;
			s.onload = () => {
				skinview3dApi = window.skinview3d?.SkinViewer ? window.skinview3d : false;
				resolve(skinview3dApi || null);
			};
			s.onerror = () => { skinview3dApi = false; resolve(null); };
			document.head.appendChild(s);
		});
		return skinviewLoadPromise;
	}

	function skinUrls(uuid, name) {
		const urls = [];
		if (uuid) urls.push(`assets/bmopm-skins/${uuid}.png`, `/assets/bmopm-skins/${uuid}.png`);
		if (name) {
			const n = encodeURIComponent(name);
			urls.push(`https://mc-heads.net/skin/${n}`, `https://minotar.net/skin/${n}`);
		}
		if (uuid) urls.push(`https://mc-heads.net/skin/${uuid}`, `https://crafatar.com/skins/${uuid}`);
		return urls;
	}

	function bodyImageUrls(uuid, name) {
		const urls = [];
		const add = (id) => {
			if (!id) return;
			urls.push(`https://mc-heads.net/body/${id}`);
			urls.push(`https://minotar.net/body/${id}/112`);
		};
		if (name) add(encodeURIComponent(name));
		if (uuid) add(uuid);
		return urls;
	}

	/**
	 * Project Minecraft world (x,y,z) → CSS pixels using BlueMap camera matrices.
	 * Same transform BlueMap uses for the map view (CombinedCamera).
	 * Returns null if behind camera / invalid.
	 */
	function projectWorldToScreen(x, y, z) {
		const mv = window.bluemap?.mapViewer;
		const cam = mv?.camera;
		const root = mv?.rootElement || document.getElementById('map-container');
		if (!cam?.matrixWorldInverse?.elements || !cam?.projectionMatrix?.elements || !root) {
			return null;
		}
		const w = root.clientWidth || window.innerWidth;
		const h = root.clientHeight || window.innerHeight;
		if (w < 2 || h < 2) return null;

		const e = cam.matrixWorldInverse.elements;
		// world → view
		const vx = e[0] * x + e[4] * y + e[8] * z + e[12];
		const vy = e[1] * x + e[5] * y + e[9] * z + e[13];
		const vz = e[2] * x + e[6] * y + e[10] * z + e[14];

		const p = cam.projectionMatrix.elements;
		const cx = p[0] * vx + p[4] * vy + p[8] * vz + p[12];
		const cy = p[1] * vx + p[5] * vy + p[9] * vz + p[13];
		const cw = p[3] * vx + p[7] * vy + p[11] * vz + p[15];
		if (!Number.isFinite(cw) || Math.abs(cw) < 1e-9) return null;

		const ndcX = cx / cw;
		const ndcY = cy / cw;
		if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) return null;
		// behind / extreme clip
		if (ndcX < -1.5 || ndcX > 1.5 || ndcY < -1.5 || ndcY > 1.5) return null;

		const rootRect = root.getBoundingClientRect();
		return {
			x: rootRect.left + (ndcX * 0.5 + 0.5) * w,
			y: rootRect.top + (-ndcY * 0.5 + 0.5) * h,
			ndcZ: (p[2] * vx + p[6] * vy + p[10] * vz + p[14]) / cw
		};
	}

	function readWorldPose(container) {
		if (!container) return null;
		const x = parseFloat(container.dataset.x);
		const y = parseFloat(container.dataset.y);
		const z = parseFloat(container.dataset.z);
		const yaw = parseFloat(container.dataset.yaw);
		if (![x, y, z].every(Number.isFinite)) return null;
		return {
			x, y, z,
			yaw: Number.isFinite(yaw) ? yaw : 0,
			online: container.dataset.kind === 'online'
		};
	}

	/**
	 * World size layout:
	 *   height_px = |project(feet) − project(head)|  where head = feet + (0, 1.8, 0)
	 *   width_px  = height_px * (64/112)
	 * Only one size source — no extra scale().
	 */
	function layoutWorldSized(state) {
		const float = state.floating;
		const pose = state.pose;
		if (!float || !pose) {
			if (float) float.style.visibility = 'hidden';
			return false;
		}

		// Online BlueMap player markers sit near head; players.json is usually feet.
		// We always treat pose.y as feet when set from JSON. Online head markers: still use feet y.
		const feetY = pose.y;
		const headY = pose.y + PLAYER_HEIGHT_BLOCKS;

		const feet = projectWorldToScreen(pose.x, feetY, pose.z);
		const head = projectWorldToScreen(pose.x, headY, pose.z);
		if (!feet || !head) {
			float.style.visibility = 'hidden';
			return false;
		}

		// Screen Y grows downward; head should be above feet → head.y < feet.y
		const top = Math.min(feet.y, head.y);
		const bottom = Math.max(feet.y, head.y);
		let heightPx = bottom - top;
		// Degenerate (top-down / horizon): fall back to horizontal foreshortening estimate
		if (!Number.isFinite(heightPx) || heightPx < 0.5) {
			float.style.visibility = 'hidden';
			return false;
		}

		// Soft safety only for broken matrices / off-screen extremes — not a "feel" scale
		const maxH = (window.innerHeight || 900) * 1.2;
		if (heightPx > maxH) heightPx = maxH;

		const widthPx = heightPx * (BUF_W / BUF_H);
		// Center horizontally on feet projection (same X as head in orthographic-ish views)
		const midX = (feet.x + head.x) / 2;
		const left = midX - widthPx / 2;

		float.style.visibility = 'visible';
		float.style.display = 'block';
		float.style.opacity = '1';
		float.style.transform = 'none';
		float.style.left = Math.round(left) + 'px';
		float.style.top = Math.round(top) + 'px';
		float.style.width = Math.round(widthPx) + 'px';
		float.style.height = Math.round(heightPx) + 'px';

		// Stretch buffer content to world pixel size
		if (state.el) {
			state.el.style.width = '100%';
			state.el.style.height = '100%';
			if (state.el.tagName === 'CANVAS') {
				state.el.style.width = '100%';
				state.el.style.height = '100%';
			}
			const img = state.el.tagName === 'IMG' ? state.el : state.el.querySelector?.('img');
			if (img) {
				img.style.width = '100%';
				img.style.height = '100%';
			}
			const wrap = state.el.classList?.contains('bmopm-body-wrap') ? state.el : null;
			if (wrap) {
				wrap.style.width = '100%';
				wrap.style.height = '100%';
			}
		}

		state._lastH = heightPx;
		state._lastW = widthPx;
		return true;
	}

	/**
	 * In-game yaw only — rotate the model, leave skinview's default camera alone.
	 * (Moving skinview.camera relative to the map camera broke rendering → green square.)
	 *
	 * Floating canvas always faces the screen. To show the correct compass side of the
	 * character, subtract BlueMap map rotation so body facing tracks MC yaw in the world.
	 * BlueMap: controlsManager.rotation ≈ (lookYaw - 180) * deg2rad when following.
	 */
	function getMapYawRad() {
		try {
			const cm = window.bluemap?.mapViewer?.controlsManager;
			if (!cm) return 0;
			let r = cm.rotation;
			if (!Number.isFinite(r) && cm.data) r = cm.data.rotation;
			return Number.isFinite(r) ? r : 0;
		} catch (_) {
			return 0;
		}
	}

	function applyInGameFacing(viewer, pose) {
		if (!viewer?.playerWrapper) return;
		const yawDeg = Number(pose?.yaw) || 0;
		const yawRad = yawDeg * DEG2RAD;
		try {
			viewer.autoRotate = false;
			// Keep default skinview framing; only rotate the player mesh.
			// mapYaw accounts for billboard always facing the viewer.
			const mapYaw = getMapYawRad();
			viewer.playerWrapper.rotation.set(0, mapYaw - yawRad, 0);
		} catch (_) { /* */ }
	}

	function create2dBody(key, uuid, name, offline) {
		const wrap = document.createElement('div');
		wrap.className = 'bmopm-body-wrap' + (offline ? ' bmopm-body-offline' : '');
		wrap.style.cssText = 'width:100%;height:100%;line-height:0;pointer-events:none;';
		const img = document.createElement('img');
		img.className = 'bmopm-body';
		img.alt = name || 'player';
		img.draggable = false;
		img.style.cssText = 'width:100%;height:100%;object-fit:contain;object-position:bottom center;image-rendering:pixelated;display:block;';
		if (offline) img.style.filter = 'grayscale(1)';
		wrap.appendChild(img);

		const urls = bodyImageUrls(uuid, name);
		let i = 0;
		const tryNext = () => {
			if (i >= urls.length) return;
			const url = urls[i++];
			const t = new Image();
			t.onload = () => { img.src = url; };
			t.onerror = () => tryNext();
			t.src = url;
		};
		tryNext();

		return {
			key, mode: '2d', el: wrap, img, alive: true, offline: !!offline,
			yaw: 0, viewer: null, floating: null, pose: null
		};
	}

	function create3dScene(key, uuid, name, yaw, animate, offline) {
		const canvas = document.createElement('canvas');
		canvas.width = BUF_W;
		canvas.height = BUF_H;
		canvas.className = 'bmopm-canvas' + (offline ? ' bmopm-canvas-offline' : '');
		canvas.style.cssText = 'display:block;width:100%;height:100%;image-rendering:pixelated;pointer-events:none;';
		if (offline) canvas.style.filter = 'grayscale(1)';

		const state = {
			key, mode: '3d', canvas, el: canvas, viewer: null, alive: true,
			yaw: yaw || 0, offline: !!offline, floating: null, pose: null
		};

		const sv = skinview3dApi;
		try {
			const viewer = new sv.SkinViewer({
				canvas, width: BUF_W, height: BUF_H,
				enableControls: false, background: null,
				pixelRatio: 1
			});
			viewer.zoom = 0.9;
			viewer.fov = 40;
			viewer.autoRotate = false;
			applyInGameFacing(viewer, { yaw });
			if (animate && !offline && sv.WalkingAnimation) {
				viewer.animation = new sv.WalkingAnimation();
				viewer.animation.speed = 0.55;
			} else if (sv.IdleAnimation) {
				viewer.animation = new sv.IdleAnimation();
			}
			state.viewer = viewer;

			const urls = skinUrls(uuid, name);
			let i = 0;
			const tryNext = () => {
				if (!state.alive || !state.viewer || i >= urls.length) return;
				const url = urls[i++];
				Promise.resolve(viewer.loadSkin(url, { model: 'auto-detect' }))
					.then(() => applyInGameFacing(viewer, state.pose || { yaw: state.yaw }))
					.catch(() => tryNext());
			};
			tryNext();
		} catch (e) {
			state.mode = 'fail';
		}
		return state;
	}

	function disposeScene(state) {
		if (!state) return;
		state.alive = false;
		if (state.viewer) {
			try { state.viewer.dispose(); } catch (_) { /* */ }
			state.viewer = null;
		}
		if (state.floating?.parentNode) state.floating.parentNode.removeChild(state.floating);
		state.floating = null;
	}

	function ensureFloating(state) {
		if (state.floating?.isConnected) return state.floating;
		const div = document.createElement('div');
		div.className = 'bmopm-floating-figure' + (state.offline ? ' bmopm-floating-offline' : '');
		div.setAttribute('data-bmopm-key', state.key);
		div.style.cssText = [
			'position:fixed',
			'left:0',
			'top:0',
			'width:64px',
			'height:112px',
			'margin:0',
			'padding:0',
			'pointer-events:none',
			'z-index:6',
			'overflow:visible',
			'line-height:0',
			'transform:none',
			'display:block',
			'visibility:hidden'
		].join(';');
		div.appendChild(state.el);
		document.body.appendChild(div);
		state.floating = div;
		return div;
	}

	function attach(state, container, marker) {
		if (!state) return;
		ensureFloating(state);
		state._container = container;
		state._marker = marker;
		state.pose = readWorldPose(container);
		state.yaw = state.pose?.yaw ?? (parseFloat(container?.dataset?.yaw) || 0);
		if (state.viewer) applyInGameFacing(state.viewer, state.pose || { yaw: state.yaw });

		if (container) {
			container.style.setProperty('display', 'none', 'important');
			container.style.setProperty('width', '0', 'important');
			container.style.setProperty('height', '0', 'important');
			container.dataset.initialized = 'true';
			container.dataset.mode = state.mode;
		}
		if (marker) {
			marker.querySelectorAll('.bm-marker-poi-icon, img').forEach(img => {
				if (img.classList.contains('bmopm-body')) return;
				if (img.closest('.bmopm-floating-figure')) return;
				img.style.setProperty('display', 'none', 'important');
				img.style.setProperty('visibility', 'hidden', 'important');
				img.style.setProperty('opacity', '0', 'important');
			});
		}
		layoutWorldSized(state);
	}

	async function createScene(key, uuid, name, yaw, animate, offline) {
		const quick = create2dBody(key, uuid, name, offline);
		quick.yaw = yaw || 0;
		const sv = await ensureSkinview3d();
		if (!sv) return quick;
		const s3 = create3dScene(key, uuid, name, yaw, animate, offline);
		if (s3.mode === '3d' && s3.viewer) {
			disposeScene(quick);
			return s3;
		}
		return quick;
	}

	function syncModels() {
		if (window.bmopmModelsEnabled === false) {
			for (const state of scenes.values()) {
				if (state.floating) state.floating.style.visibility = 'hidden';
			}
			return;
		}

		const seen = new Set();
		document.querySelectorAll('.bmopm-3d-model').forEach(container => {
			const marker = container.closest('.bm-marker-player') ||
				container.closest('.bm-marker-poi') ||
				container.parentElement;
			if (!marker || marker.classList.contains('bmopm-offline-hidden')) return;
			if (!marker.classList.contains('bmopm-3d-mode') && window.bmopmModelsEnabled !== true) return;

			const uuid = container.dataset.playerUuid || '';
			const name = container.dataset.playerName || '';
			if (!uuid && !name) return;

			// Need world pose for option B
			const pose = readWorldPose(container);
			if (!pose) return;

			const key = sceneKey(uuid, name);
			seen.add(key);

			const isOnline = marker.classList.contains('bm-marker-player');
			const offline = !isOnline && (
				container.dataset.kind === 'offline' ||
				marker.classList.contains('bmopm-offline-player')
			);
			if (offline && window.bmopmShowOffline === false) {
				const st = scenes.get(key);
				if (st?.floating) st.floating.style.visibility = 'hidden';
				return;
			}

			const yawVal = pose.yaw;
			const animate = !offline && container.dataset.animate !== 'false';

			let state = scenes.get(key);
			if (state && state.alive && state.offline !== offline) {
				disposeScene(state);
				scenes.delete(key);
				state = null;
			}
			if (!state || !state.alive) {
				const quick = create2dBody(key, uuid, name, offline);
				quick.yaw = yawVal;
				quick.pose = pose;
				scenes.set(key, quick);
				attach(quick, container, marker);

				createScene(key, uuid, name, yawVal, animate, offline).then(s => {
					if (!s?.alive) return;
					const cur = scenes.get(key);
					if (cur && cur !== s) disposeScene(cur);
					s.pose = readWorldPose(container) || pose;
					scenes.set(key, s);
					attach(s, container, marker);
				});
			} else {
				state.yaw = yawVal;
				state.pose = pose;
				attach(state, container, marker);
			}
		});

		for (const [key, state] of scenes) {
			if (seen.has(key)) {
				delete state._detachAt;
				continue;
			}
			if (!state._detachAt) state._detachAt = Date.now();
			if (Date.now() - state._detachAt > 8000) {
				disposeScene(state);
				scenes.delete(key);
			} else if (state.floating) {
				state.floating.style.visibility = 'hidden';
			}
		}
	}

	function layoutLoop() {
		layoutRaf = requestAnimationFrame(layoutLoop);
		if (window.bmopmModelsEnabled === false) return;
		for (const state of scenes.values()) {
			if (!state.alive) continue;
			// Refresh pose from container each frame (live players move)
			if (state._container) {
				const p = readWorldPose(state._container);
				if (p) {
					state.pose = p;
					state.yaw = p.yaw;
				}
			}
			layoutWorldSized(state);
			if (state.viewer) applyInGameFacing(state.viewer, state.pose || { yaw: state.yaw });
		}
	}

	window.initializeModels = syncModels;
	window.bmopmSyncModels = syncModels;
	window.bmopmOnCameraDistance = function () {};
	window.bmopmDebugWorld = function () {
		const sample = [];
		scenes.forEach(s => {
			sample.push({
				key: s.key,
				mode: s.mode,
				pose: s.pose,
				lastH: s._lastH,
				lastW: s._lastW
			});
		});
		return {
			version: THIS_VERSION,
			mode: 'world-height-1.8-blocks + mesh yaw',
			playerHeightBlocks: PLAYER_HEIGHT_BLOCKS,
			scenes: scenes.size,
			sample
		};
	};

	console.log('[BMOPM] player-model.js', THIS_VERSION, '1.8-block size + simple yaw');
	ensureSkinview3d();
	setTimeout(syncModels, 50);
	setTimeout(syncModels, 400);
	setTimeout(syncModels, 1500);
	if (!layoutRaf) layoutRaf = requestAnimationFrame(layoutLoop);
	setInterval(() => {
		if (window.bmopmModelsEnabled !== false) syncModels();
	}, 800);
})();
