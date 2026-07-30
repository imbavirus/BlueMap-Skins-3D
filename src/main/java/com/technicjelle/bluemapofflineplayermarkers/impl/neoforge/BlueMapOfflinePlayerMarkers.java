package com.technicjelle.bluemapofflineplayermarkers.impl.neoforge;

import com.technicjelle.BMUtils.BMCopy;
import com.technicjelle.UpdateChecker;
import com.technicjelle.bluemapofflineplayermarkers.core.BMApiStatus;
import com.technicjelle.bluemapofflineplayermarkers.core.Player;
import com.technicjelle.bluemapofflineplayermarkers.core.Singletons;
import com.technicjelle.bluemapofflineplayermarkers.core.SnapshotPlayerData;
import com.technicjelle.bluemapofflineplayermarkers.core.fileloader.FileMarkerLoader;
import com.technicjelle.bluemapofflineplayermarkers.core.markerhandler.BlueMapMarkerHandler;
import com.technicjelle.bluemapofflineplayermarkers.core.skinserver.SkinCache;
import com.technicjelle.bluemapofflineplayermarkers.core.skinserver.SkinServer;
import net.neoforged.fml.loading.FMLPaths;
import de.bluecolored.bluemap.api.BlueMapAPI;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.bus.api.EventPriority;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.event.lifecycle.FMLCommonSetupEvent;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.neoforged.neoforge.event.server.ServerStartingEvent;
import net.neoforged.neoforge.event.server.ServerStoppingEvent;
import net.neoforged.neoforge.server.ServerLifecycleHooks;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

@Mod(BlueMapOfflinePlayerMarkers.MOD_ID)
public class BlueMapOfflinePlayerMarkers {
	public static final String MOD_ID = "bluemapofflineplayermarkers";
	private static final Logger LOGGER = LogManager.getLogger();

	// Static initializer to log when class is loaded
	static {
		try {
			LOGGER.info("BlueMapOfflinePlayerMarkers class loaded!");
		} catch (Exception e) {
			System.err.println("[BMOPM] ERROR in static initializer: " + e.getMessage());
			e.printStackTrace();
		}
	}
	
	private NeoForgeConfig config;
	private UpdateChecker updateChecker;

	public BlueMapOfflinePlayerMarkers(ModContainer modContainer) {
		LOGGER.info("3D BlueMap Skins mod initializing...");
		// Register FML lifecycle events (like FMLCommonSetupEvent) on the mod event bus
		modContainer.getEventBus().register(new ModEventHandler());
		// Register game events (like ServerStartingEvent, PlayerEvent) on the NeoForge event bus
		NeoForge.EVENT_BUS.register(new NeoForgeEventHandler());
		LOGGER.info("Registered with mod and NeoForge event buses");
		
		// Register BlueMap API listeners
		BlueMapAPI.onEnable(api -> {
			LOGGER.info("BlueMap is enabled! Copying resources to BlueMap webapp and registering them...");
			
			// Initialize skin server to serve offline skins
			Path serverRoot = FMLPaths.GAMEDIR.get();
			SkinServer.initialize(api, serverRoot);
			
			try {
				String version = WEB_ASSET_VERSION;
				String scriptName = "bmopm-" + version + ".js";
				String playerModelName = "bmopm-player-model-" + version + ".js";
				String styleName = "bmopm-" + version + ".css";

				writeFrontendConfig(api);
				LOGGER.info("Wrote frontend config (showPlayerModels={})",
						config != null && config.showPlayerModels());

				BMCopy.jarResourceToWebApp(api, getClass().getClassLoader(), "style.css", styleName, true);
				BMCopy.jarResourceToWebApp(api, getClass().getClassLoader(), "script.js", scriptName, true);
				BMCopy.jarResourceToWebApp(api, getClass().getClassLoader(), "player-model.js", playerModelName, true);

				api.getWebApp().registerScript(scriptName);
				api.getWebApp().registerScript(playerModelName);
				api.getWebApp().registerStyle(styleName);

				LOGGER.info("All resources successfully copied and registered to BlueMap webapp ({})", version);
			} catch (IOException e) {
				LOGGER.error("Failed to copy resources to BlueMap webapp!", e);
			}
		});
		LOGGER.info("BlueMap API enable listener registered");
	}

