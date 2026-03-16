import { SocietyScene, setRuntime } from "./scene.js";
import { WorldState } from "../sim/world.js";
import { SimulationUI } from "../ui/hud.js";

const world = new WorldState({
    width: 1280,
    height: 960,
    gridSize: 32,
});

world.seed();

const ui = new SimulationUI(world);
setRuntime({ world, ui });

new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game-container",
    backgroundColor: "#233424",
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: "100%",
        height: "100%",
    },
    scene: [SocietyScene],
});
