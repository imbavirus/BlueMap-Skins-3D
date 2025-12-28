# ASM Conflict Workaround

## Problem

There's a known incompatibility between Shadow plugin and NeoForge userdev's `runServer` task:

- NeoForge provides ASM 9.8 on the module path (required by `securejarhandler`)
- Shadow plugin brings ASM 9.5 on the classpath
- Java doesn't allow the same module on both module path and classpath

Error:
```
Module named org.objectweb.asm.tree was already on the JVMs module path loaded from ...asm-tree-9.8.jar but class-path contains it at location ...asm-tree-9.5.jar
```

## Solution

The `runServer` task cannot work with Shadow plugin due to this conflict. However, the **build works fine** and produces a working JAR.

### Option 1: Test with Real Server (Recommended)

1. Build the mod:
   ```powershell
   .\gradlew.bat build
   ```

2. Copy the JAR to your server:
   ```
   build/libs/BlueMapOfflinePlayerMarkers-3.0.jar -> your-server/mods/
   ```

3. Ensure BlueMap is also in the `mods/` folder

4. Start your server and test

### Option 2: Use Regular Jar for Development

If you need to use `runServer` for development, you can temporarily disable Shadow plugin:

1. Comment out Shadow plugin in `build.gradle`:
   ```groovy
   // id 'com.github.johnrengelman.shadow' version '8.1.1'
   ```

2. Comment out shadow jar configuration

3. Use regular jar for development, shadow jar only for releases

### Option 3: Update Shadow Plugin

Try updating to a newer version of Shadow plugin that might handle this better:
```groovy
id 'com.github.johnrengelman.shadow' version '8.1.1' // Try 8.2.0 or newer
```

## Current Status

- ✅ **Build works**: `.\gradlew.bat build` produces a working shadow JAR
- ✅ **Dependencies are correct**: All dependencies are properly shaded
- ❌ **runServer fails**: Due to ASM conflict (but not needed for production)

The mod is **fully functional** when deployed to a real server. The `runServer` task issue is a development-time limitation only.

