package com.technicjelle.bluemapofflineplayermarkers.impl.neoforge;

import com.technicjelle.bluemapofflineplayermarkers.common.Config;
import com.technicjelle.bluemapofflineplayermarkers.core.GameMode;
import net.neoforged.fml.loading.FMLPaths;
import org.jetbrains.annotations.NotNull;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;

public class NeoForgeConfig implements Config {
	private String markerSetName;
	private boolean toggleable;
	private boolean defaultHidden;
	private long expireTimeInHours;
	private List<GameMode> hiddenGameModes;
	private boolean hideBannedPlayers;
	private boolean showPlayerModels;
	private boolean animatePlayerModels;

	private final Path configFile;

	public NeoForgeConfig() {
		Path configDir = FMLPaths.CONFIGDIR.get().resolve("bluemapofflineplayermarkers");
		try {
			Files.createDirectories(configDir);
		} catch (IOException e) {
			throw new RuntimeException("Failed to create config directory", e);
		}
		this.configFile = configDir.resolve("config.properties");
		load();
	}

	public void load() {
		Properties props = new Properties();
		
		// Load existing config or use defaults
		if (Files.exists(configFile)) {
			try (var reader = Files.newBufferedReader(configFile)) {
				props.load(reader);
				if (com.technicjelle.bluemapofflineplayermarkers.core.Singletons.getLogger() != null) {
					com.technicjelle.bluemapofflineplayermarkers.core.Singletons.getLogger().info("Loading config from: " + configFile);
				}
			} catch (IOException e) {
				throw new RuntimeException("Failed to load config file", e);
			}
		} else {
			if (com.technicjelle.bluemapofflineplayermarkers.core.Singletons.getLogger() != null) {
				com.technicjelle.bluemapofflineplayermarkers.core.Singletons.getLogger().info("Config file not found, using defaults. Config will be saved to: " + configFile);
			}
		}

		// Load values with defaults
		markerSetName = props.getProperty("MarkerSetName", "Offline Players");
		toggleable = Boolean.parseBoolean(props.getProperty("Toggleable", "true"));
		defaultHidden = Boolean.parseBoolean(props.getProperty("DefaultHidden", "false"));
		expireTimeInHours = Long.parseLong(props.getProperty("ExpireTimeInHours", "0"));
		
		String hiddenGameModesStr = props.getProperty("HiddenGameModes", "spectator");
		List<String> hiddenGameModesStrings = List.of(hiddenGameModesStr.split(","));
		hiddenGameModes = Config.parseGameModes(hiddenGameModesStrings.stream()
			.map(String::trim)
			.filter(s -> !s.isEmpty())
			.toList());
		
		hideBannedPlayers = Boolean.parseBoolean(props.getProperty("HideBannedPlayers", "true"));
		showPlayerModels = Boolean.parseBoolean(props.getProperty("ShowPlayerModels", "false"));
		animatePlayerModels = Boolean.parseBoolean(props.getProperty("AnimatePlayerModels", "true"));

		// Save config (in case it didn't exist or had missing properties)
		save();
		
		// Log config values if logger is available
		if (com.technicjelle.bluemapofflineplayermarkers.core.Singletons.getLogger() != null) {
			com.technicjelle.bluemapofflineplayermarkers.core.Singletons.getLogger().info("Configuration loaded:");
			com.technicjelle.bluemapofflineplayermarkers.core.Singletons.getLogger().info("  MarkerSetName: " + markerSetName);
			com.technicjelle.bluemapofflineplayermarkers.core.Singletons.getLogger().info("  Toggleable: " + toggleable);
			com.technicjelle.bluemapofflineplayermarkers.core.Singletons.getLogger().info("  DefaultHidden: " + defaultHidden);
			com.technicjelle.bluemapofflineplayermarkers.core.Singletons.getLogger().info("  ExpireTimeInHours: " + expireTimeInHours);
			com.technicjelle.bluemapofflineplayermarkers.core.Singletons.getLogger().info("  HiddenGameModes: " + hiddenGameModes);
			com.technicjelle.bluemapofflineplayermarkers.core.Singletons.getLogger().info("  HideBannedPlayers: " + hideBannedPlayers);
			com.technicjelle.bluemapofflineplayermarkers.core.Singletons.getLogger().info("  ShowPlayerModels: " + showPlayerModels);
			com.technicjelle.bluemapofflineplayermarkers.core.Singletons.getLogger().info("  AnimatePlayerModels: " + animatePlayerModels);
		}
	}

	private void save() {
		Properties props = new Properties();
		props.setProperty("MarkerSetName", markerSetName);
		props.setProperty("Toggleable", String.valueOf(toggleable));
		props.setProperty("DefaultHidden", String.valueOf(defaultHidden));
		props.setProperty("ExpireTimeInHours", String.valueOf(expireTimeInHours));
		props.setProperty("HiddenGameModes", String.join(",", hiddenGameModes.stream()
			.map(GameMode::getId)
			.toList()));
		props.setProperty("HideBannedPlayers", String.valueOf(hideBannedPlayers));
		props.setProperty("ShowPlayerModels", String.valueOf(showPlayerModels));
		props.setProperty("AnimatePlayerModels", String.valueOf(animatePlayerModels));

		try (var writer = Files.newBufferedWriter(configFile)) {
			props.store(writer, "BlueMap Offline Player Markers Configuration");
		} catch (IOException e) {
			throw new RuntimeException("Failed to save config file", e);
		}
	}

	@Override
	public String getMarkerSetName() {
		return markerSetName;
	}

	@Override
	public boolean isToggleable() {
		return toggleable;
	}

	@Override
	public boolean isDefaultHidden() {
		return defaultHidden;
	}

	@Override
	public long getExpireTimeInHours() {
		return expireTimeInHours;
	}

	@Override
	public List<GameMode> getHiddenGameModes() {
		return hiddenGameModes;
	}

	@Override
	public boolean hideBannedPlayers() {
		return hideBannedPlayers;
	}

	@Override
	public boolean showPlayerModels() {
		return showPlayerModels;
	}

	@Override
	public boolean animatePlayerModels() {
		return animatePlayerModels;
	}
}

