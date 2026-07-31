/* The 5am Club — offline service worker.
   Deploy this file alongside index.html, at the same path.

   Strategy:
   - the page itself: network first, fall back to cache, so a deploy lands
     as soon as you're online but the app still opens with no signal
   - the Firebase SDK from gstatic: cache first, it's versioned and static
   - Firestore traffic (googleapis.com): never touched, it's realtime
*/
var CACHE = '5am-club-v1';
var SHELL = ['./', './index.html'];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c){ return c.addAll(SHELL); })
      .catch(function(){ /* a missing shell entry shouldn't block install */ })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function isHtml(req){
  if (req.mode === 'navigate') return true;
  var a = req.headers.get('accept') || '';
  return a.indexOf('text/html') !== -1;
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch(err){ return; }

  // Realtime sync must always go straight to the network.
  if (url.hostname.indexOf('googleapis.com') !== -1 ||
      url.hostname.indexOf('firebaseio.com') !== -1) return;

  var sameOrigin = url.origin === self.location.origin;
  var isSdk = url.hostname === 'www.gstatic.com';
  if (!sameOrigin && !isSdk) return;

  if (sameOrigin && isHtml(req)){
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
        return res;
      }).catch(function(){
        return caches.match(req).then(function(hit){
          return hit || caches.match('./index.html') || caches.match('./');
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function(hit){
      if (hit) return hit;
      return fetch(req).then(function(res){
        if (res && (res.ok || res.type === 'opaque')){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
