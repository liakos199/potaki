// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // Use babel-preset-expo, configuring jsxImportSource for NativeWind
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      // Remove "nativewind/babel" here - it's handled by jsxImportSource
    ],
    plugins: [
      // Add other plugins here if you have them

      // IMPORTANT: react-native-reanimated/plugin MUST be the last plugin
      'react-native-reanimated/plugin',
    ],
  };
};