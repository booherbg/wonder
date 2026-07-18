const canvas = document.getElementById("game") as HTMLCanvasElement;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const ctx = canvas.getContext("2d")!;
ctx.fillStyle = "#0a0e14";
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = "#68a557";
ctx.font = "16px monospace";
ctx.fillText("wander: scaffold ok", 20, 40);
