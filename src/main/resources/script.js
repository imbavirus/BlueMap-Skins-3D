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
	
	// Immediate debug function (available right away, no rebuild needed)
	// This will be replaced by the full debug function later, but helps with immediate debugging
	if (!window.bmopmDebug) {
		window.bmopmDebug = function() {
			console.log('[BMOPM] Quick Debug - checking for markers...');
			const markers = document.getElementsByClassName('bmopm-offline-player');
			console.log('[BMOPM] Markers with class "bmopm-offline-player":', markers.length);
			
			// Check all possible marker elements
			const allPossible = document.querySelectorAll('[class*="bmopm"], [class*="offline"], [data-player-uuid]');
			console.log('[BMOPM] All possible marker elements:', allPossible.length);
			
			// Check BlueMap structure
			if (typeof bluemap !== 'undefined') {
				console.log('[BMOPM] BlueMap API available');
				console.log('[BMOPM] BlueMap maps:', bluemap.maps ? bluemap.maps.length : 'unknown');
			}
			
			return {
				markersFound: markers.length,
				possibleMarkers: allPossible.length,
				bluemapAvailable: typeof bluemap !== 'undefined'
			};
		};
		console.log('[BMOPM] Quick debug function available: window.bmopmDebug()');
	}
	
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
			// Try multiple ways to find markers - BlueMap might render them with different structure
			let markers = document.getElementsByClassName('bmopm-offline-player');
			
			// If not found, try finding by data attributes or child elements
			if (markers.length === 0) {
				// Look for elements containing our 3D model containers
				const modelContainers = document.querySelectorAll('.bmopm-3d-model');
				if (modelContainers.length > 0) {
					// Find parent markers
					markers = Array.from(modelContainers).map(container => {
						return container.closest('.bm-marker-poi, [class*="marker"], [class*="poi"]');
					}).filter(m => m !== null);
					console.log('[BMOPM] Found', markers.length, 'markers via 3D model containers');
				}
			}
			
			// Also try finding by data-player-uuid attribute
			if (markers.length === 0) {
				const uuidElements = document.querySelectorAll('[data-player-uuid]');
				if (uuidElements.length > 0) {
					markers = Array.from(uuidElements).map(el => {
						return el.closest('.bm-marker-poi, [class*="marker"], [class*="poi"]');
					}).filter(m => m !== null);
					console.log('[BMOPM] Found', markers.length, 'markers via data-player-uuid');
				}
			}
			
			// Convert to array for easier handling
			markers = Array.from(markers);
			console.log('[BMOPM] Found', markers.length, 'markers total');
			
			// Enhanced debugging: check for markers in different ways
			if (markers.length === 0) {
				// Check if BlueMap markers are loaded at all
				const allMarkers = document.querySelectorAll('[class*="marker"], [class*="poi"], [class*="bmopm"]');
				console.log('[BMOPM] Debug: Found', allMarkers.length, 'elements with marker-related classes');
				
				// Check if BlueMap API has markers
				if (typeof bluemap !== 'undefined' && bluemap.markers) {
					console.log('[BMOPM] Debug: BlueMap markers API available');
					try {
						const markerSets = bluemap.markers.getMarkerSets ? bluemap.markers.getMarkerSets() : null;
						console.log('[BMOPM] Debug: Marker sets:', markerSets);
					} catch (e) {
						console.log('[BMOPM] Debug: Could not access marker sets:', e);
					}
				}
				
				// Check for any elements that might be our markers with different class names
				const possibleMarkers = document.querySelectorAll('[data-player-uuid], .bmopm-3d-model, [class*="offline"]');
				console.log('[BMOPM] Debug: Found', possibleMarkers.length, 'possible marker elements');
				
				// Check for POI markers that might contain our content
				const poiMarkers = document.querySelectorAll('.bm-marker-poi');
				console.log('[BMOPM] Debug: Found', poiMarkers.length, 'POI markers total');
				if (poiMarkers.length > 0) {
					// Check if any contain our classes or data attributes
					const ourMarkers = Array.from(poiMarkers).filter(poi => {
						return poi.classList.contains('bmopm-offline-player') ||
						       poi.querySelector('.bmopm-3d-model') ||
						       poi.querySelector('[data-player-uuid]');
					});
					console.log('[BMOPM] Debug: Found', ourMarkers.length, 'POI markers that might be ours');
				}
			}
			
			for (let i = 0; i < markers.length; i++) {
				const marker = markers[i];
				if (!marker) continue;
				
				// Ensure the marker has our class for future searches
				if (!marker.classList.contains('bmopm-offline-player')) {
					marker.classList.add('bmopm-offline-player');
				}
				
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
			setTimeout(() => {
				const markers = document.getElementsByClassName('bmopm-offline-player');
				console.log('[BMOPM] After markersUpdated event, found', markers.length, 'markers');
				updateModelVisibility();
			}, 500); // Give BlueMap time to render
		});
		
		// Also listen for map ready events
		bluemap.events.addEventListener('ready', () => {
			console.log('[BMOPM] BlueMap ready event received');
			setTimeout(() => {
				const markers = document.getElementsByClassName('bmopm-offline-player');
				console.log('[BMOPM] After ready event, found', markers.length, 'markers');
				updateModelVisibility();
			}, 1000);
		});
	}
	
	// Helper function to find markers using multiple strategies
	function findMarkers() {
		let markers = Array.from(document.getElementsByClassName('bmopm-offline-player'));
		
		// If not found, try finding by data attributes or child elements
		if (markers.length === 0) {
			const modelContainers = document.querySelectorAll('.bmopm-3d-model');
			if (modelContainers.length > 0) {
				markers = Array.from(modelContainers).map(container => {
					const parent = container.closest('.bm-marker-poi, [class*="marker"], [class*="poi"]');
					if (parent && !parent.classList.contains('bmopm-offline-player')) {
						parent.classList.add('bmopm-offline-player');
					}
					return parent;
				}).filter(m => m !== null);
			}
		}
		
		// Also try finding by data-player-uuid attribute
		if (markers.length === 0) {
			const uuidElements = document.querySelectorAll('[data-player-uuid]');
			if (uuidElements.length > 0) {
				markers = Array.from(uuidElements).map(el => {
					const parent = el.closest('.bm-marker-poi, [class*="marker"], [class*="poi"]');
					if (parent && !parent.classList.contains('bmopm-offline-player')) {
						parent.classList.add('bmopm-offline-player');
					}
					return parent;
				}).filter(m => m !== null);
			}
		}
		
		return markers;
	}
	
	// Also use MutationObserver to detect when markers are added to DOM
	const markerObserver = new MutationObserver(function(mutations) {
		const markers = findMarkers();
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
		const markers = findMarkers();
		if (markers.length > 0) {
			console.log('[BMOPM] Markers found via interval check:', markers.length);
			clearInterval(markerCheckInterval);
			if (modelsEnabled) {
				setTimeout(updateModelVisibility, 100);
			}
		} else {
			// Log periodically to help debug
			const checkCount = (markerCheckInterval._checkCount || 0) + 1;
			markerCheckInterval._checkCount = checkCount;
			if (checkCount % 5 === 0) { // Every 5 seconds
				console.log('[BMOPM] Still waiting for markers... (check', checkCount, ')');
			}
		}
	}, 1000);
	
	// Stop checking after 60 seconds (increased from 30)
	setTimeout(() => {
		clearInterval(markerCheckInterval);
		const finalMarkers = document.getElementsByClassName('bmopm-offline-player');
		if (finalMarkers.length === 0) {
			console.warn('[BMOPM] No markers found after 60 seconds. This might indicate:');
			console.warn('[BMOPM] 1. No offline player markers were created by the backend');
			console.warn('[BMOPM] 2. Markers are hidden or filtered out');
			console.warn('[BMOPM] 3. BlueMap hasn\'t rendered markers yet (try refreshing)');
			console.warn('[BMOPM] 4. Marker class name mismatch (check BlueMap version compatibility)');
		}
	}, 60000);
	
	// Expose toggle state globally for player-model.js (defined in updateModelVisibility to avoid recursion)
	
	// Expose debug function to browser console
	window.bmopmDebug = function() {
		console.log('=== BMOPM Debug Information ===');
		console.log('Models enabled:', modelsEnabled);
		console.log('Toggle button exists:', !!document.getElementById('bmopm-3d-toggle'));
		
		const markers = document.getElementsByClassName('bmopm-offline-player');
		console.log('Markers with class "bmopm-offline-player":', markers.length);
		
		if (markers.length === 0) {
			console.log('\n--- Searching for markers in different ways ---');
			
			// Check all marker-related elements
			const allMarkers = document.querySelectorAll('[class*="marker"], [class*="poi"], [class*="bmopm"]');
			console.log('Elements with marker/poi/bmopm in class:', allMarkers.length);
			if (allMarkers.length > 0) {
				console.log('Sample elements:', Array.from(allMarkers).slice(0, 5).map(el => ({
					tag: el.tagName,
					classes: el.className,
					id: el.id
				})));
			}
			
			// Check for 3D model containers
			const modelContainers = document.querySelectorAll('.bmopm-3d-model');
			console.log('3D model containers found:', modelContainers.length);
			
			// Check for player UUID data attributes
			const uuidElements = document.querySelectorAll('[data-player-uuid]');
			console.log('Elements with data-player-uuid:', uuidElements.length);
			
			// Check BlueMap API
			if (typeof bluemap !== 'undefined') {
				console.log('BlueMap API available:', true);
				console.log('BlueMap events available:', !!bluemap.events);
				console.log('BlueMap maps:', bluemap.maps ? bluemap.maps.length : 'unknown');
			} else {
				console.log('BlueMap API available: false');
			}
			
			// Check for any POI markers
			const poiMarkers = document.querySelectorAll('.bm-marker-poi, [class*="poi-marker"]');
			console.log('POI markers found:', poiMarkers.length);
			
			// Check marker sets via BlueMap API
			if (typeof bluemap !== 'undefined') {
				try {
					// Try different ways to access markers
					if (bluemap.markers) {
						console.log('BlueMap markers object:', bluemap.markers);
						if (typeof bluemap.markers.getMarkerSets === 'function') {
							const markerSets = bluemap.markers.getMarkerSets();
							console.log('Marker sets (via getMarkerSets):', markerSets);
						}
					}
					
					// Check if markers are in the API's internal state
					if (bluemap.maps) {
						console.log('BlueMap maps:', bluemap.maps);
						bluemap.maps.forEach((map, i) => {
							console.log(`Map ${i}:`, {
								id: map.id,
								name: map.name,
								markerSets: map.markerSets ? Object.keys(map.markerSets) : 'N/A'
							});
						});
					}
					
					// Check for marker update events
					if (bluemap.events) {
						console.log('BlueMap events available, listening for marker updates...');
						// This will help identify when markers are actually added
					}
				} catch (e) {
					console.log('Error accessing BlueMap API:', e.message, e);
				}
			}
		} else {
			console.log('\n--- Marker Details ---');
			Array.from(markers).forEach((marker, i) => {
				console.log(`Marker ${i + 1}:`, {
					classes: marker.className,
					id: marker.id,
					hasIcon: !!marker.querySelector('.bm-marker-poi-icon'),
					hasModel: !!marker.querySelector('.bmopm-3d-model'),
					playerUuid: marker.querySelector('.bmopm-3d-model')?.dataset?.playerUuid || 'N/A'
				});
			});
		}
		
		console.log('=== End Debug ===');
	};
	
	console.log('[BMOPM] Debug function available: call window.bmopmDebug() in console');
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
