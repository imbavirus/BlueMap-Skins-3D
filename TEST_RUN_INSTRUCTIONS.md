# Test Run Instructions

## Prerequisites

1. **BlueMap Mod**: Download BlueMap NeoForge version for Minecraft 1.21.1
   - Get from: https://modrinth.com/mod/bluemap or https://www.curseforge.com/minecraft/mc-mods/bluemap
   - Place in `run/mods/` directory

2. **Java 21**: Ensure Java 21 is installed and set as JAVA_HOME

## Building the Mod

```bash
.\gradlew.bat build
```

The built JAR will be in `build/libs/BlueMapOfflinePlayerMarkers-3.0.jar`

## Running a Test Server

### Option 1: Using Gradle Run Task

```bash
.\gradlew.bat runServer
```

This will:
- Download Minecraft 1.21.1 server
- Set up NeoForge 21.1.217
- Load the mod
- Start a test server

**Note**: BlueMap must be manually placed in `run/mods/` before running.

### Option 2: Manual Setup

1. Copy the built JAR to a test server's `mods/` folder:
   ```
   build/libs/BlueMapOfflinePlayerMarkers-3.0.jar -> your-server/mods/
   ```

2. Ensure BlueMap is also in the `mods/` folder

3. Start the server

## Verifying Dependencies

The mod requires:
- ✅ NeoForge 21.1.217 (provided by NeoForge)
- ✅ BlueMap API 2.7.2 (provided by BlueMap mod at runtime)
- ✅ UpdateChecker 2.5.1 (shaded into JAR)
- ✅ BMUtils 4.2.1 (shaded into JAR)
- ✅ MCUtils 2.0 (shaded into JAR)
- ✅ BlueNBT 2.3.0 (shaded into JAR)

All dependencies except NeoForge and BlueMap API are included in the shaded JAR.

## Testing Checklist

1. ✅ Server starts without errors
2. ✅ Mod loads (check logs for "BlueMap Offline Player Markers mod enabled!")
3. ✅ BlueMap loads and initializes
4. ✅ Player markers appear on map after players log out
5. ✅ Config file is created in `config/bluemapofflineplayermarkers/`
6. ✅ 3D models work (if enabled in config)

## Troubleshooting

- **Missing BlueMap API**: Ensure BlueMap mod is in `mods/` folder
- **ClassNotFoundException**: Check that all dependencies are properly shaded
- **Config errors**: Check `config/bluemapofflineplayermarkers/config.properties`

