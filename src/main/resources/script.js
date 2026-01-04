// IMMEDIATE check - must be first, before ANY code
(function() {
	'use strict';
	
	// Check if already loaded - if so, exit immediately
	if (window.bmopmScriptLoaded) {
		console.warn('[BMOPM] script.js already loaded, skipping duplicate load');
		return; // Exit immediately, don't execute anything
	}
	
	// Mark as loaded immediately
	window.bmopmScriptLoaded = true;
	console.log('[BMOPM] script.js loaded');
	
	let smallIcons = false;

	if (typeof bluemap !== 'undefined' && bluemap.events) {
		bluemap.events.addEventListener("bluemapCameraMoved", event => {
			let farAway = event.detail.controlsManager.distance > 1000;
			if (smallIcons !== farAway) {
				smallIcons = farAway;

				let elements = document.getElementsByClassName("bmopm-offline-player");
				for (let i = 0; i < elements.length; i++) {
					let el = elements.item(i);
					let icon = el.getElementsByClassName("bm-marker-poi-icon").item(0);
					if (icon) {
						if (farAway) {
							icon.classList.add("bmopm-small");
						} else {
							icon.classList.remove("bmopm-small");
						}
					}
				}
			}
		});
	}

// 3D Models Toggle
(function() {
	const STORAGE_KEY = 'bmopm-3d-models-enabled';
	
	// Get initial state from localStorage (default to false/icon mode)
	let modelsEnabled = localStorage.getItem(STORAGE_KEY) === 'true';
	
	// Create toggle button
	function createToggleButton() {
		const insertToggle = () => {
			// Check if toggle already exists
			if (document.getElementById('bmopm-3d-toggle')) {
				return;
			}
			
			// Strategy 1: Look for buttons in top-right area (where BlueMap typically places controls)
			let container = null;
			let dayNightToggle = null;
			
			// Find all buttons and check their position
			const allButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
			const topRightButtons = allButtons.filter(btn => {
				const rect = btn.getBoundingClientRect();
				const windowWidth = window.innerWidth;
				const windowHeight = window.innerHeight;
				// Buttons in top-right quadrant
				return rect.right > windowWidth * 0.7 && rect.top < windowHeight * 0.2;
			});
			
			if (topRightButtons.length > 0) {
				// Find the rightmost button (likely day/night toggle)
				dayNightToggle = topRightButtons.reduce((rightmost, btn) => {
					return btn.getBoundingClientRect().right > rightmost.getBoundingClientRect().right ? btn : rightmost;
				});
				container = dayNightToggle.parentElement;
				console.log('[BMOPM] Found button in top-right area, inserting next to it');
			} else {
				// Strategy 2: Look for containers with buttons in top-right
				const allContainers = Array.from(document.querySelectorAll('div, nav, header, section'));
				for (const elem of allContainers) {
					const rect = elem.getBoundingClientRect();
					const buttons = elem.querySelectorAll('button, [role="button"]');
					if (buttons.length > 0 && rect.right > window.innerWidth * 0.7 && rect.top < window.innerHeight * 0.3) {
						container = elem;
						console.log('[BMOPM] Found container in top-right with', buttons.length, 'buttons');
						break;
					}
				}
			}
			
			// Strategy 3: Look for flex containers with buttons
			if (!container) {
				const flexContainers = Array.from(document.querySelectorAll('div')).filter(el => {
					const style = window.getComputedStyle(el);
					return (style.display === 'flex' || style.display === 'grid') && 
					       el.querySelectorAll('button, [role="button"]').length > 0;
				});
				// Prefer containers in top area
				const topContainers = flexContainers.filter(el => {
					const rect = el.getBoundingClientRect();
					return rect.top < window.innerHeight * 0.3;
				});
				if (topContainers.length > 0) {
					container = topContainers[0];
					console.log('[BMOPM] Found flex container in top area');
				}
			}
			
			// Fallback: Create container next to existing buttons in top-right
			if (!container) {
				// Try to find any button in top-right and create container next to it
				const anyTopRightButton = allButtons.find(btn => {
					const rect = btn.getBoundingClientRect();
					return rect.right > window.innerWidth * 0.8 && rect.top < 50;
				});
				
				if (anyTopRightButton) {
					container = anyTopRightButton.parentElement;
					dayNightToggle = anyTopRightButton;
					console.log('[BMOPM] Found button in top-right, using its container');
				} else {
					// Last resort: create fixed container in top-right
					container = document.createElement('div');
					container.id = 'bmopm-toggle-container';
					container.className = 'bmopm-toggle-container';
					container.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 10000; display: flex; gap: 8px;';
					document.body.appendChild(container);
					console.log('[BMOPM] Created new container in top-right');
				}
			}
			
			const button = document.createElement('button');
			button.id = 'bmopm-3d-toggle';
			button.className = 'bmopm-3d-toggle-button';
			button.title = 'Toggle 3D Player Models';
			button.innerHTML = modelsEnabled ? '👤' : '🖼️'; // 👤 for 3D, 🖼️ for icon
			button.setAttribute('aria-label', 'Toggle 3D Player Models');
			
			// Ensure button is clickable
			button.style.cssText = 'cursor: pointer; pointer-events: auto; z-index: 10001; position: relative;';
			button.type = 'button'; // Prevent form submission
			
			button.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				console.log('[BMOPM] Toggle button clicked!');
				modelsEnabled = !modelsEnabled;
				localStorage.setItem(STORAGE_KEY, modelsEnabled ? 'true' : 'false');
				button.innerHTML = modelsEnabled ? '👤' : '🖼️';
				console.log('[BMOPM] Toggle clicked, modelsEnabled:', modelsEnabled);
				console.log('[BMOPM] Calling updateModelVisibility...');
				updateModelVisibility();
				console.log('[BMOPM] updateModelVisibility called');
			});
			
			// Insert after day/night toggle if found, otherwise append to container
			if (dayNightToggle && dayNightToggle.parentElement === container) {
				dayNightToggle.insertAdjacentElement('afterend', button);
			} else {
				container.appendChild(button);
			}
			
			console.log('[BMOPM] Toggle button created and inserted');
		};
		
		// Try to insert immediately
		insertToggle();
		
		// Also try after delays in case BlueMap loads UI later
		setTimeout(insertToggle, 500);
		setTimeout(insertToggle, 2000);
		
		// Listen for BlueMap ready event if available
		if (typeof bluemap !== 'undefined' && bluemap.events) {
			bluemap.events.addEventListener('ready', insertToggle);
		}
	}
	
	// Update visibility of 3D models vs icons
	let updatingVisibility = false; // Flag to prevent recursion
	function updateModelVisibility() {
		console.log('[BMOPM] updateModelVisibility called, modelsEnabled:', modelsEnabled);
		// Prevent infinite recursion
		if (updatingVisibility) {
			console.log('[BMOPM] Already updating, skipping');
			return;
		}
		updatingVisibility = true;
		
		try {
			const markers = document.getElementsByClassName('bmopm-offline-player');
			console.log('[BMOPM] Found', markers.length, 'markers');
			
			for (let i = 0; i < markers.length; i++) {
				const marker = markers[i];
				const icon = marker.querySelector('.bm-marker-poi-icon');
				const modelContainer = marker.querySelector('.bmopm-3d-model');
				console.log('[BMOPM] Marker', i, '- icon:', !!icon, 'modelContainer:', !!modelContainer);
				
				if (modelsEnabled) {
					// Show 3D models, hide icons
					if (icon) icon.style.display = 'none';
					if (modelContainer) {
						modelContainer.style.display = 'block';
						console.log('[BMOPM] Showing 3D model container');
					}
					// Adjust position for 3D models (feet level)
					marker.classList.add('bmopm-3d-mode');
				} else {
					// Show icons, hide 3D models
					if (icon) icon.style.display = 'block';
					if (modelContainer) modelContainer.style.display = 'none';
					// Adjust position for icons (head level)
					marker.classList.remove('bmopm-3d-mode');
				}
			}
		
			// Update global state only if it changed (avoid triggering setter)
			if (window.bmopmModelsEnabled !== modelsEnabled) {
				// Temporarily remove the setter to avoid recursion
				delete window.bmopmModelsEnabled;
				window.bmopmModelsEnabled = modelsEnabled;
				// Re-define the property
				Object.defineProperty(window, 'bmopmModelsEnabled', {
					get: () => modelsEnabled,
					set: (value) => {
						if (modelsEnabled !== value) {
							modelsEnabled = value;
							localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
							// Update button icon
							const button = document.getElementById('bmopm-3d-toggle');
							if (button) {
								button.innerHTML = modelsEnabled ? '👤' : '🖼️';
							}
							updateModelVisibility();
						}
					}
				});
			}
			
			// Trigger model initialization if enabled
			if (modelsEnabled) {
				console.log('[BMOPM] Models enabled, checking for initializeModels function...');
				// Try to initialize models - check if player-model.js has loaded
				if (typeof window.initializeModels === 'function') {
					console.log('[BMOPM] initializeModels found, calling it...');
					setTimeout(() => {
						window.initializeModels();
					}, 100);
				} else {
					console.log('[BMOPM] initializeModels not found yet, waiting...');
					// Wait for player-model.js to load and initialize
					const checkForInit = setInterval(() => {
						if (typeof window.initializeModels === 'function') {
							console.log('[BMOPM] initializeModels found, calling it...');
							clearInterval(checkForInit);
							setTimeout(() => {
								window.initializeModels();
							}, 100);
						}
					}, 200);
					// Stop checking after 10 seconds
					setTimeout(() => {
						clearInterval(checkForInit);
						if (typeof window.initializeModels !== 'function') {
							console.warn('[BMOPM] initializeModels still not available after 10 seconds');
						}
					}, 10000);
				}
			}
		} finally {
			updatingVisibility = false;
		}
	}
	
	// Initialize on page load
	function init() {
		console.log('[BMOPM] Initializing 3D models toggle...');
		createToggleButton();
		updateModelVisibility();
	}
	
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
	
	// Also try after a longer delay in case BlueMap loads very late
	setTimeout(init, 5000);
	
	// Update when markers are added/updated
	if (typeof bluemap !== 'undefined' && bluemap.events) {
		bluemap.events.addEventListener('markersUpdated', () => {
			console.log('[BMOPM] Markers updated event received');
			setTimeout(updateModelVisibility, 100);
		});
	}
	
	// Also use MutationObserver to detect when markers are added to DOM
	const markerObserver = new MutationObserver(function(mutations) {
		const markers = document.getElementsByClassName('bmopm-offline-player');
		if (markers.length > 0) {
			console.log('[BMOPM] Markers detected in DOM:', markers.length);
			// Only update if models are enabled
			if (modelsEnabled) {
				setTimeout(updateModelVisibility, 100);
			}
		}
	});
	
	// Start observing
	markerObserver.observe(document.body, {
		childList: true,
		subtree: true
	});
	
	// Also check periodically for markers (fallback)
	let markerCheckInterval = setInterval(() => {
		const markers = document.getElementsByClassName('bmopm-offline-player');
		if (markers.length > 0) {
			console.log('[BMOPM] Markers found via interval check:', markers.length);
			clearInterval(markerCheckInterval);
			if (modelsEnabled) {
				setTimeout(updateModelVisibility, 100);
			}
		}
	}, 1000);
	
	// Stop checking after 30 seconds
	setTimeout(() => {
		clearInterval(markerCheckInterval);
	}, 30000);
	
	// Expose toggle state globally for player-model.js (defined in updateModelVisibility to avoid recursion)
})();

