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
					// Use dimension location to generate a consistent UUID
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

		return Optional.empty();
	}

	@Override
	public boolean isPlayerBanned(UUID playerUUID) {
		com.mojang.authlib.GameProfile profile = new com.mojang.authlib.GameProfile(playerUUID, null);
		return server.getPlayerList().getBans().isBanned(profile);
	}
}

