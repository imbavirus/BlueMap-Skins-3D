# Quick Test Run Guide

## ✅ Build Status
The mod has been built successfully: `build/libs/BlueMapOfflinePlayerMarkers-3.0.jar`

## Dependencies Status

### Included in JAR (shaded):
- ✅ UpdateChecker 2.5.1
- ✅ BMUtils 4.2.1  
- ✅ MCUtils 2.0
- ✅ BlueNBT 2.3.0
- ✅ JetBrains Annotations 23.1.0

### Required at Runtime:
- ✅ NeoForge 21.1.217 (provided by NeoForge loader)
- ⚠️ BlueMap API 2.7.2 (provided by BlueMap mod - must be installed)

## Test Run Steps

### 1. Download BlueMap NeoForge Mod
- **Modrinth**: https://modrinth.com/mod/bluemap
- **CurseForge**: https://www.curseforge.com/minecraft/mc-mods/bluemap
- **Version**: NeoForge for Minecraft 1.21.1
- **File**: `bluemap-*-neoforge.jar`

### 2. Set Up Test Environment

```powershell
# Create mods directory if it doesn't exist
New-Item -ItemType Directory -Path "run\mods" -Force

# Copy BlueMap mod to run/mods/
# (Manually copy the downloaded BlueMap JAR file)
```

### 3. Run Test Server

```powershell
.\gradlew.bat runServer
```

This will:
- Download Minecraft 1.21.1 server files
- Set up NeoForge 21.1.217
- Load your mod and BlueMap
- Start a test server

### 4. Verify Mod Loads

Check the server logs for:
```
[INFO] BlueMap Offline Player Markers mod enabled!
[INFO] API Ready! BlueMap Offline Player Markers mod enabled!
```

### 5. Test Features

1. **Join the server** (connect to localhost)
2. **Log out** - your position should be marked on BlueMap
3. **Check BlueMap web interface** - should show offline player marker
4. **Test 3D models** (if enabled in config):
   - Edit `config/bluemapofflineplayermarkers/config.properties`
   - Set `ShowPlayerModels=true`
   - Reload BlueMap: `/bluemap reload`

## Troubleshooting

- **"BlueMap API not found"**: Ensure BlueMap mod is in `run/mods/`
- **"ClassNotFoundException"**: Rebuild with `.\gradlew.bat clean build`
- **Mod doesn't load**: Check NeoForge version matches (21.1.217)