	// Inner class for mod event bus events (FML lifecycle events)
	private class ModEventHandler {
		@SubscribeEvent
		public void onCommonSetup(FMLCommonSetupEvent event) {
			LOGGER.info("Common setup event received - initializing config and update checker...");
			ensureConfig();
			LOGGER.info("Config initialized");
			updateChecker = new UpdateChecker("TechnicJelle", "BlueMapOfflinePlayerMarkers", "3.0");
			updateChecker.checkAsync();
			// Bridge JUL-based UpdateChecker into Log4j after async check completes
			Thread updateLogThread = new Thread(() -> {
				try {
					Thread.sleep(8000);
					if (updateChecker.isUpdateAvailable()) {
						updateChecker.getUpdateMessage().ifPresent(msg ->
								LOGGER.info("[UpdateChecker] {}", msg));
						LOGGER.info("[UpdateChecker] Current={}, Latest={}, URL={}",
								updateChecker.getCurrentVersion(),
								updateChecker.getLatestVersion(),
								updateChecker.getUpdateUrl());
					} else {
						LOGGER.debug("[UpdateChecker] Up to date ({})", updateChecker.getCurrentVersion());
					}
				} catch (InterruptedException e) {
					Thread.currentThread().interrupt();
				} catch (Exception e) {
					LOGGER.debug("[UpdateChecker] {}", e.getMessage());
				}
			}, "BMOPM-UpdateChecker");
			updateLogThread.setDaemon(true);
			updateLogThread.start();
			LOGGER.info("Update checker started (async)");
		}
	}

	private void ensureConfig() {
		if (config == null) {
			config = new NeoForgeConfig();
		}
	}

	// Inner class for NeoForge event bus events (game events)
	private class NeoForgeEventHandler {
		@SubscribeEvent
		public void onServerStarting(ServerStartingEvent event) {
			LOGGER.info("Server starting event received - initializing mod...");
			// SP can re-enter worlds; ensure clean singleton state
			if (Singletons.getServer() != null) {
				try {
					Singletons.cleanup();
				} catch (Exception ignored) {
					// ignore
				}
			}
			ensureConfig();
			MinecraftServer server = event.getServer();
			LOGGER.info("Initializing singletons (server, logger, config, marker handler, API status)...");
			Singletons.init(
				new NeoForgeServer(server),
				LOGGER,
				config,
				new BlueMapMarkerHandler(),
				new com.technicjelle.bluemapofflineplayermarkers.core.BMApiStatus()
			);
			LOGGER.info("Singletons initialized successfully");
			Singletons.getServer().startUp();
			LOGGER.info("Server startup completed");
			
			// Initialize skin cache
			Path serverRoot = FMLPaths.GAMEDIR.get();
			SkinCache.initialize(serverRoot);
			LOGGER.info("Skin cache initialized");

			// Register BlueMap API enable/disable listeners
			LOGGER.info("Registering BlueMap API enable/disable listeners...");
			BlueMapAPI.onEnable(onEnableListener);
			BlueMapAPI.onDisable(onDisableListener);
			LOGGER.info("BlueMap API listeners registered");
			
			// Check if BlueMap is already enabled
			Optional<BlueMapAPI> api = BlueMapAPI.getInstance();
			if (api.isPresent()) {
				LOGGER.info("BlueMap API is already available, triggering enable listener...");
				onEnableListener.accept(api.get());
			} else {
				LOGGER.info("BlueMap API not yet available, will wait for it to enable...");
			}
		}

		@SubscribeEvent
		public void onServerStopping(ServerStoppingEvent event) {
			BlueMapAPI.unregisterListener(onEnableListener);
			BlueMapAPI.unregisterListener(onDisableListener);
			try {
				if (Singletons.getServer() != null) {
					Singletons.getServer().shutDown();
				}
			} catch (Exception e) {
				LOGGER.warn("Error during server shutdown of BMOPM: {}", e.getMessage());
			}
			LOGGER.info("3D BlueMap Skins mod disabled!");
			Singletons.cleanup();
		}

		@SubscribeEvent(priority = EventPriority.LOWEST)
		public void onPlayerLoggedIn(PlayerEvent.PlayerLoggedInEvent event) {
			if (event.getEntity() instanceof ServerPlayer player) {
				UUID playerUUID = player.getUUID();
				String playerName = player.getGameProfile().getName();

				// Run asynchronously to avoid blocking the server
				Thread markerRemovalThread = new Thread(() -> {
					try {
						Optional<BlueMapAPI> api = BlueMapAPI.getInstance();
						if (api.isEmpty()) {
							LOGGER.warn("BlueMap is not loaded, not removing marker for {}", playerName);
							return;
						}
						if (Singletons.getMarkerHandler() == null) {
							LOGGER.warn("Marker handler not ready, not removing marker for {}", playerName);
							return;
						}
						Singletons.getMarkerHandler().remove(playerUUID, api.get());
					} catch (Exception e) {
						LOGGER.warn("Failed to remove offline marker for {}: {}", playerName, e.getMessage());
					}
				}, "BMOPM-RemoveMarker");
				markerRemovalThread.setDaemon(true);
				markerRemovalThread.start();
				
				// Cache player's skin automatically when they join (name helps offline-mode UUIDs)
				SkinCache.cachePlayerSkin(playerUUID, playerName).thenRun(() -> {
					LOGGER.debug("Skin caching completed for player: {}", playerName);
				});
			}
		}

