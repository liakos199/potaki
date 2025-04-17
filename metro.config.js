// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require('nativewind/metro');
const { wrapWithReanimatedMetroConfig } = require('react-native-reanimated/metro-config'); // <-- Import Reanimated wrapper

// 1. Get the default Expo configuration
const config = getDefaultConfig(__dirname);

// Optional: Log the initial config to see what's being passed
// console.log("Initial Expo Metro Config:", JSON.stringify(config, null, 2));

// 2. Apply the NativeWind configuration wrapper
// This modifies the config to handle NativeWind specifics (like global.css)
const configWithNativeWind = withNativeWind(config, { input: './app/global.css' });

// Optional: Log the config after NativeWind
// console.log("\nConfig after NativeWind:", JSON.stringify(configWithNativeWind, null, 2));

// 3. Apply the Reanimated configuration wrapper to the RESULT of the NativeWind wrapper
// This further modifies the config for Reanimated's needs (like Babel transforms for worklets)
const finalConfig = wrapWithReanimatedMetroConfig(configWithNativeWind);

// Optional: Log the final config
// console.log("\nFinal Config after Reanimated:", JSON.stringify(finalConfig, null, 2));


// 4. Export the final, combined configuration
module.exports = finalConfig;