const CACHE_NAME = "padel-tournament-v2.1.0"
const STATIC_CACHE = "padel-static-v2.1.0"
const DYNAMIC_CACHE = "padel-dynamic-v2.1.0"
const OFFLINE_PAGE = "/offline.html"

// Enhanced caching strategy with critical resources
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/leaderboard.html",
  "/manifest.json",
  "/offline.html",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css",
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js",
]

const DYNAMIC_ASSETS = [
  "https://www.gstatic.com/firebasejs/",
  "https://cdnjs.cloudflare.com/",
  "https://fonts.googleapis.com/",
  "https://fonts.gstatic.com/",
]

// Install event with timeout handling
self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker...")

  event.waitUntil(
    Promise.race([
      // Main installation promise
      caches
        .open(STATIC_CACHE)
        .then((cache) => {
          console.log("[SW] Caching static assets")
          return cache.addAll(
            STATIC_ASSETS.map(
              (url) =>
                new Request(url, {
                  cache: "reload",
                }),
            ),
          )
        })
        .then(() => {
          console.log("[SW] Static assets cached successfully")
          return self.skipWaiting()
        }),

      // Timeout fallback (10 seconds)
      new Promise((resolve, reject) => {
        setTimeout(() => {
          console.log("[SW] Installation timeout, proceeding anyway")
          resolve()
        }, 10000)
      }),
    ]),
  )
})

// Activate event with cleanup
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker...")

  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches
        .keys()
        .then((cacheNames) => {
          return Promise.all(
            cacheNames.map((cacheName) => {
              if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE && cacheName !== CACHE_NAME) {
                console.log("[SW] Deleting old cache:", cacheName)
                return caches.delete(cacheName)
              }
            }),
          )
        }),

      // Take control of all clients
      self.clients.claim(),
    ]),
  )
})

// Enhanced fetch strategy with fallbacks
self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== "GET") {
    return
  }

  // Handle different types of requests
  if (STATIC_ASSETS.some((asset) => request.url.includes(asset))) {
    // Static assets: Cache first
    event.respondWith(cacheFirst(request))
  } else if (DYNAMIC_ASSETS.some((pattern) => request.url.includes(pattern))) {
    // Dynamic assets: Stale while revalidate
    event.respondWith(staleWhileRevalidate(request))
  } else if (request.url.includes("firebase") || request.url.includes("googleapis")) {
    // Firebase/API: Network first with cache fallback
    event.respondWith(networkFirst(request))
  } else if (request.destination === "document") {
    // HTML pages: Network first with offline fallback
    event.respondWith(networkFirstWithOffline(request))
  } else {
    // Everything else: Network first
    event.respondWith(networkFirst(request))
  }
})

// Caching strategies
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request)
    if (cachedResponse) {
      return cachedResponse
    }

    const networkResponse = await fetch(request)
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE)
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch (error) {
    console.error("[SW] Cache first failed:", error)
    return new Response("Offline", { status: 503 })
  }
}

async function networkFirst(request) {
  try {
    const networkResponse = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Network timeout")), 5000)),
    ])

    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE)
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch (error) {
    console.log("[SW] Network failed, trying cache:", error.message)
    const cachedResponse = await caches.match(request)
    return cachedResponse || new Response("Offline", { status: 503 })
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE)
  const cachedResponse = await cache.match(request)

  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone())
      }
      return networkResponse
    })
    .catch(() => cachedResponse)

  return cachedResponse || fetchPromise
}

async function networkFirstWithOffline(request) {
  try {
    const networkResponse = await fetch(request)
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE)
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch (error) {
    const cachedResponse = await caches.match(request)
    if (cachedResponse) {
      return cachedResponse
    }

    // Return offline page for navigation requests
    if (request.mode === "navigate") {
      return (
        caches.match(OFFLINE_PAGE) ||
        new Response("App is offline", {
          status: 503,
          headers: { "Content-Type": "text/html" },
        })
      )
    }

    return new Response("Offline", { status: 503 })
  }
}

