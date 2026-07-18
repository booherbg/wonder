// Every color in the game. Change the mood of the whole world from this file.
export const PALETTE = {
  background: "#0a0e14",

  deepWaterBase: "#22467c",
  deepWaterGlint: "#2d548e",
  shallowWaterBase: "#4a7dbd",
  shallowWaterGlint: "#5d8fcc",

  sandBase: "#e3d29c",
  sandSpeckle: ["#d6c489", "#efe0b2", "#cbb878"],

  grassBase: "#68a557",
  grassSpeckle: ["#5c9a4c", "#77b364", "#4f8c41"],

  forestFloor: "#568f47",
  treeCanopyDark: "#2f6134",
  treeCanopy: "#3e7a40",
  treeCanopyLight: "#4f8f4c",
  treeTrunk: "#6b4a2f",

  rockBase: "#8b8e93",
  rockSpeckle: ["#7c7f84", "#999da2", "#70737a"],
  rockShadow: "#63666d",

  snowBase: "#e9eef4",
  snowSpeckle: ["#dbe3ec", "#f4f7fb", "#cfd9e5"],

  playerCloak: "#c94f43",
  playerSkin: "#f0c8a0",
  playerHair: "#4a3225",
  playerShadow: "rgba(0, 0, 0, 0.25)",
} as const;
