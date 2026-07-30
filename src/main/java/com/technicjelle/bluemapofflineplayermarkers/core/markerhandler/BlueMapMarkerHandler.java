package com.technicjelle.bluemapofflineplayermarkers.core.markerhandler;

import com.flowpowered.math.vector.Vector3d;
import com.technicjelle.BMUtils.BMSkin;
import com.technicjelle.bluemapofflineplayermarkers.common.Config;
import com.technicjelle.bluemapofflineplayermarkers.common.Server;
import com.technicjelle.bluemapofflineplayermarkers.core.Player;
import com.technicjelle.bluemapofflineplayermarkers.core.Singletons;
import com.technicjelle.bluemapofflineplayermarkers.core.skinserver.SkinCache;
import com.technicjelle.bluemapofflineplayermarkers.core.skinserver.SkinServer;
import de.bluecolored.bluemap.api.BlueMapAPI;
import de.bluecolored.bluemap.api.BlueMapMap;
import de.bluecolored.bluemap.api.BlueMapWorld;
import de.bluecolored.bluemap.api.markers.MarkerSet;
import de.bluecolored.bluemap.api.markers.POIMarker;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

public class BlueMapMarkerHandler implements MarkerHandler {
	private static String safeLower(String s) {
		return s == null ? "" : s.toLowerCase();
	}

	private static int scoreMapForDimension(BlueMapMap map, String dimKeyLower) {
		String mapId = safeLower(map.getId());
		String worldId = safeLower(map.getWorld().getId());
		String path = dimKeyLower.contains(":") ? dimKeyLower.substring(dimKeyLower.indexOf(':') + 1) : dimKeyLower;

		int score = 0;

		// Exact matches
		if (worldId.equals(dimKeyLower) || mapId.equals(dimKeyLower)) score += 100;
		if (worldId.equals(path) || mapId.equals(path)) score += 90;

		// Vanilla-ish heuristics
		if (dimKeyLower.contains("overworld")) {
			if (mapId.equals("world") || worldId.equals("world")) score += 80;
			if (mapId.contains("world") && !mapId.contains("nether") && !mapId.contains("end")) score += 40;
			// Prefer shorter ids when multiple "world_*" exist
			score += Math.max(0, 30 - mapId.length());
		}
		if (dimKeyLower.contains("nether")) {
			if (mapId.contains("nether") || worldId.contains("nether")) score += 80;
		}
		if (dimKeyLower.contains("end")) {
			if (mapId.contains("end") || worldId.contains("end")) score += 80;
		}

		// Generic contains match
		if (!path.isEmpty() && (mapId.contains(path) || worldId.contains(path))) score += 60;

		return score;
	}

	private static BlueMapWorld findBestWorldFallback(BlueMapAPI api, Optional<String> dimensionKey) {
		String dimKeyLower = safeLower(dimensionKey.orElse(""));
		BlueMapMap bestMap = null;
		int bestScore = -1;
		for (BlueMapMap map : api.getMaps()) {
			int score = scoreMapForDimension(map, dimKeyLower);
			if (score > bestScore) {
				bestScore = score;
				bestMap = map;
			}
		}
		return bestMap != null && bestScore > 0 ? bestMap.getWorld() : null;
	}

