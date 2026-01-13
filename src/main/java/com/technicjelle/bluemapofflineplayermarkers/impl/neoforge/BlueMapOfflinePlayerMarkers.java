package com.technicjelle.bluemapofflineplayermarkers.impl.neoforge;

import com.technicjelle.BMUtils.BMCopy;
import com.technicjelle.UpdateChecker;
import com.technicjelle.bluemapofflineplayermarkers.core.BMApiStatus;
import com.technicjelle.bluemapofflineplayermarkers.core.Player;
import com.technicjelle.bluemapofflineplayermarkers.core.Singletons;
import com.technicjelle.bluemapofflineplayermarkers.core.fileloader.FileMarkerLoader;
import com.technicjelle.bluemapofflineplayermarkers.core.markerhandler.BlueMapMarkerHandler;
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
import java.nio.file.StandardCopyOption;
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
		LOGGER.info("BlueMap Offline Player Markers mod initializing...");
		// Register FML lifecycle events (like FMLCommonSetupEvent) on the mod event bus
		modContainer.getEventBus().register(new ModEventHandler());
		// Register game events (like ServerStartingEvent, PlayerEvent) on the NeoForge event bus
		NeoForge.EVENT_BUS.register(new NeoForgeEventHandler());
		LOGGER.info("Registered with mod and NeoForge event buses");
		
		// Register BlueMap API listeners
		BlueMapAPI.onEnable(api -> {
			LOGGER.info("BlueMap is enabled! Copying resources to BlueMap webapp and registering them...");
			try {
				// Delete old files first to ensure fresh copy
				Path webAppPath = api.getWebApp().getWebRoot();
				Path assetsDir = webAppPath.resolve("assets");
				Path rootDir = webAppPath;
				
				try {
					Files.deleteIfExists(assetsDir.resolve("bmopm.js"));
					Files.deleteIfExists(assetsDir.resolve("bmopm-player-model.js"));
					Files.deleteIfExists(assetsDir.resolve("bmopm.css"));
					Files.deleteIfExists(rootDir.resolve("bmopm.js"));
					Files.deleteIfExists(rootDir.resolve("bmopm-player-model.js"));
					Files.deleteIfExists(rootDir.resolve("bmopm.css"));
					LOGGER.info("Deleted old files");
				} catch (IOException e) {
					LOGGER.warn("Failed to delete old files: " + e.getMessage());
				}
				
				// Use versioned filenames to force cache refresh
				String version = "v5.4";
				String scriptName = "bmopm-" + version + ".js";
				String playerModelName = "bmopm-player-model-" + version + ".js";
				String styleName = "bmopm-" + version + ".css";
				
				BMCopy.jarResourceToWebApp(api, getClass().getClassLoader(), "style.css", styleName, false);
				LOGGER.info("Copied style.css to BlueMap webapp as " + styleName);
				BMCopy.jarResourceToWebApp(api, getClass().getClassLoader(), "script.js", scriptName, false);
				LOGGER.info("Copied script.js to BlueMap webapp as " + scriptName);
				BMCopy.jarResourceToWebApp(api, getClass().getClassLoader(), "player-model.js", playerModelName, false);
				LOGGER.info("Copied player-model.js to BlueMap webapp as " + playerModelName);
				
				// Copy files to root directory as well (registerScript might expect them there)
				try {
					Files.copy(assetsDir.resolve(scriptName), rootDir.resolve(scriptName), StandardCopyOption.REPLACE_EXISTING);
					Files.copy(assetsDir.resolve(playerModelName), rootDir.resolve(playerModelName), StandardCopyOption.REPLACE_EXISTING);
					Files.copy(assetsDir.resolve(styleName), rootDir.resolve(styleName), StandardCopyOption.REPLACE_EXISTING);
					LOGGER.info("Copied files to webapp root directory");
				} catch (IOException e) {
					LOGGER.warn("Failed to copy files to root directory: " + e.getMessage());
				}
				
				// Register scripts with versioned names
				api.getWebApp().registerScript(scriptName);
				LOGGER.info("Registered " + scriptName + " script");
				api.getWebApp().registerScript(playerModelName);
				LOGGER.info("Registered " + playerModelName + " script");
				api.getWebApp().registerStyle(styleName);
				LOGGER.info("Registered " + styleName + " style");
				
				LOGGER.info("All resources successfully copied and registered to BlueMap webapp");
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
			config = new NeoForgeConfig();
			LOGGER.info("Config initialized");
			updateChecker = new UpdateChecker("TechnicJelle", "BlueMapOfflinePlayerMarkers", "3.0");
			updateChecker.checkAsync();
			LOGGER.info("Update checker started");
		}
	}

	// Inner class for NeoForge event bus events (game events)
	private class NeoForgeEventHandler {
		@SubscribeEvent
		public void onServerStarting(ServerStartingEvent event) {
			LOGGER.info("Server starting event received - initializing mod...");
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
			Singletons.getServer().shutDown();
			LOGGER.info("BlueMap Offline Player Markers mod disabled!");
			Singletons.cleanup();
		}

		@SubscribeEvent(priority = EventPriority.LOWEST)
		public void onPlayerLoggedIn(PlayerEvent.PlayerLoggedInEvent event) {
			if (event.getEntity() instanceof ServerPlayer player) {
				UUID playerUUID = player.getUUID();

				// Run asynchronously to avoid blocking the server
				Thread markerRemovalThread = new Thread(() -> {
					Optional<BlueMapAPI> api = BlueMapAPI.getInstance();
					if (api.isEmpty()) {
						Singletons.getLogger().warn("BlueMap is not loaded, not removing marker for " + player.getGameProfile().getName());
						return;
					}

					Singletons.getMarkerHandler().remove(playerUUID, api.get());
				});
				markerRemovalThread.setDaemon(true);
				markerRemovalThread.start();
			}
		}

		@SubscribeEvent(priority = EventPriority.LOWEST)
		public void onPlayerLoggedOut(PlayerEvent.PlayerLoggedOutEvent event) {
			if (event.getEntity() instanceof ServerPlayer player) {
				UUID playerUUID = player.getUUID();

				// Run asynchronously to avoid blocking the server
				Thread markerAdditionThread = new Thread(() -> {
					PlayerNeoForgeData playerNeoForgeData = new PlayerNeoForgeData(player);
					Player playerToAdd = new Player(playerUUID, playerNeoForgeData);

					Optional<BlueMapAPI> api = BlueMapAPI.getInstance();
					if (api.isEmpty()) {
						Singletons.getLogger().warn("BlueMap is not loaded, not adding marker for " + player.getGameProfile().getName());
						return;
					}

					Singletons.getMarkerHandler().add(playerToAdd, api.get());
				});
				markerAdditionThread.setDaemon(true);
				markerAdditionThread.start();
			}
		}
	}

	final Consumer<BlueMapAPI> onEnableListener = api -> {
		LOGGER.info("========================================");
		LOGGER.info("API Ready! BlueMap Offline Player Markers mod enabled!");
		LOGGER.info("========================================");
		// Note: UpdateChecker.logUpdateMessage() expects java.util.logging.Logger
		// Since we're using Log4j, we skip the update message logging for now

		LOGGER.info("Loading configuration...");
		config.load();
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

	final Consumer<BlueMapAPI> onDisableListener = api -> {
		Singletons.getLogger().info("API disabled! BlueMap Offline Player Markers shutting down...");
	};
}

