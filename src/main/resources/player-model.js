// 3D Player Model Renderer for BlueMap Offline Player Markers
// Uses Three.js (already available in BlueMap) to render player models

(function() {
	'use strict';
	
	// Prevent duplicate loads (BlueMap can inject scripts more than once)
	// Important: do NOT permanently block newer versions if an older one loaded but didn't finish init.
	const THIS_VERSION = 'v4.3';
	if (window.bmopmPlayerModelLoadedVersion === THIS_VERSION && typeof window.initializeModels === 'function') {
		console.warn('[BMOPM] player-model.js already loaded (' + THIS_VERSION + '), skipping duplicate load');
		return;
	}
	window.bmopmPlayerModelLoadedVersion = THIS_VERSION;

	// Player model geometry cache
	const modelCache = new Map();
	const skinCache = new Map();

	// Resolved Three.js namespace (BlueMap may expose a wrapper, not the raw THREE namespace)
	let THREE_NS = null;

	function looksLikeThree(ns) {
		return !!(ns &&
			typeof ns.Scene === 'function' &&
			typeof ns.Group === 'function' &&
			typeof ns.BoxGeometry === 'function' &&
			typeof ns.WebGLRenderer === 'function' &&
			typeof ns.TextureLoader === 'function');
	}

	function resolveThreeNamespace(maybe) {
		// Try common shapes:
		// - raw THREE namespace
		// - wrapper with .THREE
		// - module default export
		// - nested combinations (defensive)
		// If BlueMap exposes an array-like bundle (we've seen keys: 0,1,2), scan its elements too
		const expanded = [];
		if (Array.isArray(maybe)) {
			for (const item of maybe) expanded.push(item);
		} else if (maybe && typeof maybe === 'object' && typeof maybe.length === 'number' && maybe.length > 0) {
			// Array-like object
			for (let i = 0; i < maybe.length; i++) expanded.push(maybe[i]);
		}

		const candidates = [
			maybe,
			...expanded,
			maybe && maybe.THREE,
			maybe && maybe.default,
			maybe && maybe.THREE && maybe.THREE.default,
			...expanded.map(x => x && x.THREE).filter(Boolean),
			...expanded.map(x => x && x.default).filter(Boolean),
			(window.bluemap && window.bluemap.THREE) || null
		].filter(Boolean);

		for (const c of candidates) {
			if (looksLikeThree(c)) return c;
		}
		return null;
	}

	// Fallback: BlueMap might not expose Three.js on window in some builds. If so, load our own.
	function loadThreeFromCdn() {
		// If already loaded and usable, resolve immediately
		if (looksLikeThree(window.THREE)) return Promise.resolve(window.THREE);

		// Reuse in-flight load across script reloads
		if (window.__bmopmThreePromise) return window.__bmopmThreePromise;

		window.__bmopmThreePromise = new Promise((resolve, reject) => {
			try {
				const script = document.createElement('script');
				script.src = 'https://unpkg.com/three@0.160.0/build/three.min.js';
				script.async = true;
				script.crossOrigin = 'anonymous';

				script.onload = () => {
					if (looksLikeThree(window.THREE)) {
						console.log('[BMOPM] Loaded Three.js from CDN, version:', window.THREE.REVISION || 'unknown');
						resolve(window.THREE);
					} else {
						reject(new Error('Three.js CDN loaded but window.THREE is not usable'));
					}
				};
				script.onerror = () => reject(new Error('Failed to load Three.js from CDN'));

				document.head.appendChild(script);
			} catch (e) {
				reject(e);
			}
		});

		return window.__bmopmThreePromise;
	}
	
	// Wait for Three.js to be available (BlueMap loads it)
	function waitForThreeJS(callback, maxAttempts) {
		maxAttempts = maxAttempts || 150; // Try for 15 seconds (150 * 100ms) - BlueMap may load it late
		let attempts = 0;
		
		let warnedShape = false;
		let fallbackAttempted = false;

		function tryFallbackOnce() {
			if (fallbackAttempted) return;
			fallbackAttempted = true;

			console.warn('[BMOPM] Attempting to load Three.js from CDN as fallback...');
			loadThreeFromCdn()
				.then((three) => {
					THREE_NS = three;
					window.THREE = three;
					callback();
				})
				.catch((e) => {
					console.warn('[BMOPM] Failed to load Three.js fallback:', e && e.message ? e.message : e);
					console.warn('[BMOPM] Checked for: window.__THREE__, window.THREE, window.bluemap.THREE');
					try {
						console.warn('[BMOPM] Available globals:', Object.keys(window).filter(k => k.includes('THREE') || k.includes('three')));
					} catch (_) {}
				});
		}

		function check() {
			// BlueMap uses __THREE__ as the global name
			const detected = window.__THREE__ || window.THREE || (window.bluemap && window.bluemap.THREE) || null;
			const resolved = resolveThreeNamespace(detected);
			
			if (resolved) {
				THREE_NS = resolved;
				// Ensure window.THREE points at the real namespace for any other code paths
				window.THREE = resolved;
				console.log('[BMOPM] Three.js detected, version:', resolved.REVISION || 'unknown');
				callback();
			} else if (detected) {
				// We saw something THREE-like but it's not the namespace we need (yet)
				if (!warnedShape) {
					warnedShape = true;
					try {
						const keys = Object.keys(detected).slice(0, 30);
						console.warn('[BMOPM] Three.js global found but not a usable namespace yet. Keys:', keys);
						if (Array.isArray(detected)) {
							console.warn('[BMOPM] __THREE__ is an array; element types:', detected.map(v => typeof v));
						}
					} catch (_) {}
				}
				if (attempts < maxAttempts) {
					attempts++;
					setTimeout(check, 100);
				} else {
					console.warn('[BMOPM] Three.js not available after waiting', maxAttempts * 100 / 1000, 'seconds');
					tryFallbackOnce();
				}
			} else if (attempts < maxAttempts) {
				attempts++;
				setTimeout(check, 100);
			} else {
				console.warn('[BMOPM] Three.js not available after waiting', maxAttempts * 100 / 1000, 'seconds');
				tryFallbackOnce();
			}
		}
		
		check();
	}
	
	// Simple Minecraft player model geometry
	function createPlayerModel() {
		const group = new THREE_NS.Group();
		
		// Head (8x8x8)
		const headGeometry = new THREE_NS.BoxGeometry(0.4, 0.4, 0.4);
		const head = new THREE_NS.Mesh(headGeometry);
		head.position.set(0, 1.2, 0);
		group.add(head);
		
		// Body (8x12x4)
		const bodyGeometry = new THREE_NS.BoxGeometry(0.4, 0.6, 0.2);
		const body = new THREE_NS.Mesh(bodyGeometry);
		body.position.set(0, 0.6, 0);
		group.add(body);
		
		// Arms (4x12x4)
		const armGeometry = new THREE_NS.BoxGeometry(0.2, 0.6, 0.2);
		
		// Left arm
		const leftArm = new THREE_NS.Mesh(armGeometry);
		leftArm.position.set(-0.3, 0.6, 0);
		group.add(leftArm);
		
		// Right arm
		const rightArm = new THREE_NS.Mesh(armGeometry);
		rightArm.position.set(0.3, 0.6, 0);
		group.add(rightArm);
		
		// Legs (4x12x4)
		const legGeometry = new THREE_NS.BoxGeometry(0.2, 0.6, 0.2);
		
		// Left leg
		const leftLeg = new THREE_NS.Mesh(legGeometry);
		leftLeg.position.set(-0.1, -0.3, 0);
		group.add(leftLeg);
		
		// Right leg
		const rightLeg = new THREE_NS.Mesh(legGeometry);
		rightLeg.position.set(0.1, -0.3, 0);
		group.add(rightLeg);
		
		return { group, leftArm, rightArm, leftLeg, rightLeg };
	}

	// Load player skin texture
	function loadPlayerSkin(uuid, callback) {
		if (skinCache.has(uuid)) {
			callback(skinCache.get(uuid));
			return;
		}

		const textureLoader = new THREE_NS.TextureLoader();
		const skinUrl = `https://crafatar.com/skins/${uuid}`;
		
		textureLoader.load(
			skinUrl,
			function(texture) {
				texture.magFilter = THREE_NS.NearestFilter;
				texture.minFilter = THREE_NS.NearestFilter;
				skinCache.set(uuid, texture);
				callback(texture);
			},
			undefined,
			function(error) {
				console.warn(`[BMOPM] Failed to load skin for ${uuid}:`, error);
				// Use default texture
				const defaultTexture = new THREE_NS.TextureLoader().load('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
				skinCache.set(uuid, defaultTexture);
				callback(defaultTexture);
			}
		);
	}

	// Create 3D model scene for a marker
	function createModelScene(container, playerUuid, yaw, pitch, animate) {
		if (!THREE_NS) {
			throw new Error('THREE namespace not resolved');
		}
		const width = 64;
		const height = 64;
		
		// Create canvas
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		canvas.style.width = width + 'px';
		canvas.style.height = height + 'px';
		canvas.style.imageRendering = 'pixelated';
		container.appendChild(canvas);
		
		// Create scene
		const scene = new THREE_NS.Scene();
		const camera = new THREE_NS.PerspectiveCamera(45, width / height, 0.1, 10);
		camera.position.set(0, 1, 2.5);
		camera.lookAt(0, 1, 0);
		
		// Create player model
		const modelData = createPlayerModel();
		const model = modelData.group;
		
		// Set rotation
		if (yaw !== undefined) {
			model.rotation.y = (yaw * Math.PI) / 180;
		}
		
		// Load skin and apply
		loadPlayerSkin(playerUuid, function(texture) {
			model.traverse(function(child) {
				if (child instanceof THREE_NS.Mesh) {
					const material = new THREE_NS.MeshBasicMaterial({ map: texture });
					child.material = material;
				}
			});
		});
		
		scene.add(model);
		
		// Lighting
		const ambientLight = new THREE_NS.AmbientLight(0xffffff, 0.8);
		scene.add(ambientLight);
		const directionalLight = new THREE_NS.DirectionalLight(0xffffff, 0.5);
		directionalLight.position.set(1, 1, 1);
		scene.add(directionalLight);
		
		// Renderer
		const renderer = new THREE_NS.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
		renderer.setSize(width, height);
		renderer.setPixelRatio(1);
		
		// Animation
		let animationFrame = 0;
		function animateModel() {
			if (animate) {
				// Simple running animation
				const time = Date.now() * 0.005;
				if (modelData.leftArm) modelData.leftArm.rotation.x = Math.sin(time) * 0.5;
				if (modelData.rightArm) modelData.rightArm.rotation.x = -Math.sin(time) * 0.5;
				if (modelData.leftLeg) modelData.leftLeg.rotation.x = -Math.sin(time) * 0.5;
				if (modelData.rightLeg) modelData.rightLeg.rotation.x = Math.sin(time) * 0.5;
			}
			
			renderer.render(scene, camera);
			animationFrame = requestAnimationFrame(animateModel);
		}
		
		animateModel();
		
		// Cleanup on removal
		container.addEventListener('remove', function() {
			cancelAnimationFrame(animationFrame);
			renderer.dispose();
		});
	}

	// Initialize 3D models for all markers
	function initializeModels() {
		// If Three.js isn't ready yet, just wait for waitForThreeJS() to call us again
		if (!THREE_NS) return;

		console.log('[BMOPM] initializeModels called, modelsEnabled:', window.bmopmModelsEnabled);
		// Check if 3D models are enabled via toggle
		const modelsEnabled = window.bmopmModelsEnabled !== false; // Default to true if not set
		if (!modelsEnabled) {
			console.log('[BMOPM] Models disabled, skipping initialization');
			return; // Don't initialize if toggle is off
		}
		
		const modelContainers = document.querySelectorAll('.bmopm-3d-model');
		modelContainers.forEach(function(container) {
			// Only initialize visible models
			const marker = container.closest('.bmopm-offline-player');
			if (marker && !marker.classList.contains('bmopm-3d-mode')) {
				return; // Skip if marker is not in 3D mode
			}
			
			if (container.dataset.initialized === 'true' || container.dataset.initFailed === 'true') return;
			
			const playerUuid = container.dataset.playerUuid;
			if (!playerUuid) return;
			const yaw = parseFloat(container.dataset.yaw) || 0;
			const pitch = parseFloat(container.dataset.pitch) || 0;
			const animate = container.dataset.animate === 'true';
			
			try {
				createModelScene(container, playerUuid, yaw, pitch, animate);
				container.dataset.initialized = 'true';
			} catch (e) {
				container.dataset.initFailed = 'true';
				console.warn('[BMOPM] Failed to initialize 3D model for', playerUuid, e);
			}
		});
	}

	// Expose initializeModels globally so script.js can call it even before Three.js is ready
	window.initializeModels = initializeModels;

	// Wait for Three.js before initializing
	waitForThreeJS(function() {
		console.log('[BMOPM] Three.js loaded, initializing 3D player models');
		
		// Only initialize if models are enabled
		if (window.bmopmModelsEnabled !== false) {
			// Initialize when DOM is ready
			if (document.readyState === 'loading') {
				document.addEventListener('DOMContentLoaded', initializeModels);
			} else {
				setTimeout(initializeModels, 100);
			}
		} else {
			console.log('[BMOPM] 3D models disabled, waiting for toggle');
		}

	// Re-initialize when markers are added/updated
	const observer = new MutationObserver(function(mutations) {
		// Check if 3D models are enabled
		const modelsEnabled = window.bmopmModelsEnabled !== false;
		if (!modelsEnabled) return;
		
		let shouldReinit = false;
		mutations.forEach(function(mutation) {
			if (mutation.addedNodes.length > 0) {
				mutation.addedNodes.forEach(function(node) {
					if (node.nodeType === 1 && (
						node.classList.contains('bmopm-3d-model') ||
						node.querySelector('.bmopm-3d-model')
					)) {
						shouldReinit = true;
					}
				});
			}
		});
		if (shouldReinit) {
			setTimeout(initializeModels, 100);
		}
	});

	observer.observe(document.body, {
		childList: true,
		subtree: true
	});

	// Also listen for BlueMap marker updates
	if (typeof bluemap !== 'undefined' && bluemap.events) {
		bluemap.events.addEventListener('markersUpdated', function() {
			const modelsEnabled = window.bmopmModelsEnabled !== false;
			if (modelsEnabled) {
				setTimeout(initializeModels, 100);
			}
		});
	}
	
		// Listen for toggle changes
		window.addEventListener('storage', function(e) {
			if (e.key === 'bmopm-3d-models-enabled') {
				const modelsEnabled = e.newValue === 'true';
				window.bmopmModelsEnabled = modelsEnabled;
				if (modelsEnabled) {
					setTimeout(initializeModels, 100);
				}
			}
		});
	});
})();

