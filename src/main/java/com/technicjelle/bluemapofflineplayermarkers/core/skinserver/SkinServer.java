package com.technicjelle.bluemapofflineplayermarkers.core.skinserver;

import de.bluecolored.bluemap.api.BlueMapAPI;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

public class SkinServer {
	private static final Logger LOGGER = LogManager.getLogger(SkinServer.class);
	
	// Common offline skin mod locations to check
	private static final String[] SKIN_PATHS = {
		"config/offlineskins",           // Common config location (used by SkinCache)
		"plugins/OfflineSkins",          // Paper/Spigot plugin
		"mods/offlineskins",             // Mod data folder
		"skins"                          // Generic skins folder
	};
	
	private static Path serverRoot;
	private static Path webappSkinsDir;
	
	/**
	 * Initialize the skin server and set up skin directory in webapp
	 */
	public static void initialize(BlueMapAPI api, Path serverRootPath) {
		serverRoot = serverRootPath;
		
		try {
			// Create skins directory in webapp
			Path webAppPath = api.getWebApp().getWebRoot();
			webappSkinsDir = webAppPath.resolve("assets").resolve("bmopm-skins");
			Files.createDirectories(webappSkinsDir);
			
			LOGGER.info("Skin server initialized. Skins will be served from: {}", webappSkinsDir);
		} catch (IOException e) {
			LOGGER.error("Failed to initialize skin server directory", e);
		}
	}
	
	/**
	 * Find and copy skin file for a given UUID to the webapp directory
	 * Returns the webapp URL path if found, null otherwise
	 */
	public static String findAndCopySkin(UUID uuid) {
		if (serverRoot == null || webappSkinsDir == null) {
			return null;
		}
		
		Path skinFile = findSkinFile(uuid);
		if (skinFile == null || !Files.exists(skinFile)) {
			return null;
		}
		
		try {
			// Copy to webapp directory with UUID as filename
			String filename = uuid.toString() + ".png";
			Path webappSkinFile = webappSkinsDir.resolve(filename);
			
			// Only copy if it doesn't exist or source is newer
			if (!Files.exists(webappSkinFile) || 
			    Files.getLastModifiedTime(skinFile).compareTo(Files.getLastModifiedTime(webappSkinFile)) > 0) {
				Files.copy(skinFile, webappSkinFile, StandardCopyOption.REPLACE_EXISTING);
				LOGGER.debug("Copied skin for UUID {} from {} to webapp", uuid, skinFile);
			}
			
			// Return the URL path (relative to webapp root)
			return "/assets/bmopm-skins/" + filename;
		} catch (IOException e) {
			LOGGER.warn("Failed to copy skin file for UUID " + uuid + " to webapp", e);
			return null;
		}
	}
	
	/**
	 * Find skin file for a given UUID by checking common offline skin mod locations
	 */
	private static Path findSkinFile(UUID uuid) {
		if (serverRoot == null) {
			return null;
		}
		
		String uuidString = uuid.toString();
		String uuidNoDashes = uuidString.replace("-", "");
		
		// Try different filename formats
		String[] filenameFormats = {
			uuidString + ".png",
			uuidNoDashes + ".png",
			uuidString + ".jpg",
			uuidNoDashes + ".jpg"
		};
		
		// Check each common path
		for (String skinPath : SKIN_PATHS) {
			Path basePath = serverRoot.resolve(skinPath);
			
			if (!Files.exists(basePath) || !Files.isDirectory(basePath)) {
				continue;
			}
			
			// Try each filename format
			for (String filename : filenameFormats) {
				Path skinFile = basePath.resolve(filename);
				if (Files.exists(skinFile) && Files.isRegularFile(skinFile)) {
					LOGGER.debug("Found skin file: {}", skinFile);
					return skinFile;
				}
			}
			
			// Also check subdirectories (some mods organize by UUID prefix)
			try {
				for (Path subDir : Files.newDirectoryStream(basePath)) {
					if (Files.isDirectory(subDir)) {
						for (String filename : filenameFormats) {
							Path skinFile = subDir.resolve(filename);
							if (Files.exists(skinFile) && Files.isRegularFile(skinFile)) {
								LOGGER.debug("Found skin file in subdirectory: {}", skinFile);
								return skinFile;
							}
						}
					}
				}
			} catch (IOException e) {
				// Ignore, continue searching
			}
		}
		
		return null;
	}
}
