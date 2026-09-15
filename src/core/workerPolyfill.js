// Polyfill for worker environments where 'window' is not defined, 
// which causes issues with certain bundled libraries (like upng-js and imagetracerjs).
self.window = self;
