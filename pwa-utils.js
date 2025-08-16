// PWA Utility Functions
class PWAManager {
  constructor() {
    this.deferredPrompt = null
    this.isInstalled = false
    this.registration = null

    this.init()
  }

  async init() {
    // Check if app is installed
    this.checkInstallStatus()

    // Setup install prompt
    this.setupInstallPrompt()

    // Setup service worker messaging
    this.setupServiceWorkerMessaging()

    // Setup network status monitoring
    this.setupNetworkMonitoring()

    // Setup notification permissions
    this.setupNotifications()
  }

  checkInstallStatus() {
    // Check if running as PWA
    if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true) {
      this.isInstalled = true
      console.log("✅ App is running as PWA")
    }
  }

  setupInstallPrompt() {
    window.addEventListener("beforeinstallprompt", (e) => {
      console.log("💾 Install prompt available")
      e.preventDefault()
      this.deferredPrompt = e

      // Show custom install button
      this.showInstallButton()
    })

    window.addEventListener("appinstalled", () => {
      console.log("✅ App installed successfully")
      this.isInstalled = true
      this.deferredPrompt = null
      this.hideInstallButton()
    })
  }

  async promptInstall() {
    if (!this.deferredPrompt) {
      console.log("ℹ️ Install prompt not available")
      return false
    }

    try {
      this.deferredPrompt.prompt()
      const { outcome } = await this.deferredPrompt.userChoice

      if (outcome === "accepted") {
        console.log("✅ User accepted install prompt")
        return true
      } else {
        console.log("❌ User dismissed install prompt")
        return false
      }
    } catch (error) {
      console.error("❌ Install prompt error:", error)
      return false
    } finally {
      this.deferredPrompt = null
    }
  }

  showInstallButton() {
    // Create install button if it doesn't exist
    let installBtn = document.getElementById("pwa-install-btn")
    if (!installBtn) {
      installBtn = document.createElement("button")
      installBtn.id = "pwa-install-btn"
      installBtn.className = "btn btn-primary"
      installBtn.innerHTML = '<i class="fas fa-download"></i> Install App'
      installBtn.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 20px;
        z-index: 1000;
        border-radius: 25px;
        padding: 12px 20px;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(106, 38, 205, 0.3);
      `

      installBtn.addEventListener("click", () => {
        this.promptInstall()
      })

      document.body.appendChild(installBtn)
    }

    installBtn.style.display = "block"
  }

  hideInstallButton() {
    const installBtn = document.getElementById("pwa-install-btn")
    if (installBtn) {
      installBtn.style.display = "none"
    }
  }

  setupServiceWorkerMessaging() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        console.log("📨 Message from service worker:", event.data)

        switch (event.data.type) {
          case "SYNC_SUCCESS":
            this.showNotification("Data synced successfully", "success")
            break
          case "CACHE_UPDATED":
            this.showNotification("App updated in background", "info")
            break
          case "OFFLINE_READY":
            this.showNotification("App ready for offline use", "success")
            break
        }
      })
    }
  }

  setupNetworkMonitoring() {
    // Monitor online/offline status
    window.addEventListener("online", () => {
      console.log("🌐 App is online")
      this.showNotification("Back online - syncing data...", "success")
      this.triggerBackgroundSync()
    })

    window.addEventListener("offline", () => {
      console.log("📱 App is offline")
      this.showNotification("You are offline - data will sync when reconnected", "warning")
    })

    // Initial status
    if (!navigator.onLine) {
      console.log("📱 App started offline")
    }
  }

  async setupNotifications() {
    if (!("Notification" in window)) {
      console.log("ℹ️ Notifications not supported")
      return
    }

    if (Notification.permission === "default") {
      // Don't ask immediately, wait for user interaction
      console.log("ℹ️ Notification permission not requested yet")
    }
  }

  async requestNotificationPermission() {
    if (!("Notification" in window)) {
      return false
    }

    if (Notification.permission === "granted") {
      return true
    }

    if (Notification.permission === "denied") {
      return false
    }

    try {
      const permission = await Notification.requestPermission()
      return permission === "granted"
    } catch (error) {
      console.error("Error requesting notification permission:", error)
      return false
    }
  }

  async triggerBackgroundSync() {
    if ("serviceWorker" in navigator && "sync" in window.ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready
        await registration.sync.register("sync-tournament-data")
        await registration.sync.register("sync-player-data")
        console.log("✅ Background sync triggered")
      } catch (error) {
        console.error("❌ Background sync failed:", error)
      }
    }
  }

  showNotification(message, type = "info") {
    // Create notification element
    const notification = document.createElement("div")
    notification.className = `pwa-notification pwa-notification-${type}`
    notification.style.cssText = `
      position: fixed;
      top: 70px;
      right: 20px;
      background: ${type === "success" ? "#10B981" : type === "warning" ? "#F59E0B" : "#6A26CD"};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 2000;
      font-size: 14px;
      max-width: 300px;
      transform: translateX(100%);
      transition: transform 0.3s ease;
    `
    notification.textContent = message

    document.body.appendChild(notification)

    // Animate in
    setTimeout(() => {
      notification.style.transform = "translateX(0)"
    }, 100)

    // Remove after 4 seconds
    setTimeout(() => {
      notification.style.transform = "translateX(100%)"
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification)
        }
      }, 300)
    }, 4000)
  }

  async shareContent(data) {
    if (navigator.share) {
      try {
        await navigator.share(data)
        return true
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Share failed:", error)
        }
        return false
      }
    }

    // Fallback to clipboard
    if (navigator.clipboard && data.url) {
      try {
        await navigator.clipboard.writeText(data.url)
        this.showNotification("Link copied to clipboard!", "success")
        return true
      } catch (error) {
        console.error("Clipboard write failed:", error)
        return false
      }
    }

    return false
  }

  async checkForUpdates() {
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration()
        if (registration) {
          await registration.update()
          console.log("✅ Checked for updates")
        }
      } catch (error) {
        console.error("❌ Update check failed:", error)
      }
    }
  }

  getInstallationStatus() {
    return {
      isInstalled: this.isInstalled,
      canInstall: !!this.deferredPrompt,
      isOnline: navigator.onLine,
      hasNotifications: "Notification" in window && Notification.permission === "granted",
    }
  }
}

// Initialize PWA Manager
const pwaManager = new PWAManager()

// Make it globally available
window.pwaManager = pwaManager

// Export for module usage
if (typeof module !== "undefined" && module.exports) {
  module.exports = PWAManager
}
