package com.technicjelle.bluemapofflineplayermarkers.core.fileloader;

import com.flowpowered.math.vector.Vector3d;
import com.technicjelle.bluemapofflineplayermarkers.common.PlayerData;
import com.technicjelle.bluemapofflineplayermarkers.core.GameMode;
import com.technicjelle.bluemapofflineplayermarkers.core.Singletons;
import de.bluecolored.bluenbt.NBTName;
import org.jetbrains.annotations.Nullable;

import java.util.Optional;
import java.util.UUID;

public class PlayerNBTData implements PlayerData {
	@NBTName("playerGameType")
	private int gameMode;

	@NBTName("Pos")
	private double[] position;

	@NBTName("WorldUUIDLeast")
	private long worldUUIDLeast;

	@NBTName("WorldUUIDMost")
	private long worldUUIDMost;

	@NBTName("Dimension")
	private Object dimension;

	@NBTName("Rotation")
	private float[] rotation;

	public @Nullable GameMode getGameMode() {
		return GameMode.getByValue(gameMode);
	}

	public @Nullable Vector3d getPosition() {
		if (position == null || position.length != 3) return null; // Position is broken

		return new Vector3d(position[0], position[1], position[2]);
	}

	@Override
	public Optional<String> getDimensionKey() {
		if (dimension == null) return Optional.empty();

		Object dimensionToGuess = dimension;
		if (dimension instanceof java.util.Map) {
			@SuppressWarnings("unchecked")
			java.util.Map<String, Object> dimensionMap = (java.util.Map<String, Object>) dimension;
			String namespace = (String) dimensionMap.getOrDefault("namespace", "minecraft");
			String path = (String) dimensionMap.getOrDefault("path", "overworld");
			dimensionToGuess = namespace + ":" + path;
		}
		if (dimensionToGuess == null) return Optional.empty();
		return Optional.of(String.valueOf(dimensionToGuess));
	}

	@Nullable
	public Optional<UUID> getWorldUUID() {
		// BlueMap uses UUIDs generated from dimension keys, not the actual world UUID
		// So we should use the dimension to generate the UUID that BlueMap expects
		
		// Handle dimension field - it might be a String, Integer, or Map (ResourceLocation compound tag)
		Object dimensionToGuess;
		Optional<String> dimKey = getDimensionKey();
		if (dimKey.isPresent()) {
			dimensionToGuess = dimKey.get();
		} else {
			dimensionToGuess = dimension;
		}
		if (dimensionToGuess != null && dimensionToGuess != dimension) {
			Singletons.getLogger().info("Dimension parsed from compound tag: " + dimensionToGuess);
		} else if (dimension != null) {
			Singletons.getLogger().info("Dimension type: " + dimension.getClass().getName() + ", value: " + dimension);
		}
		
		// First, try to get UUID from dimension
		Optional<UUID> guessedUUID = Singletons.getServer().guessWorldUUID(dimensionToGuess);
		if (guessedUUID.isPresent()) {
			Singletons.getLogger().info("Successfully guessed world UUID from dimension: " + guessedUUID.get());
			return guessedUUID;
		}
		
		// If dimension guess failed, try overworld as a fallback (most common case)
		Optional<UUID> overworldUUID = Singletons.getServer().guessWorldUUID("minecraft:overworld");
		if (overworldUUID.isPresent()) {
			Singletons.getLogger().info("Dimension guess failed, defaulting to overworld UUID: " + overworldUUID.get());
			return overworldUUID;
		}

		// If dimension guess failed, try to get dimension from the stored world UUID
		// by looking up the actual world on the server
		UUID storedWorldUUID = new UUID(worldUUIDMost, worldUUIDLeast);
		if (!storedWorldUUID.equals(new UUID(0, 0))) {
			Optional<UUID> uuidFromWorld = Singletons.getServer().getWorldUUIDFromStoredUUID(storedWorldUUID);
			if (uuidFromWorld.isPresent()) {
				Singletons.getLogger().info("Using world UUID from stored UUID lookup: " + uuidFromWorld.get());
				return uuidFromWorld;
			}
			// Last resort: return the stored UUID (might work if BlueMap uses actual world UUIDs)
			Singletons.getLogger().warn("Could not determine BlueMap-compatible UUID, using stored world UUID: " + storedWorldUUID);
			return Optional.of(storedWorldUUID);
		}

		return Optional.empty();
	}

	@Override
	public Optional<Vector3d> getRotation() {
		if (rotation != null && rotation.length >= 2) {
			// Minecraft stores rotation as [yaw, pitch], where yaw is horizontal and pitch is vertical
			return Optional.of(new Vector3d(rotation[0], rotation[1], 0));
		}
		return Optional.empty();
	}
}
