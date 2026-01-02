package com.technicjelle.bluemapofflineplayermarkers.core.fileloader;

import com.technicjelle.bluemapofflineplayermarkers.core.Player;
import com.technicjelle.bluemapofflineplayermarkers.core.Singletons;
import de.bluecolored.bluemap.api.BlueMapAPI;
import de.bluecolored.bluenbt.BlueNBT;
import de.bluecolored.bluenbt.NBTReader;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import java.util.zip.GZIPInputStream;

public class FileMarkerLoader {
	private static final BlueNBT nbt = new BlueNBT();

	public static void loadOfflineMarkers() {
		Singletons.getLogger().info("=== Starting offline marker loading process ===");
		Path playerDataFolder = Singletons.getServer().getPlayerDataFolder();
		Singletons.getLogger().info("Player data folder: " + playerDataFolder);

		//Return if playerdata is missing for some reason.
		if (!Files.exists(playerDataFolder) || !Files.isDirectory(playerDataFolder)) {
			Singletons.getLogger().error("Playerdata folder not found at: " + playerDataFolder + ", skipping loading of offline markers from storage");
			return;
		}

		BlueMapAPI api;
		if (Singletons.isBlueMapAPIPresent()) {
			if (BlueMapAPI.getInstance().isPresent()) {
				api = BlueMapAPI.getInstance().get();
				Singletons.getLogger().info("BlueMapAPI instance obtained successfully");
			} else {
				Singletons.getLogger().warn("BlueMapAPI not available, skipping loading of offline markers from storage");
				return;
			}
		} else {
			Singletons.getLogger().info("BlueMapAPI not available, probably due to running in a test environment");
			api = null;
		}

		int markerCount = 0;
		int skippedCount = 0;
		try (Stream<Path> playerDataFiles = Files.list(playerDataFolder)) {
			List<Path> datFiles = playerDataFiles.filter(p -> p.toString().endsWith(".dat")).toList();
			Singletons.getLogger().info("Found " + datFiles.size() + " player data file(s) to process");
			
			for (Path p : datFiles) {
				if (loadOfflineMarker(p, api)) {
					markerCount++;
				} else {
					skippedCount++;
				}
			}
			
			Singletons.getLogger().info("=== Offline marker loading complete ===");
			Singletons.getLogger().info("Markers added: " + markerCount + ", Markers skipped: " + skippedCount);
		} catch (IOException e) {
			Singletons.getLogger().error("Failed to stream playerdata", e);
		}
	}

	private static boolean loadOfflineMarker(Path playerDataFile, BlueMapAPI api) {
		final String fileName = playerDataFile.getFileName().toString();
		Singletons.getLogger().info("Processing playerdata file: " + fileName);

		final String uuidString = fileName.replace(".dat", "");
		final UUID playerUUID;
		try {
			playerUUID = UUID.fromString(uuidString);
		} catch (IllegalArgumentException e) {
			Singletons.getLogger().warn("Invalid playerdata filename: " + fileName + ", skipping");
			return false;
		}

		if (playerDataFile.toFile().length() == 0) {
			Singletons.getLogger().warn("Playerdata file " + fileName + " is empty, skipping");
			return false;
		}

		if (Singletons.getServer().isPlayerOnline(playerUUID)) {
			Singletons.getLogger().info("Player " + playerUUID + " is online, skipping marker");
			return false; // don't add markers for online players
		}

		if (Singletons.getConfig().checkPlayerLastPlayed(playerUUID)) {
			String playerName = Singletons.getServer().getPlayerName(playerUUID);
			Instant lastPlayed = Singletons.getServer().getPlayerLastPlayed(playerUUID);
			Singletons.getLogger().info("Player " + playerName + " (" + playerUUID + ") was last online at " + lastPlayed.toString() + 
					", which is more than " + Singletons.getConfig().getExpireTimeInHours() + " hours ago, so not adding marker");
			return false;
		}

		try (GZIPInputStream in = new GZIPInputStream(Files.newInputStream(playerDataFile))) {
			NBTReader reader = new NBTReader(in);
			PlayerNBTData playerNBTData = nbt.read(reader, PlayerNBTData.class);

			Player player = new Player(playerUUID, playerNBTData);
			Singletons.getMarkerHandler().add(player, api);
			return true;
		} catch (IOException e) {
			Singletons.getLogger().error("Failed to read playerdata file " + fileName, e);
			return false;
		}
	}
}
