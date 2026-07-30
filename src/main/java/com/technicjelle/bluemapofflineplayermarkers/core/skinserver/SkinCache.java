package com.technicjelle.bluemapofflineplayermarkers.core.skinserver;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Base64;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

public class SkinCache {
	private static final Logger LOGGER = LogManager.getLogger(SkinCache.class);

	private static Path skinsDirectory;

	public static void initialize(Path serverRoot) {
		skinsDirectory = serverRoot.resolve("config").resolve("offlineskins");
		try {
			Files.createDirectories(skinsDirectory);
			LOGGER.info("Skin cache directory initialized at: {}", skinsDirectory);
		} catch (Exception e) {
			LOGGER.error("Failed to create skin cache directory", e);
		}
	}

	public static CompletableFuture<Void> cachePlayerSkin(UUID playerUUID) {
		return cachePlayerSkin(playerUUID, null);
	}

	/**
	 * Fetch and cache a player's skin PNG.
	 * Tries Mojang session server first; on failure (offline-mode UUIDs → HTTP 204)
	 * falls back to name-based skin hosts when {@code playerName} is provided.
	 */
	public static CompletableFuture<Void> cachePlayerSkin(UUID playerUUID, String playerName) {
		return CompletableFuture.runAsync(() -> {
			if (skinsDirectory == null) {
				LOGGER.warn("Skin cache not initialized, skipping {}", playerUUID);
				return;
			}
			try {
				Path skinFile = skinsDirectory.resolve(playerUUID.toString() + ".png");
				if (Files.exists(skinFile) && Files.size(skinFile) > 0) {
					LOGGER.debug("Skin already cached for UUID: {}", playerUUID);
					SkinServer.findAndCopySkin(playerUUID);
					return;
				}

				String skinUrl = fetchSkinUrlFromMojang(playerUUID);
				if (skinUrl == null && playerName != null && !playerName.isBlank()) {
					// Offline-mode / cracked: resolve by name
					String encoded = URLEncoder.encode(playerName, StandardCharsets.UTF_8);
					if (tryDownload("https://mc-heads.net/skin/" + encoded, skinFile)
							|| tryDownload("https://minotar.net/skin/" + encoded, skinFile)) {
						LOGGER.info("Cached skin for {} ({}) via name-based service", playerName, playerUUID);
						SkinServer.findAndCopySkin(playerUUID);
						return;
					}
				}

				if (skinUrl == null) {
					LOGGER.debug("No skin URL for UUID {} (name={})", playerUUID, playerName);
					return;
				}

				if (tryDownload(skinUrl, skinFile)) {
					LOGGER.info("Cached skin for UUID {} to {}", playerUUID, skinFile);
					SkinServer.findAndCopySkin(playerUUID);
				}
			} catch (Exception e) {
				LOGGER.warn("Failed to cache skin for UUID {}: {}", playerUUID, e.getMessage());
			}
		});
	}

	private static String fetchSkinUrlFromMojang(UUID playerUUID) {
		try {
			String uuidNoDashes = playerUUID.toString().replace("-", "");
			URL url = new URL("https://sessionserver.mojang.com/session/minecraft/profile/" + uuidNoDashes);
			HttpURLConnection connection = (HttpURLConnection) url.openConnection();
			connection.setRequestMethod("GET");
			connection.setConnectTimeout(5000);
			connection.setReadTimeout(5000);
			int code = connection.getResponseCode();
			if (code != HttpURLConnection.HTTP_OK) {
				LOGGER.debug("Mojang profile for {} → HTTP {}", playerUUID, code);
				return null;
			}
			String jsonResponse = new String(connection.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
			JsonObject profile = JsonParser.parseString(jsonResponse).getAsJsonObject();
			if (!profile.has("properties") || !profile.get("properties").isJsonArray()) return null;
			for (var prop : profile.getAsJsonArray("properties")) {
				JsonObject property = prop.getAsJsonObject();
				if (!"textures".equals(property.get("name").getAsString())) continue;
				String decoded = new String(Base64.getDecoder().decode(property.get("value").getAsString()), StandardCharsets.UTF_8);
				JsonObject textures = JsonParser.parseString(decoded).getAsJsonObject();
				if (!textures.has("textures")) return null;
				JsonObject texturesObj = textures.getAsJsonObject("textures");
				if (!texturesObj.has("SKIN")) return null;
				JsonObject skin = texturesObj.getAsJsonObject("SKIN");
				if (skin.has("url")) return skin.get("url").getAsString();
			}
		} catch (Exception e) {
			LOGGER.debug("Mojang profile fetch failed for {}: {}", playerUUID, e.getMessage());
		}
		return null;
	}

	private static boolean tryDownload(String skinUrl, Path skinFile) {
		try {
			URL skinUrlObj = new URL(skinUrl);
			HttpURLConnection skinConnection = (HttpURLConnection) skinUrlObj.openConnection();
			skinConnection.setRequestMethod("GET");
			skinConnection.setConnectTimeout(5000);
			skinConnection.setReadTimeout(5000);
			skinConnection.setRequestProperty("User-Agent", "BlueMapOfflinePlayerMarkers/3.0");
			if (skinConnection.getResponseCode() != HttpURLConnection.HTTP_OK) return false;
			try (InputStream skinStream = skinConnection.getInputStream()) {
				Files.copy(skinStream, skinFile, StandardCopyOption.REPLACE_EXISTING);
			}
			return Files.exists(skinFile) && Files.size(skinFile) > 0;
		} catch (Exception e) {
			LOGGER.debug("Download failed for {}: {}", skinUrl, e.getMessage());
			return false;
		}
	}
}
