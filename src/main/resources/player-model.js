// 3D Player Model Renderer for BlueMap Offline Player Markers
// Uses Three.js (already available in BlueMap) to render player models

(function() {
	'use strict';

	// Player model geometry cache
	const modelCache = new Map();
	const skinCache = new Map();
	
	// Check if Three.js is available
	if (typeof THREE === 'undefined') {
		console.warn('[BMOPM] Three.js not available, 3D player models disabled');
		return;
	}

	// Simple Minecraft player model geometry
	function createPlayerModel() {
		const group = new THREE.Group();
		
		// Head (8x8x8)
		const headGeometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
		const head = new THREE.Mesh(headGeometry);
		head.position.set(0, 1.2, 0);
		group.add(head);
		
		// Body (8x12x4)
		const bodyGeometry = new THREE.BoxGeometry(0.4, 0.6, 0.2);
		const body = new THREE.Mesh(bodyGeometry);
		body.position.set(0, 0.6, 0);
		group.add(body);
		
		// Arms (4x12x4)
		const armGeometry = new THREE.BoxGeometry(0.2, 0.6, 0.2);
		
		// Left arm
		const leftArm = new THREE.Mesh(armGeometry);
		leftArm.position.set(-0.3, 0.6, 0);
		group.add(leftArm);
		
		// Right arm
		const rightArm = new THREE.Mesh(armGeometry);
		rightArm.position.set(0.3, 0.6, 0);
		group.add(rightArm);
		
		// Legs (4x12x4)
		const legGeometry = new THREE.BoxGeometry(0.2, 0.6, 0.2);
		
		// Left leg
		const leftLeg = new THREE.Mesh(legGeometry);
		leftLeg.position.set(-0.1, -0.3, 0);
		group.add(leftLeg);
		
		// Right leg
		const rightLeg = new THREE.Mesh(legGeometry);
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

		const textureLoader = new THREE.TextureLoader();
		const skinUrl = `https://crafatar.com/skins/${uuid}`;
		
		textureLoader.load(
			skinUrl,
			function(texture) {
				texture.magFilter = THREE.NearestFilter;
				texture.minFilter = THREE.NearestFilter;
				skinCache.set(uuid, texture);
				callback(texture);
			},
			undefined,
			function(error) {
				console.warn(`[BMOPM] Failed to load skin for ${uuid}:`, error);
				// Use default texture
				const defaultTexture = new THREE.TextureLoader().load('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
				skinCache.set(uuid, defaultTexture);
				callback(defaultTexture);
			}
		);
	}

	// Create 3D model scene for a marker
	function createModelScene(container, playerUuid, yaw, pitch, animate) {
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
		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10);
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
				if (child instanceof THREE.Mesh) {
					const material = new THREE.MeshBasicMaterial({ map: texture });
					child.material = material;
				}
			});
		});
		
		scene.add(model);
		
		// Lighting
		const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
		scene.add(ambientLight);
		const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
		directionalLight.position.set(1, 1, 1);
		scene.add(directionalLight);
		
		// Renderer
		const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
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
		const modelContainers = document.querySelectorAll('.bmopm-3d-model');
		modelContainers.forEach(function(container) {
			if (container.dataset.initialized === 'true') return;
			
			const playerUuid = container.dataset.playerUuid;
			const yaw = parseFloat(container.dataset.yaw) || 0;
			const pitch = parseFloat(container.dataset.pitch) || 0;
			const animate = container.dataset.animate === 'true';
			
			createModelScene(container, playerUuid, yaw, pitch, animate);
			container.dataset.initialized = 'true';
		});
	}

	// Initialize when DOM is ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initializeModels);
	} else {
		initializeModels();
	}

	// Re-initialize when markers are added/updated
	const observer = new MutationObserver(function(mutations) {
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
		bluemap.events.addEventListener('markersUpdated', initializeModels);
	}
})();

