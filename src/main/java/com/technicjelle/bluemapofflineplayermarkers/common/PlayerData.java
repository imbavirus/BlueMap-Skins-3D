package com.technicjelle.bluemapofflineplayermarkers.common;

import com.flowpowered.math.vector.Vector3d;
import com.technicjelle.bluemapofflineplayermarkers.core.GameMode;

import java.util.Optional;
import java.util.UUID;

public interface PlayerData {
	GameMode getGameMode();

	Vector3d getPosition();

	Optional<UUID> getWorldUUID();

	/**
	 * @return Dimension key string like "minecraft:overworld" if available.
	 * This is used as a reliable fallback to pick the correct BlueMap world/map when UUID lookups fail.
	 */
	default Optional<String> getDimensionKey() {
		return Optional.empty();
	}

	/**
	 * @return Player rotation in degrees (yaw, pitch). Yaw is horizontal rotation (0-360), pitch is vertical (-90 to 90).
	 */
	default Optional<Vector3d> getRotation() {
		return Optional.empty();
	}
}
