// Deliberately empty of caching: this file exists only so Android Chrome offers
// "Install app". Every request goes to the network exactly as without it, so a
// new version of the portal reaches the phone the moment it is deployed.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
