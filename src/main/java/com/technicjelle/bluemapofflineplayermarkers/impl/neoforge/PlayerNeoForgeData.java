package com.technicjelle.bluemapofflineplayermarkers.impl.neoforge;

import com.flowpowered.math.vector.Vector3d;
import com.technicjelle.bluemapofflineplayermarkers.common.PlayerData;
import com.technicjelle.bluemapofflineplayermarkers.core.GameMode;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.Level;

import java.util.Optional;
import java.util.UUID;

public class PlayerNeoForgeData implements PlayerData {
	private final ServerPlayer player;

	public PlayerNeoForgeData(ServerPlayer player) {
		this.player = player;
	}

	@Override
	public GameMode getGameMode() {
		net.minecraft.world.level.GameType gameType = player.gameMode.getGameModeForPlayer();
		return switch (gameType) {
			case SURVIVAL -> GameMode.SURVIVAL;
			case CREATIVE -> GameMode.CREATIVE;
			case ADVENTURE -> GameMode.ADVENTURE;
			case SPECTATOR -> GameMode.SPECTATOR;
		};
	}

	@Override
	public Vector3d getPosition() {
		return new Vector3d(player.getX(), player.getY(), player.getZ());
	}

	@Override
	public Optional<UUID> getWorldUUID() {
		Level level = player.level();
		if (level instanceof net.minecraft.server.level.ServerLevel serverLevel) {
			// Use dimension location to generate a consistent UUID
			String dimensionKey = serverLevel.dimension().location().toString();
			UUID worldUUID = UUID.nameUUIDFromBytes(dimensionKey.getBytes());
			return Optional.of(worldUUID);
		}
		return Optional.empty();
	}

	@Override
	public Optional<Vector3d> getRotation() {
		// Minecraft stores rotation as yaw (horizontal) and pitch (vertical)
		float yaw = player.getYRot();
		float pitch = player.getXRot();
		return Optional.of(new Vector3d(yaw, pitch, 0));
	}
}

