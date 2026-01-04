package com.technicjelle.bluemapofflineplayermarkers.core.markerhandler;

import com.flowpowered.math.vector.Vector3d;
import com.technicjelle.BMUtils.BMSkin;
import com.technicjelle.bluemapofflineplayermarkers.common.Config;
import com.technicjelle.bluemapofflineplayermarkers.common.Server;
import com.technicjelle.bluemapofflineplayermarkers.core.Player;
import com.technicjelle.bluemapofflineplayermarkers.core.Singletons;
import de.bluecolored.bluemap.api.BlueMapAPI;
import de.bluecolored.bluemap.api.BlueMapMap;
import de.bluecolored.bluemap.api.BlueMapWorld;
import de.bluecolored.bluemap.api.markers.MarkerSet;
import de.bluecolored.bluemap.api.markers.POIMarker;

import java.util.Optional;
import java.util.UUID;

public class BlueMapMarkerHandler implements MarkerHandler {
	@Override
	public void add(Player player, BlueMapAPI api) {
		//If this player's visibility is disabled on the map, don't add the marker.
		if (!api.getWebApp().getPlayerVisibility(player.getPlayerUUID())) {
			Singletons.getLogger().info("Skipping marker for " + player.getPlayerName() + " - player visibility disabled on map");
			return;
		}

		Config config = Singletons.getConfig();
		//If this player's game mode is disabled on the map, don't add the marker.
		if (config.isGameModeHidden(player.getPlayerData().getGameMode())) {
			Singletons.getLogger().info("Skipping marker for " + player.getPlayerName() + " - game mode " + player.getPlayerData().getGameMode() + " is hidden");
			return;
		}

		Server server = Singletons.getServer();
		//If this player is banned and the config is set to hide banned players, don't add the marker.
		if (config.hideBannedPlayers() && server.isPlayerBanned(player.getPlayerUUID())) {
			Singletons.getLogger().info("Skipping marker for " + player.getPlayerName() + " - player is banned and hideBannedPlayers is enabled");
			return;
		}

		// Get BlueMapWorld for the position
		Optional<UUID> worldUUID = player.getPlayerData().getWorldUUID();
		if (worldUUID.isEmpty()) {
			Singletons.getLogger().warn("Skipping marker for " + player.getPlayerName() + " - no world UUID found");
			return;
		}
		
		// Try to get world by UUID first
		BlueMapWorld blueMapWorld = api.getWorld(worldUUID.get()).orElse(null);
		
		// If not found, try to find overworld by iterating through all maps (common fallback)
		if (blueMapWorld == null) {
			Singletons.getLogger().info("World not found by UUID " + worldUUID.get() + ", trying to find overworld...");
			for (BlueMapMap map : api.getMaps()) {
				BlueMapWorld world = map.getWorld();
				// Check if this map is for the overworld (common case)
				if (map.getId().contains("world") && !map.getId().contains("nether") && !map.getId().contains("end")) {
					blueMapWorld = world;
					Singletons.getLogger().info("Using overworld map as fallback: " + map.getId());
					break;
				}
			}
		}
		
		if (blueMapWorld == null) {
			Singletons.getLogger().warn("Skipping marker for " + player.getPlayerName() + " - BlueMap world not found for UUID: " + worldUUID.get());
			return;
		}
		Vector3d position = player.getPlayerData().getPosition();
		if (position == null) {
			Singletons.getLogger().warn("Skipping marker for " + player.getPlayerName() + " - no position data found");
			return;
		}
		Vector3d basePosition = position;
		
		// For 3D models, position at feet level; for icons, at head level
		if (config.showPlayerModels()) {
			// Position at feet level for 3D model
			position = basePosition;
		} else {
			// Add 1.8 to y to place the marker at the head-position of the player, like BlueMap does with its player-markers
			position = basePosition.add(0, 1.8, 0);
		}

		// Get rotation for 3D models (always include for frontend toggle)
		String rotationData = "";
		Optional<Vector3d> rotation = player.getPlayerData().getRotation();
		if (rotation.isPresent()) {
			Vector3d rot = rotation.get();
			rotationData = String.format(" data-yaw=\"%.2f\" data-pitch=\"%.2f\"", rot.getX(), rot.getY());
		}

		// Create marker-template
		// Always include both icon and 3D model container for frontend toggle
		String detailHtml = player.getPlayerName() + " <i>(offline)</i><br>"
				+ "<bmopm-datetime data-timestamp=" + player.getLastPlayed().toEpochMilli() + "></bmopm-datetime>";
		
		// Always add 3D model container (frontend will control visibility)
		detailHtml += "<div class=\"bmopm-3d-model\" data-player-uuid=\"" + player.getPlayerUUID() + "\"" 
				+ rotationData + " data-animate=\"" + config.animatePlayerModels() + "\"></div>";
		
		// Use base position (feet level) - frontend will handle positioning
		POIMarker.Builder markerBuilder = POIMarker.builder()
				.label(player.getPlayerName())
				.detail(detailHtml)
				.styleClasses("bmopm-offline-player", "bmopm-3d-enabled")
				.position(basePosition);

		// Create an icon and marker for each map of this world
		// We need to create a separate marker per map, because the map-storage that the icon is saved in
		// is different for each map
		int mapCount = 0;
		for (BlueMapMap map : blueMapWorld.getMaps()) {
			// Always set icon (frontend will control visibility)
			markerBuilder.icon(BMSkin.getPlayerHeadIconAddress(api, player.getPlayerUUID(), map), 0, 0); // centered with CSS instead

			// get marker-set (or create new marker set if none found)
			MarkerSet markerSet = map.getMarkerSets().computeIfAbsent(Config.MARKER_SET_ID, id -> MarkerSet.builder()
					.label(config.getMarkerSetName())
					.toggleable(config.isToggleable())
					.defaultHidden(config.isDefaultHidden())
					.build());

			// add marker
			markerSet.put(player.getPlayerUUID().toString(), markerBuilder.build());
			mapCount++;
		}

		Singletons.getLogger().info("Marker for " + player.getPlayerName() + " (" + player.getPlayerUUID() + ") added to " + mapCount + " map(s) at position " + position);
	}

	@Override
	public void remove(UUID playerUUID, BlueMapAPI api) {
		// remove all markers with the players uuid
		for (BlueMapMap map : api.getMaps()) {
			MarkerSet set = map.getMarkerSets().get(Config.MARKER_SET_ID);
			if (set != null) set.remove(playerUUID.toString());
		}

		Singletons.getLogger().info("Marker for " + Singletons.getServer().getPlayerName(playerUUID) + " removed");
	}
}
