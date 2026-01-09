// Service Worker para Mapa Interativo - PWA
// Versão: 1.0.0
// =============================================

const CACHE_NAME = 'mapa-interativo-v1.0.0';
const TILES_CACHE_NAME = 'mapbox-tiles-v1';
const STATIC_CACHE_NAME = 'static-assets-v1';

// Recursos estáticos para cache imediato
const STATIC_ASSETS = [
    './',
    './index.html',
    'https://cdn.jsdelivr.net/npm/mapbox-gl@3.4.0/dist/mapbox-gl.min.css',
    'https://cdn.jsdelivr.net/npm/mapbox-gl@3.4.0/dist/mapbox-gl.min.js',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap'
];

// Padrões de URL para cachear tiles do Mapbox
const TILE_URL_PATTERNS = [
    /api\.mapbox\.com\/v4/,
    /api\.mapbox\.com\/styles/,
    /api\.mapbox\.com\/fonts/,
    /tiles\.mapbox\.com/,
    /a\.tiles\.mapbox\.com/,
    /b\.tiles\.mapbox\.com/,
    /c\.tiles\.mapbox\.com/,
    /api\.mapbox\.com\/directions/
];

// =============================================
// INSTALL - Cachear recursos estáticos
// =============================================
self.addEventListener('install', event => {
    console.log('[SW] Instalando Service Worker...');
    self.skipWaiting();

    event.waitUntil(
        caches.open(STATIC_CACHE_NAME).then(cache => {
            console.log('[SW] Cacheando recursos estáticos...');
            // Não cachear fonts do Google (gerenciado separadamente)
            const assetsToCache = STATIC_ASSETS.filter(url => !url.startsWith('https://fonts'));
            return cache.addAll(assetsToCache);
        }).catch(err => {
            console.log('[SW] Erro ao cachear recursos estáticos:', err);
        })
    );
});

// =============================================
// ACTIVATE - Limpar caches antigos
// =============================================
self.addEventListener('activate', event => {
    console.log('[SW] Ativando Service Worker...');

    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // Remover caches de versões antigas
                    if (cacheName !== CACHE_NAME &&
                        cacheName !== TILES_CACHE_NAME &&
                        cacheName !== STATIC_CACHE_NAME) {
                        console.log('[SW] Removendo cache antigo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[SW] Service Worker ativo e controlando a página');
            return self.clients.claim();
        })
    );
});

// =============================================
// FUNÇÕES AUXILIARES
// =============================================

// Verificar se é um tile do Mapbox
function isMapboxTile(url) {
    return TILE_URL_PATTERNS.some(pattern => pattern.test(url));
}

// Verificar se é um recurso estático
function isStaticAsset(url) {
    const staticPatterns = [
        /\.js$/,
        /\.css$/,
        /\.woff2?$/,
        /\.ttf$/,
        /fonts\.googleapis\.com/,
        /fonts\.gstatic\.com/,
        /cdn\.jsdelivr\.net/
    ];
    return staticPatterns.some(pattern => pattern.test(url));
}

// =============================================
// FETCH - Interceptar requisições
// =============================================
self.addEventListener('fetch', event => {
    const url = event.request.url;

    // Ignorar requests que não são GET
    if (event.request.method !== 'GET') {
        return;
    }

    // Ignorar requests para Supabase (dados dinâmicos - gerenciados pelo IndexedDB)
    if (url.includes('supabase.co')) {
        return;
    }

    // =========================================
    // TILES DO MAPBOX - Cache First, Network Update
    // =========================================
    if (isMapboxTile(url)) {
        event.respondWith(
            caches.open(TILES_CACHE_NAME).then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    if (cachedResponse) {
                        // Tile no cache - retorna imediatamente
                        // Atualiza em background (stale-while-revalidate)
                        fetch(event.request).then(networkResponse => {
                            if (networkResponse && networkResponse.ok) {
                                cache.put(event.request, networkResponse);
                            }
                        }).catch(() => {});

                        return cachedResponse;
                    }

                    // Tile não está no cache - busca na rede e cacheia
                    return fetch(event.request).then(networkResponse => {
                        if (networkResponse && networkResponse.ok) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(() => {
                        // Offline e sem cache - retorna resposta vazia
                        return new Response('', {
                            status: 503,
                            statusText: 'Tile not available offline'
                        });
                    });
                });
            })
        );
        return;
    }

    // =========================================
    // RECURSOS ESTÁTICOS - Cache First
    // =========================================
    if (isStaticAsset(url)) {
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(event.request).then(networkResponse => {
                    if (networkResponse && networkResponse.ok) {
                        const responseClone = networkResponse.clone();
                        caches.open(STATIC_CACHE_NAME).then(cache => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return networkResponse;
                });
            })
        );
        return;
    }

    // =========================================
    // HTML E OUTROS - Network First, Cache Fallback
    // =========================================
    event.respondWith(
        fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.ok) {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });
            }
            return networkResponse;
        }).catch(() => {
            return caches.match(event.request).then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Para navegação, retorna a página principal cacheada
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }

                return new Response('Offline', { status: 503 });
            });
        })
    );
});

// =============================================
// MENSAGENS DO CLIENTE
// =============================================
self.addEventListener('message', event => {
    // Skip waiting e atualizar imediatamente
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW] Pulando espera e ativando nova versão...');
        self.skipWaiting();
    }

    // Pre-cache tiles de uma área específica
    if (event.data && event.data.type === 'CACHE_TILES') {
        const { tiles } = event.data;
        if (tiles && Array.isArray(tiles)) {
            console.log('[SW] Cacheando', tiles.length, 'tiles...');
            caches.open(TILES_CACHE_NAME).then(cache => {
                tiles.forEach(tileUrl => {
                    fetch(tileUrl).then(response => {
                        if (response.ok) {
                            cache.put(tileUrl, response);
                        }
                    }).catch(() => {});
                });
            });
        }
    }

    // Retornar informações sobre o cache
    if (event.data && event.data.type === 'GET_CACHE_SIZE') {
        Promise.all([
            caches.open(TILES_CACHE_NAME).then(c => c.keys()),
            caches.open(STATIC_CACHE_NAME).then(c => c.keys()),
            caches.open(CACHE_NAME).then(c => c.keys())
        ]).then(([tiles, staticAssets, main]) => {
            event.ports[0].postMessage({
                tiles: tiles.length,
                static: staticAssets.length,
                main: main.length,
                total: tiles.length + staticAssets.length + main.length
            });
        });
    }

    // Limpar cache de tiles
    if (event.data && event.data.type === 'CLEAR_TILES_CACHE') {
        console.log('[SW] Limpando cache de tiles...');
        caches.delete(TILES_CACHE_NAME).then(() => {
            console.log('[SW] Cache de tiles limpo');
        });
    }
});

console.log('[SW] Service Worker carregado');
