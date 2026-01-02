package com.technicjelle.bluemapofflineplayermarkers.impl.neoforge;

import com.technicjelle.bluemapofflineplayermarkers.common.Server;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.LevelResource;
import net.neoforged.fml.loading.FMLPaths;

import java.nio.file.Path;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public class NeoForgeServer implements Server {
	private final MinecraftServer server;

	public NeoForgeServer(MinecraftServer server) {
		this.server = server;
	}

	@Override
	public boolean isPlayerOnline(UUID playerUUID) {
		return server.getPlayerList().getPlayer(playerUUID) != null;
	}

	@Override
	public Path getConfigFolder() {
		return FMLPaths.CONFIGDIR.get().resolve("bluemapofflineplayermarkers");
	}

	@Override
	public Path getPlayerDataFolder() {
		// Get the main world's playerdata folder
		ServerLevel overworld = server.getLevel(Level.OVERWORLD);
		if (overworld != null) {
			return overworld.getServer().getWorldPath(LevelResource.PLAYER_DATA_DIR);
		}
		// Fallback: try to get from any world
		for (ServerLevel level : server.getAllLevels()) {
			return level.getServer().getWorldPath(LevelResource.PLAYER_DATA_DIR);
		}
		// Last resort: construct path manually
		return FMLPaths.GAMEDIR.get().resolve("world").resolve("playerdata");
	}

	@Override
	public Instant getPlayerLastPlayed(UUID playerUUID) {
		ServerPlayer player = server.getPlayerList().getPlayer(playerUUID);
		if (player != null) {
			return Instant.ofEpochMilli(player.getLastActionTime());
		}
		// For offline players, we'd need to read from playerdata file
		// This is a simplified version - the actual last played time will be read from NBT
		return Instant.now();
	}

	@Override
	public String getPlayerName(UUID playerUUID) {
		ServerPlayer player = server.getPlayerList().getPlayer(playerUUID);
		if (player != null) {
			return player.getGameProfile().getName();
		}

		// Try to get from server's profile cache
		com.mojang.authlib.GameProfile profile = server.getProfileCache().get(playerUUID).orElse(null);
		if (profile != null && profile.getName() != null) {
			return profile.getName();
		}

		// Fallback to Mojang API
		try {
			return Server.nameFromMojangAPI(playerUUID);
		} catch (java.io.IOException e) {
			return playerUUID.toString();
		}
	}

	@Override
	public Optional<UUID> guessWorldUUID(Object object) {
		if (object instanceof String) {
			String dimensionString = (String) object;

			// Try to get world by dimension key
			for (ServerLevel level : server.getAllLevels()) {
				String dimensionKey = level.dimension().location().toString();
				if (dimensionKey.contains(dimensionString) || dimensionString.contains(dimensionKey)) {
					// Use dimension location to generate a consistent UUID (same as BlueMap uses)
					return Optional.of(UUID.nameUUIDFromBytes(dimensionKey.getBytes()));
				}
			}

			// Try by environment type
			for (ServerLevel level : server.getAllLevels()) {
				if (dimensionString.contains("overworld") && level.dimension() == Level.OVERWORLD) {
					return Optional.of(UUID.nameUUIDFromBytes(level.dimension().location().toString().getBytes()));
				}
				if (dimensionString.contains("the_nether") && level.dimension() == Level.NETHER) {
					return Optional.of(UUID.nameUUIDFromBytes(level.dimension().location().toString().getBytes()));
				}
				if (dimensionString.contains("the_end") && level.dimension() == Level.END) {
					return Optional.of(UUID.nameUUIDFromBytes(level.dimension().location().toString().getBytes()));
				}
			}
		}

		// Handle integer dimension IDs (for older Minecraft versions or modded dimensions)
		if (object instanceof Integer) {
			int dimensionInt = (Integer) object;
			// Map common dimension IDs to their dimension keys
			for (ServerLevel level : server.getAllLevels()) {
				if (dimensionInt == 0 && level.dimension() == Level.OVERWORLD) {
					return Optional.of(UUID.nameUUIDFromBytes(level.dimension().location().toString().getBytes()));
				}
				if (dimensionInt == -1 && level.dimension() == Level.NETHER) {
					return Optional.of(UUID.nameUUIDFromBytes(level.dimension().location().toString().getBytes()));
				}
				if (dimensionInt == 1 && level.dimension() == Level.END) {
					return Optional.of(UUID.nameUUIDFromBytes(level.dimension().location().toString().getBytes()));
				}
			}
		}

		return Optional.empty();
	}

	@Override
	public Optional<UUID> getWorldUUIDFromStoredUUID(UUID storedWorldUUID) {
		// Try to find a ServerLevel that matches this UUID
		// Since we can't directly get the UUID from ServerLevel, we'll iterate through all levels
		// and check if any match. However, this is difficult without direct UUID access.
		
		// For now, if we can't determine the dimension, default to overworld
		// This is a reasonable fallback since most players log out in the overworld
		ServerLevel overworld = server.getLevel(Level.OVERWORLD);
		if (overworld != null) {
			String dimensionKey = overworld.dimension().location().toString();
			return Optional.of(UUID.nameUUIDFromBytes(dimensionKey.getBytes()));
		}
		
		return Optional.empty();
	}

	@Override
	public boolean isPlayerBanned(UUID playerUUID) {
		// Try to get player name first
		String playerName = getPlayerName(playerUUID);
		// If we couldn't get a name, use UUID string as fallback
		if (playerName == null || playerName.equals(playerUUID.toString())) {
			// For offline players without cached names, check bans by UUID only
			// The ban list should accept profiles with UUID only
			try {
				com.mojang.authlib.GameProfile profile = new com.mojang.authlib.GameProfile(playerUUID, playerUUID.toString());
				return server.getPlayerList().getBans().isBanned(profile);
			} catch (Exception e) {
				// If that fails, try with a placeholder name
				com.mojang.authlib.GameProfile profile = new com.mojang.authlib.GameProfile(playerUUID, "Player");
				return server.getPlayerList().getBans().isBanned(profile);
			}
		}
		com.mojang.authlib.GameProfile profile = new com.mojang.authlib.GameProfile(playerUUID, playerName);
		return server.getPlayerList().getBans().isBanned(profile);
	}
}

