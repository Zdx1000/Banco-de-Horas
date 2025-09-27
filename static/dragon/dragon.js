"use strict";

const screen = document.getElementById("screen");
const xmlns = "http://www.w3.org/2000/svg";
const xlinkns = "http://www.w3.org/1999/xlink";

window.addEventListener(
	"pointermove",
	(e) => {
		pointer.x = e.clientX;
		pointer.y = e.clientY;
		rad = 0;
	},
	false
);

const resize = () => {
	width = window.innerWidth;
	height = window.innerHeight;
};

let width, height;
window.addEventListener("resize", () => resize(), false);
resize();

const mood = {
	clickBoost: 0,
	clickTimes: [],
	clickPulse: 0,
	rage: false,
	rageLevel: 0,
	rageTimer: null
};

const CLICK_WINDOW = 2600;
const CLICK_THRESHOLD = 7;
const RAGE_DURATION = 5200;

const getBody = () => document.body || document.documentElement;

const isOverlayActive = () => {
	if (typeof window.isDragonOverlayActive === "function") {
		return window.isDragonOverlayActive();
	}
	const body = getBody();
	return !!body && body.classList.contains("dragon-overlay");
};

const applyRageState = (active) => {
	const body = getBody();
	if (!body) return;
	body.classList.toggle("dragon-rage", active);
};

const enterRage = () => {
	if (mood.rage) return;
	mood.rage = true;
	mood.rageLevel = 0.8;
	applyRageState(true);
};

const exitRage = () => {
	if (!mood.rage) return;
	mood.rage = false;
	mood.rageLevel = 0;
	applyRageState(false);
};

const registerClick = () => {
	const now = performance.now();
	mood.clickTimes.push(now);
	while (mood.clickTimes.length && now - mood.clickTimes[0] > CLICK_WINDOW) {
		mood.clickTimes.shift();
	}

	mood.clickBoost = Math.min(mood.clickBoost + 6, 40);
	mood.clickPulse = 1;

	if (!mood.rage && mood.clickTimes.length >= CLICK_THRESHOLD) {
		enterRage();
	}

	if (mood.rage) {
		mood.rageLevel = Math.min(2.2, mood.rageLevel + 0.35);
		if (mood.rageTimer) clearTimeout(mood.rageTimer);
		mood.rageTimer = setTimeout(exitRage, RAGE_DURATION);
	}
};

window.addEventListener("dragon:click", () => {
	if (!isOverlayActive()) return;
	registerClick();
});

const svgRoot = screen.ownerSVGElement;
if (svgRoot) {
	svgRoot.setAttribute("shape-rendering", "geometricPrecision");
	svgRoot.style.backfaceVisibility = "hidden";
	svgRoot.style.perspective = "1200px";
}

screen.style.filter = "drop-shadow(0 18px 36px rgba(15, 23, 42, 0.22))";
screen.style.mixBlendMode = "screen";
screen.style.opacity = "0.92";
screen.style.willChange = "transform";

const prepend = (use, i) => {
	const elem = document.createElementNS(xmlns, "use");
	elems[i].use = elem;
	elem.setAttributeNS(xlinkns, "xlink:href", "#" + use);
	screen.prepend(elem);
};

const N = 40;

const elems = [];
for (let i = 0; i < N; i++) elems[i] = { use: null, x: width / 2, y: 0 };
const pointer = { x: width / 2, y: height / 2 };
let radm = Math.min(pointer.x, pointer.y) - 20;
let frm = Math.random();
let rad = 0;

for (let i = 1; i < N; i++) {
	if (i === 1) prepend("Cabeza", i);
	else if (i === 8 || i === 14) prepend("Aletas", i);
	else prepend("Espina", i);
}

const run = () => {
	requestAnimationFrame(run);
	const overlay = isOverlayActive();
	const center = { x: width / 2, y: height / 2 };
	radm = Math.max(60, Math.min(pointer.x, pointer.y, width - pointer.x, height - pointer.y) - 20);

	if (!overlay) {
		mood.clickBoost = Math.max(0, mood.clickBoost * 0.92 - 0.05);
		if (mood.rage) exitRage();
	} else {
		mood.clickBoost = Math.max(0, mood.clickBoost * 0.95 - 0.02);
	}

	if (!mood.rage) {
		mood.rageLevel = Math.max(0, mood.rageLevel - 0.02);
	} else {
		mood.rageLevel = Math.min(2.4, mood.rageLevel + 0.01);
	}

	let e = elems[0];
	const excitement = 1 + mood.clickBoost * 0.04 + mood.rageLevel * 0.28;
	const speed = 0.003 * (overlay ? 1.15 : 0.9) * (1 + mood.clickBoost * 0.02 + mood.rageLevel * 0.35);
	const jitterX = mood.rage ? (Math.random() - 0.5) * 80 * (0.4 + mood.rageLevel * 0.4) : (Math.random() - 0.5) * mood.clickBoost * 1.5;
	const jitterY = mood.rage ? (Math.random() - 0.5) * 70 * (0.4 + mood.rageLevel * 0.4) : (Math.random() - 0.5) * mood.clickBoost * 1.2;
	const ax = (Math.cos(3 * frm) * rad * width * excitement) / height + jitterX;
	const ay = (Math.sin(4 * frm) * rad * height * excitement) / width + jitterY;
	e.x += (ax + pointer.x - e.x) / 8;
	e.y += (ay + pointer.y - e.y) / 8;
	for (let i = 1; i < N; i++) {
		let e = elems[i];
		let ep = elems[i - 1];
		const a = Math.atan2(e.y - ep.y, e.x - ep.x);
		const tension = 4 + mood.rageLevel * 1.5;
		e.x += (ep.x - e.x + (Math.cos(a) * (100 - i)) / tension) / 3.8;
		e.y += (ep.y - e.y + (Math.sin(a) * (100 - i)) / tension) / 3.8;
		const pulse = 1 + mood.clickPulse * 0.18 + mood.rageLevel * 0.04;
		const s = ((162 + 4 * (1 - i)) / 50) * pulse;
		e.use.setAttributeNS(
			null,
			"transform",
			`translate(${(ep.x + e.x) / 2},${(ep.y + e.y) / 2}) rotate(${(180 / Math.PI) * a}) translate(${0},${0}) scale(${s},${s})`
		);
	}
	const radialStep = (overlay ? 1.1 : 0.8) + mood.clickBoost * 0.12 + mood.rageLevel * 1.1;
	if (rad < radm) rad = Math.min(radm, rad + radialStep);
	frm += speed;

	mood.clickPulse = Math.max(0, mood.clickPulse - 0.08);

	if (rad > 60 && !overlay) {
		pointer.x += (center.x - pointer.x) * 0.05;
		pointer.y += (center.y - pointer.y) * 0.05;
	}
};

run();