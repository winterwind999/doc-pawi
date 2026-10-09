module.exports = function (api) {
  api.cache(true);
  return {
    // NativeWind v4: JSX import source + its Babel preset. babel-preset-expo already adds the
    // worklets plugin for Reanimated 4, so it must not be added again here.
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
