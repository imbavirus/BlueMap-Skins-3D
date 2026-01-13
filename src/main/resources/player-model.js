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

	// Create a default Steve skin texture (64x64) matching Minecraft format
	// Note: BoxGeometry uses default UVs, so the texture will be stretched across each face
	// This creates a simple visible texture that works with default UV mapping
	function createDefaultSteveSkin() {
		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const ctx = canvas.getContext('2d');
		
		// Steve skin colors (more accurate)
		const skinColor = '#DBB077'; // Light brown skin
		const shirtColor = '#3E6B00'; // Dark green shirt
		const pantsColor = '#2C4A00'; // Darker green pants
		const hairColor = '#2D1810'; // Dark brown hair
		const eyeColor = '#000000'; // Black eyes
		
		// Fill entire canvas with skin color as base (will be visible on all faces)
		ctx.fillStyle = skinColor;
		ctx.fillRect(0, 0, 64, 64);
		
		// Add a simple pattern that will be visible regardless of UV mapping
		// Create a checkerboard-like pattern for visibility
		ctx.fillStyle = shirtColor;
		for (let y = 0; y < 64; y += 8) {
			for (let x = 0; x < 64; x += 8) {
				if ((x + y) % 16 === 0) {
					ctx.fillRect(x, y, 8, 8);
				}
			}
		}
		
		// Add some detail in the center (head area)
		ctx.fillStyle = hairColor;
		ctx.fillRect(24, 8, 16, 8); // Hair band
		ctx.fillStyle = eyeColor;
		ctx.fillRect(20, 16, 4, 4); // Left eye
		ctx.fillRect(40, 16, 4, 4); // Right eye
		
		// Body area
		ctx.fillStyle = shirtColor;
		ctx.fillRect(16, 32, 32, 16);
		
		// Legs area
		ctx.fillStyle = pantsColor;
		ctx.fillRect(16, 48, 16, 16);
		ctx.fillRect(32, 48, 16, 16);
		
		// HEAD (top section: 8x8x8)
		// Front face (8x8 at 8,0)
		ctx.fillStyle = skinColor;
		ctx.fillRect(8, 0, 8, 8);
		// Hair overlay on front
		ctx.fillStyle = hairColor;
		ctx.fillRect(8, 0, 8, 1); // Top hair
		ctx.fillRect(8, 0, 1, 8); // Left hair
		ctx.fillRect(15, 0, 1, 8); // Right hair
		// Eyes
		ctx.fillStyle = eyeColor;
		ctx.fillRect(10, 2, 2, 2); // Left eye
		ctx.fillRect(12, 2, 2, 2); // Right eye
		
		// Right face (8x8 at 0,8)
		ctx.fillStyle = skinColor;
		ctx.fillRect(0, 8, 8, 8);
		ctx.fillStyle = hairColor;
		ctx.fillRect(0, 8, 1, 8); // Hair on right side
		
		// Left face (8x8 at 16,8)
		ctx.fillStyle = skinColor;
		ctx.fillRect(16, 8, 8, 8);
		ctx.fillStyle = hairColor;
		ctx.fillRect(23, 8, 1, 8); // Hair on left side
		
		// Back face (8x8 at 24,8)
		ctx.fillStyle = skinColor;
		ctx.fillRect(24, 8, 8, 8);
		ctx.fillStyle = hairColor;
		ctx.fillRect(24, 8, 8, 8); // Hair covers back
		
		// Top face (8x8 at 8,8)
		ctx.fillStyle = hairColor;
		ctx.fillRect(8, 8, 8, 8);
		
		// BODY/TORSO (middle section: 8x12x4)
		// Front (8x12 at 20,16)
		ctx.fillStyle = shirtColor;
		ctx.fillRect(20, 16, 8, 12);
		ctx.fillStyle = skinColor;
		ctx.fillRect(20, 20, 8, 4); // Skin showing at bottom
		
		// Right side (4x12 at 16,20)
		ctx.fillStyle = shirtColor;
		ctx.fillRect(16, 20, 4, 12);
		
		// Left side (4x12 at 28,20)
		ctx.fillStyle = shirtColor;
		ctx.fillRect(28, 20, 4, 12);
		
		// Back (8x12 at 32,20)
		ctx.fillStyle = shirtColor;
		ctx.fillRect(32, 20, 8, 12);
		
		// RIGHT ARM (4x12x4)
		// Front (4x12 at 44,16)
		ctx.fillStyle = skinColor;
		ctx.fillRect(44, 16, 4, 12);
		
		// Left side (4x12 at 40,20)
		ctx.fillStyle = skinColor;
		ctx.fillRect(40, 20, 4, 12);
		
		// Right side (4x12 at 48,20)
		ctx.fillStyle = skinColor;
		ctx.fillRect(48, 20, 4, 12);
		
		// Back (4x12 at 52,20)
		ctx.fillStyle = skinColor;
		ctx.fillRect(52, 20, 4, 12);
		
		// LEFT ARM (4x12x4)
		// Front (4x12 at 36,48)
		ctx.fillStyle = skinColor;
		ctx.fillRect(36, 48, 4, 12);
		
		// Right side (4x12 at 32,52)
		ctx.fillStyle = skinColor;
		ctx.fillRect(32, 52, 4, 12);
		
		// Left side (4x12 at 40,52)
		ctx.fillStyle = skinColor;
		ctx.fillRect(40, 52, 4, 12);
		
		// Back (4x12 at 44,52)
		ctx.fillStyle = skinColor;
		ctx.fillRect(44, 52, 4, 12);
		
		// RIGHT LEG (4x12x4)
		// Front (4x12 at 4,16)
		ctx.fillStyle = pantsColor;
		ctx.fillRect(4, 16, 4, 12);
		
		// Right side (4x12 at 0,20)
		ctx.fillStyle = pantsColor;
		ctx.fillRect(0, 20, 4, 12);
		
		// Left side (4x12 at 8,20)
		ctx.fillStyle = pantsColor;
		ctx.fillRect(8, 20, 4, 12);
		
		// Back (4x12 at 12,20)
		ctx.fillStyle = pantsColor;
		ctx.fillRect(12, 20, 4, 12);
		
		// LEFT LEG (4x12x4)
		// Front (4x12 at 20,48)
		ctx.fillStyle = pantsColor;
		ctx.fillRect(20, 48, 4, 12);
		
		// Right side (4x12 at 16,52)
		ctx.fillStyle = pantsColor;
		ctx.fillRect(16, 52, 4, 12);
		
		// Left side (4x12 at 24,52)
		ctx.fillStyle = pantsColor;
		ctx.fillRect(24, 52, 4, 12);
		
		// Back (4x12 at 28,52)
		ctx.fillStyle = pantsColor;
		ctx.fillRect(28, 52, 4, 12);
		
		// Convert canvas to texture
		const texture = new THREE_NS.Texture(canvas);
		texture.magFilter = THREE_NS.NearestFilter;
		texture.minFilter = THREE_NS.NearestFilter;
		texture.needsUpdate = true;
		texture.flipY = false; // Minecraft textures are not flipped
		
		// Cache the default texture
		skinCache.set('__default__', texture);
		
		console.log('[BMOPM] Created default Steve skin texture, size:', canvas.width, 'x', canvas.height);
		
		return texture;
	}

	// Load player skin texture using Mojang's official API
	function loadPlayerSkin(uuid, callback) {
		if (skinCache.has(uuid)) {
			console.log('[BMOPM] Using cached skin for', uuid);
			callback(skinCache.get(uuid));
			return;
		}

		const textureLoader = new THREE_NS.TextureLoader();
		
		// Use Mojang's official skin API (has proper CORS headers)
		// UUID needs to be without dashes for Mojang API
		const uuidNoDashes = uuid.replace(/-/g, '');
		const profileUrl = `https://sessionserver.mojang.com/session/minecraft/profile/${uuidNoDashes}`;
		
		console.log('[BMOPM] Fetching skin URL from Mojang API for', uuid);
		fetch(profileUrl)
			.then(response => {
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}
				return response.json();
			})
			.then(profile => {
				// Extract texture URL from profile
				if (!profile.properties || !Array.isArray(profile.properties)) {
					throw new Error('No properties in profile');
				}
				
				const texturesProperty = profile.properties.find(p => p.name === 'textures');
				if (!texturesProperty) {
					throw new Error('No textures property');
				}
				
				const textures = JSON.parse(atob(texturesProperty.value));
				const skinUrl = textures.textures?.SKIN?.url;
				
				if (!skinUrl) {
					throw new Error('No skin URL in textures');
				}
				
				console.log('[BMOPM] Got skin URL from Mojang API:', skinUrl);
				
				// Load texture from Mojang's CDN (should have CORS headers)
				textureLoader.load(
					skinUrl,
					function(texture) {
						console.log('[BMOPM] Skin loaded successfully from Mojang CDN for', uuid);
						texture.magFilter = THREE_NS.NearestFilter;
						texture.minFilter = THREE_NS.NearestFilter;
						skinCache.set(uuid, texture);
						callback(texture);
					},
					undefined,
					function(error) {
						console.warn(`[BMOPM] Failed to load skin from Mojang CDN for ${uuid}:`, error);
						// Fallback: try Crafatar (might work in some browsers)
						const crafatarUrl = `https://crafatar.com/skins/${uuid}`;
						console.log('[BMOPM] Trying Crafatar fallback:', crafatarUrl);
						textureLoader.load(
							crafatarUrl,
							function(texture) {
								console.log('[BMOPM] Skin loaded successfully from Crafatar for', uuid);
								texture.magFilter = THREE_NS.NearestFilter;
								texture.minFilter = THREE_NS.NearestFilter;
								skinCache.set(uuid, texture);
								callback(texture);
							},
							undefined,
							function(error2) {
								console.warn(`[BMOPM] Failed to load skin for ${uuid} (all methods failed):`, error2);
								console.log('[BMOPM] Using default Steve skin texture for', uuid);
								// Use default Steve skin (64x64 pixelated texture)
								// This is a simple gray Steve skin as fallback
								const defaultSteveSkin = createDefaultSteveSkin();
								skinCache.set(uuid, defaultSteveSkin);
								callback(defaultSteveSkin);
							}
						);
					}
				);
			})
			.catch(error => {
				console.warn(`[BMOPM] Failed to fetch profile from Mojang API for ${uuid}:`, error);
				// Fallback: try Crafatar directly
				const crafatarUrl = `https://crafatar.com/skins/${uuid}`;
				console.log('[BMOPM] Trying Crafatar fallback:', crafatarUrl);
				textureLoader.load(
					crafatarUrl,
					function(texture) {
						console.log('[BMOPM] Skin loaded successfully from Crafatar for', uuid);
						texture.magFilter = THREE_NS.NearestFilter;
						texture.minFilter = THREE_NS.NearestFilter;
						skinCache.set(uuid, texture);
						callback(texture);
					},
					undefined,
					function(error2) {
						console.warn(`[BMOPM] Failed to load skin for ${uuid} (all methods failed):`, error2);
						console.log('[BMOPM] Using default Steve skin texture for', uuid);
						// Use default Steve skin
						const defaultSteveSkin = createDefaultSteveSkin();
						skinCache.set(uuid, defaultSteveSkin);
						callback(defaultSteveSkin);
					}
				);
			});
	}

	// Create 3D model scene for a marker
	function createModelScene(container, playerUuid, yaw, pitch, animate) {
		console.log('[BMOPM] createModelScene called for', playerUuid);
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
		canvas.style.display = 'block'; // Ensure canvas is visible
		canvas.style.position = 'relative'; // Ensure positioning works
		container.appendChild(canvas);
		console.log('[BMOPM] Canvas created and appended');
		
		// Debug: Check container and canvas visibility
		const containerStyles = window.getComputedStyle(container);
		const canvasStyles = window.getComputedStyle(canvas);
		console.log('[BMOPM] Container visibility:', {
			display: containerStyles.display,
			visibility: containerStyles.visibility,
			opacity: containerStyles.opacity,
			width: containerStyles.width,
			height: containerStyles.height,
			position: containerStyles.position,
			top: containerStyles.top,
			left: containerStyles.left,
			zIndex: containerStyles.zIndex
		});
		console.log('[BMOPM] Canvas visibility:', {
			display: canvasStyles.display,
			visibility: canvasStyles.visibility,
			opacity: canvasStyles.opacity,
			width: canvasStyles.width,
			height: canvasStyles.height,
			position: canvasStyles.position
		});
		console.log('[BMOPM] Container in DOM:', container.isConnected);
		console.log('[BMOPM] Canvas in DOM:', canvas.isConnected);
		console.log('[BMOPM] Container parent:', container.parentElement ? container.parentElement.tagName + '.' + container.parentElement.className : 'none');
		
		// Create scene
		const scene = new THREE_NS.Scene();
		const camera = new THREE_NS.PerspectiveCamera(45, width / height, 0.1, 10);
		camera.position.set(0, 1, 2.5);
		camera.lookAt(0, 1, 0);
		
		// Create player model
		const modelData = createPlayerModel();
		const model = modelData.group;
		console.log('[BMOPM] Player model created');
		
		// Set rotation
		if (yaw !== undefined) {
			model.rotation.y = (yaw * Math.PI) / 180;
		}
		
		// Load skin and apply
		console.log('[BMOPM] Loading skin for', playerUuid);
		loadPlayerSkin(playerUuid, function(texture) {
			console.log('[BMOPM] Skin loaded for', playerUuid, 'applying to model');
			console.log('[BMOPM] Texture details:', {
				width: texture.image ? texture.image.width : 'no image',
				height: texture.image ? texture.image.height : 'no image',
				needsUpdate: texture.needsUpdate,
				format: texture.format,
				isDefault: texture === skinCache.get('__default__')
			});
			
			// Apply texture/material to each body part
			// Note: BoxGeometry has default UVs that don't match Minecraft skin layout perfectly,
			// but the texture will still be visible
			let meshCount = 0;
			model.traverse(function(child) {
				if (child instanceof THREE_NS.Mesh) {
					meshCount++;
					// Create material with texture
					const material = new THREE_NS.MeshBasicMaterial({ 
						map: texture,
						side: THREE_NS.DoubleSide, // Show both sides
						transparent: false
					});
					
					// Ensure texture is ready
					if (texture.image && texture.image.complete) {
						texture.needsUpdate = true;
					}
					
					child.material = material;
					
					// Name meshes for easier debugging
					const pos = child.position;
					if (pos.y > 1.0) child.name = 'head';
					else if (pos.y > 0.3 && Math.abs(pos.x) < 0.2) child.name = 'body';
					else if (pos.x < -0.2) child.name = 'leftArm';
					else if (pos.x > 0.2) child.name = 'rightArm';
					else if (pos.x < 0) child.name = 'leftLeg';
					else child.name = 'rightLeg';
					
					console.log('[BMOPM] Applied texture to', child.name, 'mesh at', pos.x.toFixed(2), pos.y.toFixed(2), pos.z.toFixed(2));
				}
			});
			console.log('[BMOPM] Applied texture to', meshCount, 'mesh(es)');
			
			// Force render update
			renderer.render(scene, camera);
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
		console.log('[BMOPM] Renderer created and configured');
		
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
		
		console.log('[BMOPM] Starting animation loop for', playerUuid);
		
		// Do an initial render to check if WebGL is working
		renderer.render(scene, camera);
		
		// Check WebGL context and canvas state after first render
		setTimeout(() => {
			// Check WebGL context
			const gl = renderer.getContext();
			if (gl) {
				console.log('[BMOPM] WebGL context:', {
					version: gl.getParameter(gl.VERSION),
					vendor: gl.getParameter(gl.VENDOR),
					renderer: gl.getParameter(gl.RENDERER)
				});
			} else {
				console.warn('[BMOPM] No WebGL context available!');
			}
			
			// Check canvas dimensions and visibility
			console.log('[BMOPM] Canvas state:', {
				canvasWidth: canvas.width,
				canvasHeight: canvas.height,
				clientWidth: canvas.clientWidth,
				clientHeight: canvas.clientHeight,
				offsetWidth: canvas.offsetWidth,
				offsetHeight: canvas.offsetHeight,
				computedDisplay: window.getComputedStyle(canvas).display,
				computedVisibility: window.getComputedStyle(canvas).visibility,
				computedOpacity: window.getComputedStyle(canvas).opacity
			});
			
			// Force container to be visible if it's hidden
			const containerComputed = window.getComputedStyle(container);
			if (containerComputed.display === 'none') {
				console.warn('[BMOPM] Container is hidden! Forcing display: block');
				container.style.display = 'block';
			}
			if (canvas.style.display === 'none') {
				console.warn('[BMOPM] Canvas is hidden! Forcing display: block');
				canvas.style.display = 'block';
			}
		}, 100);
		
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
		console.log('[BMOPM] Found', modelContainers.length, 'model container(s)');
		
		modelContainers.forEach(function(container, index) {
			// Only initialize visible models
			const marker = container.closest('.bmopm-offline-player');
			const has3dMode = marker && marker.classList.contains('bmopm-3d-mode');
			console.log('[BMOPM] Container', index, '- marker:', !!marker, 'has 3d-mode:', has3dMode);
			
			// If models are enabled globally but marker doesn't have the class yet, 
			// it might be a timing issue - initialize anyway if the container is visible
			if (marker && !has3dMode && modelsEnabled) {
				console.log('[BMOPM] Container', index, '- marker missing 3d-mode class but models enabled globally, initializing anyway');
				// Add the class now to ensure consistency
				marker.classList.add('bmopm-3d-mode');
			} else if (marker && !has3dMode) {
				console.log('[BMOPM] Container', index, '- skipping (not in 3D mode)');
				return; // Skip if marker is not in 3D mode and models aren't enabled
			}
			
			// Check if canvas already exists
			const existingCanvas = container.querySelector('canvas');
			if (existingCanvas) {
				console.log('[BMOPM] Container', index, '- canvas already exists, skipping');
				container.dataset.initialized = 'true';
				return;
			}
			
			// Only skip if explicitly marked as failed (not just initialized, since container might have been recreated)
			if (container.dataset.initFailed === 'true') {
				console.log('[BMOPM] Container', index, '- previous initialization failed, skipping');
				return;
			}
			
			// If marked as initialized but no canvas exists, reset and try again
			if (container.dataset.initialized === 'true') {
				console.log('[BMOPM] Container', index, '- marked as initialized but no canvas found, resetting and retrying');
				container.dataset.initialized = 'false';
			}
			
			const playerUuid = container.dataset.playerUuid;
			if (!playerUuid) {
				console.warn('[BMOPM] Container', index, '- missing playerUuid');
				return;
			}
			
			const yaw = parseFloat(container.dataset.yaw) || 0;
			const pitch = parseFloat(container.dataset.pitch) || 0;
			const animate = container.dataset.animate === 'true';
			
			console.log('[BMOPM] Initializing 3D model for', playerUuid, 'yaw:', yaw, 'pitch:', pitch, 'animate:', animate);
			
			try {
				createModelScene(container, playerUuid, yaw, pitch, animate);
				container.dataset.initialized = 'true';
				console.log('[BMOPM] Successfully initialized 3D model for', playerUuid);
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

