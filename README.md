# Robot Island 🤖

A little robot crash-lands on an island. Build a factory to make the parts it needs to fix its rocket
and fly home. A family factory game in the spirit of Builderment.

- ⛏️ **Drills** on trees, rocks and ore; ➡️ **belts** carry things around.
- 🔥 **Furnaces**, 🛠️ **workshops** and 🏭 **assemblers** turn things into better things.
- 🎯 Eight goals unlock new buildings, ending with the rocket engine and hull, then 🚀 launch.
- Each player has their own island, plus a shared 🏝️ family island.
- The factory keeps working while you're away (up to 8 hours' worth).
- Islands save on the device. A **save code** moves an island to another device.

Touch first: drag to look around and pinch to zoom; with a tool picked, draw belts with one finger and
move the map with two. Mouse and wheel work too (R turns, Esc cancels).

Everything is one self-contained `index.html`: no build, works offline (the emoji web font is optional).

Play: open `index.html`, or the hosted version on GitHub Pages.

## Dev

`node engine.test.js` checks the game engine headlessly: map generation, belts, machines, goals,
costs and refunds, time away, saving and save codes.

All the numbers to tune (costs, recipes, goals, speeds) are in the tables at the top of the script.
