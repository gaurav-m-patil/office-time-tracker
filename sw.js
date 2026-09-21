const CACHE_NAME = 'time-tracker-v1';
const ASSETS = [
    './index.html',
    './manifest.json',
    'https://fonts.googleapis.com/icon?family=Material+Icons+Round',
    'https://cdn-icons-png.flaticon.com/512/3135/3135695.png'
];

// Install Event: Cache all critical files
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// Fetch Event: Serve from cache if offline
self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});