	@Override
	public void add(Player player, BlueMapAPI api) {
		if (api == null) {
			return;
		}
		Config config = Singletons.getConfig();
		if (config == null) {
			return;
		}
		//If this player's game mode is disabled on the map, don't add the marker.
		if (player.getPlayerData().getGameMode() != null && config.isGameModeHidden(player.getPlayerData().getGameMode())) {
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
		
		// If not found, pick best world by matching against the player's dimension key and known map naming patterns.
		if (blueMapWorld == null) {
			Optional<String> dimKey = player.getPlayerData().getDimensionKey();
			Singletons.getLogger().info("World not found by UUID " + worldUUID.get() + ", trying to match by dimension key: " + dimKey.orElse("unknown"));
			blueMapWorld = findBestWorldFallback(api, dimKey);
		}
		
		if (blueMapWorld == null) {
			Singletons.getLogger().warn("Skipping marker for " + player.getPlayerName() + " - BlueMap world not found for UUID: " + worldUUID.get());
			return;
		}
		Vector3d basePosition = player.getPlayerData().getPosition();
		if (basePosition == null) {
			Singletons.getLogger().warn("Skipping marker for " + player.getPlayerName() + " - no position data found");
			return;
		}

		// Place marker at feet level. Icons are CSS-offset toward head height;
		// 3D models stand on the marker position.

		// Encode rotation into CSS classes so the map marker DOM carries it
		// (detail HTML only appears in the click popup, not on the map element).
		// Class names must match: -?[_a-zA-Z]+[_a-zA-Z0-9-]*
		float yaw = 0f;
		float pitch = 0f;
		Optional<Vector3d> rotation = player.getPlayerData().getRotation();
		if (rotation.isPresent()) {
			Vector3d rot = rotation.get();
			yaw = (float) rot.getX();
			pitch = (float) rot.getY();
		}
		// Quantize to integers for valid CSS class tokens (e.g. bmopm-yaw-180, bmopm-pitch-n12)
		int yawI = Math.round(yaw);
		int pitchI = Math.round(pitch);
		String yawClass = "bmopm-yaw-" + (yawI < 0 ? "n" + Math.abs(yawI) : yawI);
		String pitchClass = "bmopm-pitch-" + (pitchI < 0 ? "n" + Math.abs(pitchI) : pitchI);

		// Try to find and copy skin from server filesystem (for offline skins mod)
		String skinUrl = SkinServer.findAndCopySkin(player.getPlayerUUID());
		if (skinUrl != null) {
			Singletons.getLogger().debug("Found offline skin for " + player.getPlayerName() + " at " + skinUrl);
		} else {
			// Skin not found locally - try Mojang / name-based sources (async)
			SkinCache.cachePlayerSkin(player.getPlayerUUID(), player.getPlayerName()).thenRun(() -> {
				SkinServer.findAndCopySkin(player.getPlayerUUID());
			});
		}

		// Detail is popup-only HTML when the POI icon is clicked
		String detailHtml = player.getPlayerName() + " <i>(offline)</i><br>"
				+ "<bmopm-datetime data-timestamp=\"" + player.getLastPlayed().toEpochMilli() + "\"></bmopm-datetime>";

		// Style classes live on the map marker element (what the frontend needs)
		// Name is base64url-encoded so offline-mode skins can resolve by name on the map UI.
		String playerUuidClass = "bmopm-player-" + player.getPlayerUUID();
		String nameB64 = Base64.getUrlEncoder().withoutPadding()
				.encodeToString(player.getPlayerName().getBytes(StandardCharsets.UTF_8));
		// CSS class tokens: only [A-Za-z0-9_-]; base64url already fits.
		String nameClass = "bmopm-nb-" + nameB64;
		String animateClass = config.animatePlayerModels() ? "bmopm-animate" : "bmopm-no-animate";
		// Markers are placed at feet level; CSS offsets icons to head height
		POIMarker.Builder markerBuilder = POIMarker.builder()
				.label(player.getPlayerName())
				.detail(detailHtml)
				.styleClasses(
						"bmopm-offline-player",
						"bmopm-3d-enabled",
						playerUuidClass,
						nameClass,
						animateClass,
						yawClass,
						pitchClass
				)
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

		Singletons.getLogger().info("Marker for " + player.getPlayerName() + " (" + player.getPlayerUUID() + ") added to " + mapCount + " map(s) at position " + basePosition);
	}

	@Override
	public void remove(UUID playerUUID, BlueMapAPI api) {
		// Remove offline POI on every map so a join never leaves a greyscale ghost
		String id = playerUUID.toString();
		int touched = 0;
		for (BlueMapMap map : api.getMaps()) {
			MarkerSet set = map.getMarkerSets().get(Config.MARKER_SET_ID);
			if (set == null) continue;
			set.remove(id);
			touched++;
		}

		Singletons.getLogger().info(
				"Marker for " + Singletons.getServer().getPlayerName(playerUUID)
						+ " removed (checked " + touched + " map marker-set(s))");
	}
}