		@SubscribeEvent(priority = EventPriority.LOWEST)
		public void onPlayerLoggedOut(PlayerEvent.PlayerLoggedOutEvent event) {
			if (event.getEntity() instanceof ServerPlayer player) {
				UUID playerUUID = player.getUUID();
				String playerName = player.getGameProfile().getName();

				// Snapshot on the server thread — ServerPlayer is not safe after disconnect / off-thread
				SnapshotPlayerData snapshot = SnapshotPlayerData.from(new PlayerNeoForgeData(player));
				// Player() resolves name/lastPlayed via Singletons; capture now while still online-ish
				Player playerToAdd = new Player(playerUUID, snapshot);

				// Run asynchronously to avoid blocking the server
				Thread markerAdditionThread = new Thread(() -> {
					try {
						Optional<BlueMapAPI> api = BlueMapAPI.getInstance();
						if (api.isEmpty()) {
							LOGGER.warn("BlueMap is not loaded, not adding marker for {}", playerName);
							return;
						}
						if (Singletons.getMarkerHandler() == null) {
							LOGGER.warn("Marker handler not ready (server stopping?), not adding marker for {}", playerName);
							return;
						}
						Singletons.getMarkerHandler().add(playerToAdd, api.get());
					} catch (Exception e) {
						LOGGER.warn("Failed to add offline marker for {}: {}", playerName, e.getMessage());
					}
				}, "BMOPM-AddMarker");
				markerAdditionThread.setDaemon(true);
				markerAdditionThread.start();
			}
		}
	}

	final Consumer<BlueMapAPI> onEnableListener = api -> {
		LOGGER.info("========================================");
		LOGGER.info("API Ready! 3D BlueMap Skins mod enabled!");
		LOGGER.info("========================================");

		LOGGER.info("Loading configuration...");
		if (config != null) {
			config.load();
			// Refresh frontend config now that server config is loaded
			try {
				writeFrontendConfig(api);
			} catch (IOException e) {
				LOGGER.warn("Failed to refresh frontend config: {}", e.getMessage());
			}
		}
		LOGGER.info("Configuration loaded successfully");

		// Load offline markers asynchronously with a delay
		// to allow BlueMap SkinProviders time to load
		MinecraftServer server = ServerLifecycleHooks.getCurrentServer();
		if (server != null) {
			LOGGER.info("Scheduling offline marker loader (5 second delay to allow BlueMap to fully initialize)...");
			server.execute(() -> {
				// Schedule on a separate thread to avoid blocking
				Thread markerLoaderThread = new Thread(() -> {
					try {
						LOGGER.info("Waiting 5 seconds before loading offline markers...");
						Thread.sleep(5000); // 5 second delay
						LOGGER.info("Starting to load offline player markers...");
						FileMarkerLoader.loadOfflineMarkers();
						LOGGER.info("Finished loading offline player markers");
					} catch (InterruptedException e) {
						LOGGER.warn("Marker loader thread was interrupted");
						Thread.currentThread().interrupt();
					}
				});
				markerLoaderThread.setDaemon(true);
				markerLoaderThread.setName("BMOPM-MarkerLoader");
				markerLoaderThread.start();
				LOGGER.info("Marker loader thread started");
			});
		} else {
			LOGGER.warn("Minecraft server is null, cannot load offline markers");
		}
	};

	/** Shared version tag for web assets (must match filenames registered with BlueMap). */
	static final String WEB_ASSET_VERSION = "v9.3";

	private void writeFrontendConfig(BlueMapAPI api) throws IOException {
		boolean showModels = config != null && config.showPlayerModels();
		boolean animateModels = config == null || config.animatePlayerModels();
		Path assetsDir = api.getWebApp().getWebRoot().resolve("assets");
		Files.createDirectories(assetsDir);
		String configJson = "{\n"
				+ "  \"version\": \"" + WEB_ASSET_VERSION + "\",\n"
				+ "  \"showPlayerModels\": " + showModels + ",\n"
				+ "  \"animatePlayerModels\": " + animateModels + "\n"
				+ "}\n";
		Files.writeString(assetsDir.resolve("bmopm-config-" + WEB_ASSET_VERSION + ".json"), configJson);
		Files.writeString(assetsDir.resolve("bmopm-config.json"), configJson);
	}

	final Consumer<BlueMapAPI> onDisableListener = api -> {
		LOGGER.info("API disabled! 3D BlueMap Skins shutting down...");
	};
}

