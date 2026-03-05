

## Problem

The build fails because Vite/Rollup tries to resolve native-only dynamic imports (`capacitor-native-biometric`, `capacitor-health`) that aren't installed in the web project and don't exist in `node_modules`. These are Capacitor native plugins that only work on actual devices.

## Solution

Add `build.rollupOptions.external` to `vite.config.ts` to tell Rollup to skip resolving these native-only modules. This lets the app build and run in the web preview while keeping the dynamic imports intact for when it runs on a real device.

## Changes

**1. Update `vite.config.ts`**

Add rollup externals for the three native-only packages:
- `capacitor-native-biometric`
- `capacitor-health`

```typescript
build: {
  rollupOptions: {
    external: [
      'capacitor-native-biometric',
      'capacitor-health',
    ],
  },
},
```

This is a single-file, minimal change. No application logic or styling is touched. The dynamic imports in `biometricAuth.js`, `permissionsManager.js`, and `healthkit.js` already have try/catch guards, so they'll gracefully fail in the web preview and work correctly on native devices.