// Background sync for tournament data
self.addEventListener("sync", (event) => {
  console.log("[SW] Background sync triggered:", event.tag)

  if (event.tag === "sync-tournament-data") {
    event.waitUntil(syncTournamentData())
  } else if (event.tag === "sync-player-data") {
    event.waitUntil(syncPlayerData())
  }
})

// Push notifications
self.addEventListener("push", (event) => {
  console.log("[SW] Push notification received")

  const options = {
    body: event.data ? event.data.text() : "New tournament update available!",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-72x72.png",
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: "tournament-update",
    },
    actions: [
      {
        action: "view",
        title: "View Tournament",
        icon: "/icons/icon-96x96.png",
      },
      {
        action: "dismiss",
        title: "Dismiss",
        icon: "/icons/icon-96x96.png",
      },
    ],
    requireInteraction: true,
    silent: false,
  }

  event.waitUntil(self.registration.showNotification("Padel Tournament Manager", options))
})

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  console.log("[SW] Notification clicked:", event.action)

  event.notification.close()

  if (event.action === "view") {
    event.waitUntil(clients.openWindow("/"))
  } else if (event.action === "dismiss") {
    // Just close the notification
    return
  } else {
    // Default action
    event.waitUntil(clients.openWindow("/"))
  }
})

// Handle message events
self.addEventListener("message", (event) => {
  console.log("[SW] Message received:", event.data)

  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting()
  } else if (event.data && event.data.type === "GET_VERSION") {
    event.ports[0].postMessage({ version: CACHE_NAME })
  } else if (event.data && event.data.type === "CLEAR_CACHE") {
    event.waitUntil(clearAllCaches())
  }
})

// Periodic background sync (if supported)
self.addEventListener("periodicsync", (event) => {
  console.log("[SW] Periodic sync triggered:", event.tag)

  if (event.tag === "tournament-sync") {
    event.waitUntil(syncTournamentData())
  }
})

// Helper functions
async function syncTournamentData() {
  try {
    console.log("[SW] Syncing tournament data...")

    // Get stored tournament data
    const tournaments = await getStoredData("tournaments")
    if (!tournaments || tournaments.length === 0) {
      console.log("[SW] No tournaments to sync")
      return
    }

    // Attempt to sync with Firebase
    const response = await fetch("/api/sync-tournaments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tournaments),
    })

    if (response.ok) {
      console.log("[SW] Tournament data synced successfully")
      // Notify clients of successful sync
      broadcastMessage({ type: "SYNC_SUCCESS", data: "tournaments" })
    } else {
      throw new Error("Sync failed with status: " + response.status)
    }
  } catch (error) {
    console.error("[SW] Tournament sync failed:", error)
    // Schedule retry
    self.registration.sync.register("sync-tournament-data")
  }
}

async function syncPlayerData() {
  try {
    console.log("[SW] Syncing player data...")

    const players = await getStoredData("players")
    if (!players || players.length === 0) {
      console.log("[SW] No players to sync")
      return
    }

    const response = await fetch("/api/sync-players", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(players),
    })

    if (response.ok) {
      console.log("[SW] Player data synced successfully")
      broadcastMessage({ type: "SYNC_SUCCESS", data: "players" })
    }
  } catch (error) {
    console.error("[SW] Player sync failed:", error)
    self.registration.sync.register("sync-player-data")
  }
}

async function getStoredData(key) {
  return new Promise((resolve) => {
    // This would typically use IndexedDB
    // For now, we'll return empty array
    resolve([])
  })
}

async function clearAllCaches() {
  const cacheNames = await caches.keys()
  await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
  console.log("[SW] All caches cleared")
}

function broadcastMessage(message) {
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage(message)
    })
  })
}

// Error handling
self.addEventListener("error", (event) => {
  console.error("[SW] Service worker error:", event.error)
})

self.addEventListener("unhandledrejection", (event) => {
  console.error("[SW] Unhandled promise rejection:", event.reason)
})

console.log("[SW] Service worker script loaded successfully")
