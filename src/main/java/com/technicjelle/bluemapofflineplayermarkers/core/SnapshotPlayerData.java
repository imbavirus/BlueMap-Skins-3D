package com.technicjelle.bluemapofflineplayermarkers.core;

import com.flowpowered.math.vector.Vector3d;
import com.technicjelle.bluemapofflineplayermarkers.common.PlayerData;
import org.jetbrains.annotations.Nullable;

import java.util.Optional;
import java.util.UUID;

/**
 * Immutable snapshot of player location/state for async marker creation.
 * Capturing a live ServerPlayer and reading it off-thread is unsafe.
 */
public final class SnapshotPlayerData implements PlayerData {
	private final GameMode gameMode;
	private final Vector3d position;
	private final Optional<UUID> worldUUID;
	private final Optional<String> dimensionKey;
	private final Optional<Vector3d> rotation;

	public SnapshotPlayerData(
			GameMode gameMode,
			Vector3d position,
			Optional<UUID> worldUUID,
			Optional<String> dimensionKey,
			Optional<Vector3d> rotation
	) {
		this.gameMode = gameMode;
		this.position = position;
		this.worldUUID = worldUUID != null ? worldUUID : Optional.empty();
		this.dimensionKey = dimensionKey != null ? dimensionKey : Optional.empty();
		this.rotation = rotation != null ? rotation : Optional.empty();
	}

	public static SnapshotPlayerData from(PlayerData source) {
		return new SnapshotPlayerData(
				source.getGameMode(),
				source.getPosition(),
				source.getWorldUUID(),
				source.getDimensionKey(),
				source.getRotation()
		);
	}

	@Override
	public @Nullable GameMode getGameMode() {
		return gameMode;
	}

	@Override
	public @Nullable Vector3d getPosition() {
		return position;
	}

	@Override
	public Optional<UUID> getWorldUUID() {
		return worldUUID;
	}

	@Override
	public Optional<String> getDimensionKey() {
		return dimensionKey;
	}

	@Override
	public Optional<Vector3d> getRotation() {
		return rotation;
	}
}
