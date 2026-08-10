const THREE = require('three');
const fs = require('fs');

// We need to polyfill DOM for SVGLoader in node
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// We can't easily require SVGLoader if it's an ES module that imports 'three'
// Actually, it's easier to just write an HTML file and run it in the browser subagent.