class LocaleDateTime extends HTMLElement {
	constructor() {
		super();
		const timestamp = this.getAttribute("data-timestamp");
		const dateString = new Date(parseInt(timestamp, 10)).toLocaleString();
		this.innerText = dateString;
	}
}


customElements.define("bmopm-datetime", LocaleDateTime);

// Load 3D player model script if enabled
(function() {
	function loadPlayerModelScript() {
		if (document.querySelector('.bmopm-3d-enabled') && !document.querySelector('script[src*="bmopm-player-model"]')) {
			const script = document.createElement('script');
			// Try versioned paths - script will be loaded by BlueMap's registerScript, but we need to find the actual filename
			// Look for any script with bmopm-player-model in the name
			const existingScript = Array.from(document.querySelectorAll('script[src]')).find(s => s.src.includes('bmopm-player-model'));
			if (existingScript) {
				// Script already loaded by BlueMap
				return;
			}
			// Try both paths with version
			script.src = 'assets/bmopm-player-model-v3.6.js';
			script.onerror = function() {
				// Fallback to root path
				script.src = 'bmopm-player-model-v3.6.js';
				script.onerror = function() {
					// Last fallback to old name
					script.src = 'bmopm-player-model.js';
				};
			};
			document.head.appendChild(script);
		}
	}
	
	// Try immediately
	loadPlayerModelScript();
	
	// Also try after a delay in case markers load later
	setTimeout(loadPlayerModelScript, 1000);
	
	// Listen for marker updates
	if (typeof bluemap !== 'undefined' && bluemap.events) {
		bluemap.events.addEventListener('markersUpdated', loadPlayerModelScript);
	}
})();

})(); // End of main IIFE wrapper
