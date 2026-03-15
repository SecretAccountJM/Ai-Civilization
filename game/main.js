import { SocietyScene, setRuntime } from "./scene.js";
import { WorldState } from "../sim/world.js";
import { SimulationUI } from "../ui/hud.js";

const world = new WorldState({
    width: 896,
    height: 768,
    gridSize: 32,
});

world.seed();

const ui = new SimulationUI(world);
setRuntime({ world, ui });

new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game-container",
    width: world.width,
    height: world.height,
    backgroundColor: "#233424",
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: world.width,
        height: world.height,
    },
    scene: [SocietyScene],
});
