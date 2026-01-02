package mockery;

import com.technicjelle.bluemapofflineplayermarkers.core.Player;
import com.technicjelle.bluemapofflineplayermarkers.core.Singletons;
import com.technicjelle.bluemapofflineplayermarkers.core.markerhandler.MarkerHandler;
import de.bluecolored.bluemap.api.BlueMapAPI;

import java.util.Optional;
import java.util.UUID;

public class MockMarkerHandler implements MarkerHandler {
	@Override
	public void add(Player player, BlueMapAPI __) {
		Singletons.getLogger().debug("UUID: " + player.getPlayerUUID());
		Singletons.getLogger().debug("Name: " + player.getPlayerName());
		Singletons.getLogger().debug("Last Played: " + player.getLastPlayed().toEpochMilli());
		Singletons.getLogger().debug("GameMode: " + player.getPlayerData().getGameMode());
		Singletons.getLogger().debug("Position: " + player.getPlayerData().getPosition());
		Singletons.getLogger().debug("Banned: " + Singletons.getServer().isPlayerBanned(player.getPlayerUUID()));

		Optional<UUID> worldUUID = player.getPlayerData().getWorldUUID();
		if (worldUUID.isEmpty())
			Singletons.getLogger().warn("World UUID: null");
		else
			Singletons.getLogger().debug("World UUID: " + worldUUID.get());
	}

	@Override
	public void remove(UUID __, BlueMapAPI ___) {
	}
}
